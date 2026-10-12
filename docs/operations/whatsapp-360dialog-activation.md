# WhatsApp activation through 360dialog

This is the plan to take the platform from inert local placeholders to real
WhatsApp delivery. The platform sends through **360dialog**, a Meta Business
Solution Provider that hosts the WhatsApp Cloud API for us, instead of a Meta
developer app of our own. The code is finished and provider-neutral behind
`MessagingProvider`; what remains is 360dialog onboarding, template approval,
webhook registration, and the recorded staging exercise that Stage 10 checklist
item 8.1 requires.

Nothing here needs new application code. Every item is an account action, a
credential, or a configuration value.

## What 360dialog changes, and what it does not

| Concern             | With 360dialog                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Sending             | `POST https://waba-v2.360dialog.io/messages` with a `D360-API-KEY` header. Same Cloud API body.           |
| Credential          | One API key per phone number, issued in the 360dialog Hub. No Meta app, app secret, or System User token. |
| Webhook payload     | Meta's Cloud API format, relayed unchanged. The parser is the same one used for Meta direct.              |
| Webhook auth        | **No signature.** 360dialog sends static headers we register; we require `X-Dawah-Webhook-Token`.         |
| Webhook handshake   | None. The URL is registered through 360dialog's API, not verified with `hub.challenge`.                   |
| Templates           | Still Meta templates, still approved by Meta, managed through the 360dialog Hub or its API.               |
| Message IDs, status | Still Meta's `wamid` IDs and Meta's statuses and error codes.                                             |

The stored provider identity stays `META_WHATSAPP`. It names the network the
message IDs and statuses belong to, not the company carrying the request.

## Phase 0 — Accounts and assets (blocking everything else)

| Asset                            | What it is                                | Notes                                                               |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| 360dialog account                | The provider relationship and its Hub     | Choose the plan; there is a per-number fee on top of Meta's charges |
| Meta Business Account            | The business identity Meta verifies       | Linked during 360dialog's embedded signup; verification takes days  |
| WhatsApp Business Account (WABA) | Holds phone numbers and templates         | Created or connected through 360dialog's embedded signup            |
| Phone number                     | A real number we own                      | Cannot already be on consumer WhatsApp or the WhatsApp Business app |
| 360dialog API key                | The worker's sending credential           | Generated per number in the Hub; store it only in the secret store  |
| Separate staging number          | Keeps staging traffic and templates apart | Each number has its own API key and its own webhook                 |

**Order of work:** 360dialog account → embedded signup (Meta Business + WABA)
→ staging number and API key → templates → webhook → staging exercise →
production number → pilot.

Meta business verification is still the long pole for display-name approval
and higher messaging limits. Everything else can proceed while it is pending.

### The 360dialog sandbox is a smoke test only

360dialog offers a sandbox (`https://waba-sandbox.360dialog.io`) with one fixed
recipient, a 200-message cap, and only its three predefined templates. It can
prove connectivity — set `D360_API_BASE_URL=https://waba-sandbox.360dialog.io/v1`
and the worker posts to `/v1/messages` there — but it cannot send our approved
invitation, reminder, or confirmation templates. The staging exercise in
Phase 5 needs a real number.

## Phase 1 — Message templates

Saudi guests are not existing contacts, so every outbound message is a
**template message** (marketing or utility category) sent outside any customer
service window. Templates need Meta approval, which typically takes minutes to
24 hours, and can be rejected. Submit them in the 360dialog Hub's template
manager; 360dialog forwards them to Meta for review.

The platform stores the approved template name per event template in
`InvitationTemplate.providerTemplateName`, with the ordered variable list in
`variableSchema` and quick-reply buttons in `interactiveComponents`. So the
WhatsApp template and the platform template must be created as a matched pair.

### Templates to create

Three, each in Arabic (`ar`) and English (`en`) — six approvals total.

**1. Invitation** — category: Marketing

- **Header:** Image. The platform sends the invitation artwork as a `link` to a
  signed, expiring URL on our own API, so the header must be declared as an
  image header.
- **Body:** positional variables `{{1}}`, `{{2}}`, … The count and order must
  match the event template's `variableSchema` exactly; the platform fills them
  in that order. Typical set: guest display name, event name, date, time, venue.
- **Buttons:** up to **three** quick replies. The provider rejects more than
  three before contacting 360dialog. These carry the RSVP actions — for example
  "سأحضر" / "لن أتمكن" (attending / not attending).

**2. Reminder** — category: Utility

Same variable discipline. No image header required. Quick replies optional but
recommended, since a reminder that can be answered in one tap converts better.

**3. RSVP confirmation** — category: Utility

- **No header, no buttons.** The platform sends body parameters only.
- Template names are set by environment variable, not per event:
  `META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_AR` and `…_EN`.
- Names must match `^[a-z0-9_]{1,255}$`. Defaults are
  `dawah_rsvp_confirmation_ar` and `dawah_rsvp_confirmation_en`.

### Rules that will cost time if missed

- Variable count mismatch between the WhatsApp template and the platform
  template is a **permanent** send failure, not a retry. Approve the WhatsApp
  template first, then configure the platform template to match it.
- Template names are per-WABA. Staging and production numbers on different
  WABAs need separate approvals.
- Marketing templates can be rate limited by quality score. A low score
  throttles or pauses sending, which matters most on an event night.
- Arabic and English are separate approvals, not one template with two locales.

## Phase 2 — Webhook

360dialog pushes delivery statuses and guest replies to our webhook. Without
it, delivery tracking and WhatsApp RSVP replies do not work at all — sends would
succeed and nothing would ever reconcile.

360dialog does not sign webhook deliveries and does not forward Meta's
`X-Hub-Signature-256`. Instead it stores static headers with the webhook and
sends them on every delivery. The API requires `X-Dawah-Webhook-Token` to equal
`D360_WEBHOOK_TOKEN` (constant-time comparison) and rejects anything else with
`401 WEBHOOK_TOKEN_INVALID`. That token is the only proof of origin, so it must
be high entropy (32+ characters; Render generates it) and travel only over
HTTPS.

Register the webhook once per number, with that number's API key. Read both
secrets from the environment rather than typing them, so they stay out of shell
history:

```bash
curl -sS -X POST https://waba-v2.360dialog.io/v1/configs/webhook \
  -H "D360-API-KEY: $D360_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://<api-host>/api/v1/webhooks/whatsapp\",\"headers\":{\"X-Dawah-Webhook-Token\":\"$D360_WEBHOOK_TOKEN\"}}"
```

Confirm it with `GET https://waba-v2.360dialog.io/v1/configs/webhook` (same
`D360-API-KEY` header). Allow a short delay before the first delivery.

- **URL rules:** HTTPS with a publicly trusted certificate, no underscores in
  the hostname, and no explicit port. `dawah-api-staging.onrender.com` is fine.
- **Latency:** a delivery counts only when we answer `200` within five seconds.
  The endpoint persists and queues before answering and does no reduction
  inline, so it stays well inside that.
- **Retries:** a rejected delivery is retried with backoff for days, so a brief
  token mismatch during rotation is recovered, not lost.
- **Phone-number filter (optional):** set `META_WHATSAPP_PHONE_NUMBER_ID` to the
  `metadata.phone_number_id` seen in the first delivery. Items for any other
  number are then skipped and counted in the `whatsapp.webhook.items_skipped`
  log. Leave it empty until you have the value; a wrong value silently drops
  every status and reply.

## Phase 3 — Media

The invitation image is **fetched by Meta from our API**, not uploaded.
`META_WHATSAPP_MEDIA_PUBLIC_BASE_URL` must be the deployment's own public API
base, ending in `/api/v1`, reachable over HTTPS.

The URL handed to 360dialog is signed and expiring
(`META_WHATSAPP_MEDIA_SIGNING_SECRET`, `META_WHATSAPP_MEDIA_URL_TTL_SECONDS`,
default 15 minutes) and checksum-bound. If the TTL is shorter than the time a
batch spends queued, the fetch fails and sends fail with it — so do not lower
it without checking backlog age under load.

## Phase 4 — Configuration

Fill these in the staging secret store, then production. Startup validation
rejects placeholders, so a partially filled environment fails loudly at boot
rather than half-working. `D360_*` are the 360dialog transport settings;
`META_WHATSAPP_*` are WhatsApp-level settings that would not change with a
different provider.

| Variable                                              | Service | Source                    | Notes                                 |
| ----------------------------------------------------- | ------- | ------------------------- | ------------------------------------- |
| `D360_API_KEY`                                        | Worker  | 360dialog Hub, per number | Required when deployed                |
| `D360_API_BASE_URL`                                   | Worker  | Default                   | `https://waba-v2.360dialog.io`        |
| `D360_WEBHOOK_TOKEN`                                  | API     | We generate               | 32+ characters; registered in Phase 2 |
| `META_WHATSAPP_PHONE_NUMBER_ID`                       | API     | First webhook delivery    | Optional filter; empty disables it    |
| `META_WHATSAPP_MEDIA_PUBLIC_BASE_URL`                 | Both    | Our deployment            | Must end `/api/v1`                    |
| `META_WHATSAPP_MEDIA_SIGNING_SECRET`                  | Both    | We generate               | 32+ characters                        |
| `META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_AR` / `_EN` | Both    | Approved names            | `^[a-z0-9_]+$`                        |
| `META_WHATSAPP_REQUEST_TIMEOUT_MS`                    | Worker  | Default 10000             |                                       |
| `META_WHATSAPP_SEND_CONCURRENCY`                      | Worker  | Default 4                 | Keep inside the number's throughput   |
| `META_WHATSAPP_MAX_SENDS_PER_SECOND`                  | Worker  | Default 10                | Raise only with a known tier          |
| `META_WHATSAPP_MAX_ATTEMPTS`                          | Both    | Default 5                 |                                       |

`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_APP_SECRET`,
`META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and `META_WHATSAPP_GRAPH_API_VERSION` are
no longer read. Delete them from the secret store once 360dialog is live.

## Phase 5 — Staging acceptance exercise

This is Stage 10 checklist item 8.1. Record evidence without retaining guest
personal data or credentials.

1. Use the staging number connected through 360dialog, and a team handset as
   the recipient.
2. Send one invitation through the real host flow. Confirm: the message arrives,
   the image header renders, and the variables are in the right order.
3. Confirm the delivery status callbacks arrive and the dashboard moves through
   sent → delivered → read.
4. Tap a quick-reply button. Confirm the RSVP is recorded, deduplicated, and
   the confirmation message is sent back exactly once.
5. Edit the RSVP from the host side and confirm the counts reconcile.
6. Replay a webhook to confirm deduplication, send an out-of-order status to
   confirm it does not overwrite a newer state, and send one request with a
   wrong `X-Dawah-Webhook-Token` to confirm it is rejected with `401`.
7. Record: template names and versions, message ids, timestamps, and the
   observed `dawah_provider_requests_total` outcome mix. No phone numbers.

## Phase 6 — Production

- Connect the production number through 360dialog, set its display name, and
  submit templates on the production WABA.
- Generate the production API key and webhook token; never reuse staging's.
- Register the production webhook against the production API.
- Start the pilot with the events and thresholds in
  [`release-and-rollback.md`](release-and-rollback.md).

## Risks worth pricing in now

| Risk                            | Impact                                      | Mitigation                                                                    |
| ------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Business verification is slow   | Display name and limits stay restricted     | Start immediately; build on the staging number meanwhile                      |
| Template rejection              | Delays launch per template                  | Submit early; keep wording plain and non-promotional                          |
| Quality-score throttling        | Sends pace or pause on event night          | Backlog-age alerting is already in place; keep opt-out clear                  |
| Two vendors in the path         | A 360dialog outage stops sends and webhooks | Follow `runbooks/provider-outage.md`; webhooks are retried after recovery     |
| Unsigned webhooks               | A leaked token allows forged statuses       | 32+ character token, HTTPS only, rotate per `runbooks/credential-rotation.md` |
| Per-number and per-message cost | Cost scales with numbers and guests         | Model 360dialog's fee plus Meta's charges before pricing an event             |
| Number cannot be reused         | A number already on WhatsApp is rejected    | Choose a clean number early                                                   |
| Media TTL too short             | Sends fail on a large queued batch          | Validate TTL against backlog age under load                                   |
