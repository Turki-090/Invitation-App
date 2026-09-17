# Meta WhatsApp activation plan

This is the plan to take the platform from inert local placeholders to real
WhatsApp delivery. The code is finished and provider-neutral behind
`MessagingProvider`; what remains is Meta account setup, template approval, and
the recorded staging exercise that Stage 10 checklist item 8.1 requires.

Nothing here needs new application code. Every item is an account action, a
credential, or a configuration value.

## Phase 0 — Accounts and assets (blocking everything else)

| Asset                            | What it is                                       | Notes                                                           |
| -------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| Meta Business Account            | The business identity Meta verifies              | Business verification takes days to weeks; start first          |
| WhatsApp Business Account (WABA) | Holds phone numbers and templates                | Created inside the Business Account                             |
| Meta App                         | Provides the App Secret and webhook subscription | Add the "WhatsApp" product to it                                |
| Test phone number                | Meta's free sandbox number                       | Available immediately; limited to 5 pre-registered recipients   |
| Production phone number          | A real number you own                            | Cannot already be on consumer WhatsApp or WhatsApp Business app |
| System User token                | Long-lived access token                          | Never use a temporary 24-hour token outside a first smoke test  |
| Payment method on the WABA       | Required to send outside the free tier           | Conversations are billed per 24-hour window                     |

**Order of work:** Business verification → WABA → test number → templates →
staging exercise → production number → pilot.

Business verification is the long pole. Everything else can be built against the
test number while it is pending.

## Phase 1 — Message templates

Saudi guests are not existing contacts, so every outbound message is a
**template message** (marketing or utility category) sent outside any customer
service window. Templates need Meta approval, which typically takes minutes to
24 hours, and can be rejected.

The platform stores the approved Meta template name per event template in
`InvitationTemplate.providerTemplateName`, with the ordered variable list in
`variableSchema` and quick-reply buttons in `interactiveComponents`. So the
Meta-side template and the platform-side template must be created as a matched
pair.

### Templates to create

Three, each in Arabic (`ar`) and English (`en`) — six approvals total.

**1. Invitation** — category: Marketing

- **Header:** Image. The platform sends the invitation artwork as a
  `link` to a signed, expiring URL on our own API, so the header must be
  declared as an image header.
- **Body:** positional variables `{{1}}`, `{{2}}`, … The count and order must
  match the event template's `variableSchema` exactly; the platform fills them
  in that order. Typical set: guest display name, event name, date, time, venue.
- **Buttons:** up to **three** quick replies. The provider rejects more than
  three before contacting Meta. These carry the RSVP actions — for example
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

- Variable count mismatch between the Meta template and the platform template is
  a **permanent** send failure, not a retry. Approve the Meta template first,
  then configure the platform template to match it.
- Template names are per-WABA. Staging and production numbers on different WABAs
  need separate approvals.
- Marketing templates can be rate limited by quality score. A low score throttles
  or pauses sending, which matters most on an event night.
- Arabic and English are separate approvals, not one template with two locales.

## Phase 2 — Webhook

Meta pushes delivery statuses and guest replies to our webhook. Without it,
delivery tracking and WhatsApp RSVP replies do not work at all — sends would
succeed and nothing would ever reconcile.

- **Callback URL:** `https://<api-host>/api/v1/webhooks/whatsapp`
- **Verify token:** `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` — any high-entropy
  string we choose; Meta echoes it during subscription.
- **Subscribe to fields:** `messages` (covers both inbound replies and delivery
  status callbacks).
- **Signature:** the platform verifies `X-Hub-Signature-256` against the App
  Secret with a constant-time comparison on the raw body, and rejects anything
  unverified. The App Secret must be the one from the same Meta App.

The URL must be publicly reachable over HTTPS. Meta will not deliver to a
localhost or self-signed endpoint.

## Phase 3 — Media

The invitation image is **fetched by Meta from our API**, not uploaded to Meta.
`META_WHATSAPP_MEDIA_PUBLIC_BASE_URL` must be the deployment's own public API
base, ending in `/api/v1`, reachable from Meta's servers over HTTPS.

The URL handed to Meta is signed and expiring
(`META_WHATSAPP_MEDIA_SIGNING_SECRET`, `META_WHATSAPP_MEDIA_URL_TTL_SECONDS`,
default 15 minutes) and checksum-bound. If the TTL is shorter than the time a
batch spends queued, Meta's fetch fails and sends fail with it — so do not lower
it without checking backlog age under load.

## Phase 4 — Configuration

Fill these in the staging secret store, then production. Startup validation
rejects placeholders, so a partially filled environment fails loudly at boot
rather than half-working.

| Variable                                              | Source                 | Notes                              |
| ----------------------------------------------------- | ---------------------- | ---------------------------------- |
| `META_WHATSAPP_ACCESS_TOKEN`                          | System User token      | Worker only                        |
| `META_WHATSAPP_PHONE_NUMBER_ID`                       | WhatsApp → API Setup   | Numeric id, not the phone number   |
| `META_WHATSAPP_APP_SECRET`                            | App → Settings → Basic | API only; verifies webhooks        |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`                  | We choose              | Must match what is entered in Meta |
| `META_WHATSAPP_MEDIA_PUBLIC_BASE_URL`                 | Our deployment         | Must end `/api/v1`                 |
| `META_WHATSAPP_MEDIA_SIGNING_SECRET`                  | We generate            | 32+ characters                     |
| `META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_AR` / `_EN` | Approved names         | `^[a-z0-9_]+$`                     |
| `META_WHATSAPP_GRAPH_API_VERSION`                     | Default `v25.0`        | Pin deliberately                   |
| `META_WHATSAPP_SEND_CONCURRENCY`                      | Default 4              | Keep inside Meta's limits          |
| `META_WHATSAPP_MAX_SENDS_PER_SECOND`                  | Default 10             | Raise only with a known tier       |
| `META_WHATSAPP_MAX_ATTEMPTS`                          | Default 5              |                                    |

## Phase 5 — Staging acceptance exercise

This is Stage 10 checklist item 8.1. Record evidence without retaining guest
personal data or credentials.

1. Register a recipient number on the Meta test number's allow-list.
2. Send one invitation through the real host flow. Confirm: the message arrives,
   the image header renders, and the variables are in the right order.
3. Confirm the delivery status callbacks arrive and the dashboard moves through
   sent → delivered → read.
4. Tap a quick-reply button. Confirm the RSVP is recorded, deduplicated, and
   the confirmation message is sent back exactly once.
5. Edit the RSVP from the host side and confirm the counts reconcile.
6. Replay a webhook to confirm deduplication, and send an out-of-order status to
   confirm it does not overwrite a newer state.
7. Record: template names and versions, message ids, timestamps, and the
   observed `dawah_provider_requests_total` outcome mix. No phone numbers.

## Phase 6 — Production

- Register and verify the production phone number, set its display name, and
  submit templates on the production WABA.
- Attach a payment method and confirm the messaging tier.
- Point the production webhook at the production API.
- Start the pilot with the events and thresholds in
  [`release-and-rollback.md`](release-and-rollback.md).

## Risks worth pricing in now

| Risk                          | Impact                                   | Mitigation                                                                  |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| Business verification is slow | Blocks production entirely               | Start immediately; build on the test number                                 |
| Template rejection            | Delays launch per template               | Submit early; keep wording plain and non-promotional                        |
| Quality-score throttling      | Sends pace or pause on event night       | Backlog-age alerting is already in place; keep opt-out clear                |
| Per-conversation billing      | Cost scales with guest count             | Model cost per event before pricing; the credit ledger already meters sends |
| Number cannot be reused       | A number already on WhatsApp is rejected | Choose a clean number early                                                 |
| Media TTL too short           | Sends fail on a large queued batch       | Validate TTL against backlog age under load                                 |
