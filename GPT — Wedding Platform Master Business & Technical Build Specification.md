# GPT  — Master Build Specification

## Wedding Invitation & Event Attendance Platform

You are the **founding product engineer, software architect, backend engineer, frontend engineer, security engineer, database architect, DevOps engineer, QA engineer, and mobile architecture lead** for this project.

Your responsibility is not to create a prototype.

Your responsibility is to turn the supplied Wedding Invitations design system and product specification into a **real production-capable SaaS platform**, while keeping the architecture ready for future native:

- iOS application using Swift + SwiftUI
- Android application using Kotlin + Jetpack Compose

The first production product is a responsive web application.

Native apps will primarily serve:

- Event owners
- Co-hosts
- Event planners
- Check-in staff

Guests must **never be required to install an app**.

The guest experience remains:

**WhatsApp → RSVP → optional lightweight web invitation → event**

---

# 1. Product mission

Build the easiest way in Saudi Arabia and the GCC to manage wedding and private-event invitations at scale.

A host should be able to:

1. Create an event.
2. Add/import hundreds of invitations.
3. Define exactly who each invitation includes.
4. Send invitations through WhatsApp.
5. Let recipients Accept or Decline with minimal friction.
6. Track sent/delivered/read/responded states.
7. Track actual expected headcount.
8. Send reminders.
9. Add co-hosts.
10. Export attendance information.
11. Eventually scan QR passes at the event.
12. Eventually manage everything from native iPhone and Android applications.

The fundamental product promise is:

> Hosts can manage hundreds or thousands of invitations from one clean system, while guests can respond in seconds without accounts, passwords, downloads, or complicated forms.

---

# 2. Existing design system

The project already contains a Wedding Invitations Design System.

Treat it as the visual source of truth.

It currently contains:

- Design tokens
- Colors
- Typography
- RTL rules
- Spacing
- Radius
- Motion
- Elevation
- React JSX components
- Host application UI examples
- Guest invitation examples
- Event dashboard example

Existing component categories include:

### Actions

- Button
- IconButton
- RsvpButton

### Forms

- FormField
- Input
- PhoneInput
- Select
- Textarea
- Checkbox
- Switch
- Stepper

### Data

- Card
- StatCard
- DataTable
- ProgressMeter

### Status

- StatusBadge
- Badge
- GuestTypeTag
- Avatar

### Navigation

- Tabs
- SegmentedControl
- SideNav

### Feedback

- Dialog
- Toast
- EmptyState

Do not discard this system and replace it with generic shadcn styling.

Productionize it.

Convert reusable components to TypeScript and preserve its visual identity.

---

# 3. Mandatory architectural principle

## API FIRST

This is the most important engineering decision.

The backend must exist independently of Next.js.

Do NOT put essential business logic exclusively inside:

- Next.js Server Actions
- React components
- Next.js route handlers
- browser state
- Supabase client queries
- web-only utilities

The architecture must be:

```text
                    ┌─────────────────────┐
                    │   Next.js Web App   │
                    └──────────┬──────────┘
                               │
                               │ HTTPS / JSON
                               ▼
                    ┌─────────────────────┐
                    │ Versioned REST API  │
                    │      /api/v1       │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │             │
                 ▼             ▼             ▼
            PostgreSQL       Redis       Object Storage
                 │             │
                 │             ▼
                 │        Background Worker
                 │             │
                 │             ▼
                 │       WhatsApp Cloud API
                 │
                 ▼
              Audit Log
```

Later:

```text
       Next.js Web
            │
            │
       SwiftUI iOS ─────────┐
            │               │
       Kotlin Android ──────┼──► SAME REST API
                            │
       Check-in App ────────┘
```

The native apps must not require a backend rewrite.

---

# 4. Recommended production stack

## Monorepo

Use:

**pnpm + Turborepo**

Recommended structure:

```text
/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── ui/
│   ├── design-tokens/
│   ├── api-contract/
│   ├── domain/
│   ├── config/
│   ├── eslint-config/
│   └── typescript-config/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── fixtures/
│
├── openapi/
│   └── openapi.yaml
│
├── docs/
│   ├── architecture/
│   ├── business/
│   ├── security/
│   ├── mobile/
│   └── adr/
│
└── .github/
    └── workflows/
```

---

# 5. Web technology

## Language

**TypeScript**

Use:

```text
strict: true
```

Avoid `any`.

Business types should be explicit.

---

## Framework

**Next.js using App Router**

Use Next.js for:

- Host dashboard
- Authentication pages
- Event onboarding
- Guest management
- Invitation designer
- Reports
- Account pages
- Public guest invitation pages

Use Server Components where appropriate for rendering.

Use Client Components only when actual browser interactivity is necessary.

But again:

**Next.js is a frontend/client of the business API, not the system's source of business logic.**

---

# 6. React architecture

Use:

- React
- TypeScript
- React Hook Form
- Zod
- TanStack Query where client-side asynchronous state is beneficial

Do not put server data permanently into giant global stores.

Local UI state:

React state.

Complex client-only state:

Zustand if genuinely necessary.

Server state:

TanStack Query.

Forms:

React Hook Form + Zod.

---

# 7. Styling

Do not throw away the provided CSS design system.

Transform the current tokens into a platform-neutral token system.

Create:

```text
packages/design-tokens/
```

Canonical format:

```text
tokens.json
```

For example:

```json
{
  "color": {
    "paper": {
      "value": "#FBF9F6"
    },
    "ink": {
      "value": "#17140F"
    },
    "gold": {
      "value": "#9A7642"
    }
  }
}
```

Use **Style Dictionary or an equivalent token compiler** to generate:

### Web

```text
tokens.css
```

### iOS

```text
WeddingColors.swift
WeddingSpacing.swift
WeddingTypography.swift
```

### Android

```text
WeddingColors.kt
WeddingDimensions.kt
WeddingTypography.kt
```

This allows the same visual foundations to exist across all three platforms.

---

# 8. Web component architecture

Create:

```text
packages/ui
```

Convert current JSX components to:

```text
.tsx
```

Components must support:

- RTL
- LTR
- keyboard navigation
- visible focus
- accessibility
- loading
- disabled
- errors
- destructive states

Use accessible headless primitives such as Radix only where behavior is difficult to implement correctly.

Do not import an external visual language over the existing product.

---

# 9. Backend language

Use:

**TypeScript + Node.js**

Framework:

**NestJS**

Reasons:

- Structured modules
- Dependency injection
- Guards
- Background job integration
- Testing
- Validation
- REST architecture
- OpenAPI generation
- Good separation between domains

---

# 10. API style

Use:

**REST + JSON + OpenAPI**

Not GraphQL for MVP.

Base path:

```text
/api/v1
```

Examples:

```text
GET    /api/v1/events
POST   /api/v1/events

GET    /api/v1/events/:eventId
PATCH  /api/v1/events/:eventId

GET    /api/v1/events/:eventId/invitations
POST   /api/v1/events/:eventId/invitations

GET    /api/v1/events/:eventId/invitations/:invitationId

POST   /api/v1/events/:eventId/invitations/send
POST   /api/v1/events/:eventId/reminders/send

GET    /api/v1/events/:eventId/reports/rsvp

POST   /api/v1/events/:eventId/check-ins

POST   /api/v1/webhooks/whatsapp
```

Generate a complete OpenAPI document.

The OpenAPI specification becomes a critical project asset.

---

# 11. Why OpenAPI is mandatory

The API specification must later generate typed clients for:

### TypeScript

Web.

### Swift

iOS.

### Kotlin

Android.

Use automated client generation where practical.

The objective is:

```text
Backend changes API
        ↓
OpenAPI regenerated
        ↓
TypeScript client
Swift client
Kotlin client
        ↓
Compile-time incompatibility detection
```

This prevents native apps from developing a completely separate interpretation of the backend.

---

# 12. Database

Use:

**PostgreSQL**

Recommended initial managed platform:

**Supabase PostgreSQL**

But do not tightly couple the application domain to Supabase-specific APIs.

Use Supabase primarily as managed infrastructure for:

- PostgreSQL
- Authentication if appropriate
- Object storage
- backups/infrastructure conveniences

Clients should still interact primarily through the NestJS API.

The application should remain portable to another managed PostgreSQL environment.

---

# 13. ORM

Use:

**Prisma ORM**

Use real database migrations.

Never use:

```text
db push
```

as the production migration strategy.

Production schema changes require reviewed migrations.

---

# 14. Primary domain model

The conceptual entities are:

```text
User
Event
EventMembership
InvitationGroup
GuestMember
InvitationTemplate
Message
MessageAttempt
RSVP
RSVPMember
ReminderRule
ReminderRun
ImportJob
ImportRow
CheckIn
AuditLog
WebhookEvent
CreditLedger
Asset
Notification
```

---

# 15. Users

`users`

Representative fields:

```text
id
auth_provider_id
display_name
email
phone_e164
preferred_locale
timezone
created_at
updated_at
```

Do not store passwords yourself.

---

# 16. Events

`events`

Fields:

```text
id
owner_user_id
name_ar
name_en
event_type
event_date
start_time
end_time
timezone
venue_name_ar
venue_name_en
city
latitude
longitude
map_url
rsvp_deadline
allow_rsvp_edits
qr_enabled
status
created_at
updated_at
archived_at
```

Event statuses:

```text
DRAFT
ACTIVE
RSVP_OPEN
RSVP_CLOSED
EVENT_DAY
COMPLETED
ARCHIVED
```

---

# 17. Event membership

Do not put:

```text
is_admin
```

on the user.

Roles belong to the relationship between a user and an event.

`event_memberships`

```text
id
event_id
user_id
role
status
permissions_json
invited_by
created_at
accepted_at
```

Roles:

```text
OWNER
CO_HOST
CHECK_IN_STAFF
```

---

# 18. Permissions

Support capabilities such as:

```text
event.view
event.edit

guest.view
guest.phone.view
guest.create
guest.edit
guest.delete
guest.import
guest.export

invitation.send
invitation.resend

reminder.send

rsvp.edit

reports.view

checkin.use

team.manage

billing.manage

event.archive
event.delete
```

Owner bypasses normal role checks where appropriate.

Use a central authorization service.

Do not scatter permission logic throughout controllers.

---

# 19. Invitation Group

This is the most important database entity.

`invitation_groups`

Example:

```text
id
event_id
display_name
contact_name
phone_e164
phone_country
invitation_type
max_companions
internal_note
rsvp_status
message_status
expected_attendees
created_by
created_at
updated_at
cancelled_at
```

Invitation types:

```text
SINGLE
NAMED_GROUP
PRIMARY_WITH_COMPANIONS
```

---

# 20. Guest Member

`guest_members`

Used for known/named individuals.

```text
id
invitation_group_id
name
position
is_primary
created_at
updated_at
```

---

# 21. Invitation business invariants

These invariants must be enforced server-side.

## SINGLE

Exactly one named member.

Maximum attendance:

```text
1
```

---

## NAMED_GROUP

One or more named members.

Maximum attendance:

```text
number of guest_members
```

Guest selects which named members attend.

---

## PRIMARY_WITH_COMPANIONS

Exactly one named primary guest.

`max_companions >= 0`

Maximum attendance:

```text
1 + max_companions
```

Companions do not require names.

---

# 22. RSVP states

Invitation-group RSVP state:

```text
PENDING
ACCEPTED
PARTIALLY_ACCEPTED
DECLINED
```

Do not create redundant states such as:

```text
NOT_REPLIED
WAITING
NO_REPLY
```

Use `PENDING`.

---

# 23. RSVP calculation

Business logic must live inside the domain layer.

## Single

```text
attending = 0 → DECLINED
attending = 1 → ACCEPTED
```

## Named Group

```text
0 attending
→ DECLINED

all attending
→ ACCEPTED

between 1 and total - 1
→ PARTIALLY_ACCEPTED
```

## Primary + Companions

```text
0
→ DECLINED

1 ... max
→ ACCEPTED
```

No partial state is necessary for unnamed companion invitations.

---

# 24. Never confuse invitations with people

This rule applies to every query, API and screen.

Example:

```text
Invitation groups: 450
Named people: 620
Expected attendance: 497
```

Do not expose:

```text
guests: 450
```

without defining what it means.

API responses should use explicit names.

Good:

```json
{
  "invitationGroupCount": 450,
  "namedGuestCount": 620,
  "expectedAttendeeCount": 497
}
```

---

# 25. WhatsApp architecture

Primary messaging provider:

# Meta WhatsApp Cloud API

Integrate directly with Meta where practical.

Do not make Twilio the core dependency unless a commercial/operational reason later justifies it.

Create a provider abstraction:

```ts
interface MessagingProvider {
  sendInvitation(...): Promise<ProviderMessageResult>;
  sendReminder(...): Promise<ProviderMessageResult>;
  sendConfirmation(...): Promise<ProviderMessageResult>;
}
```

Initial implementation:

```text
MetaWhatsAppProvider
```

This allows future:

```text
TwilioWhatsAppProvider
OtherProvider
```

without replacing domain logic.

---

# 26. WhatsApp responsibilities

Backend must support:

- Approved WhatsApp message templates
- Template variables
- Arabic templates
- English templates
- Invitation messages
- Reminder messages
- RSVP confirmation messages
- Entry-pass messages
- Interactive reply actions where supported
- Delivery webhooks
- Read webhooks
- Response webhooks
- Failure webhooks

---

# 27. WhatsApp message lifecycle

Keep message delivery state separate from RSVP.

Message lifecycle:

```text
DRAFT
READY
QUEUED
SENT
DELIVERED
READ
RESPONDED
FAILED
CANCELLED
```

The database should not assume status events arrive in perfect order.

Provider webhooks can:

- arrive late
- arrive more than once
- occasionally arrive out of expected ordering

Build accordingly.

---

# 28. Webhook architecture

Endpoint:

```text
POST /api/v1/webhooks/whatsapp
```

Webhook handler should:

1. Verify provider authenticity/signature.
2. Validate payload.
3. Persist webhook event identifier.
4. Detect duplicate webhook.
5. Return success quickly.
6. Send processing to queue.
7. Update relevant message/RSVP asynchronously.
8. Record relevant audit activity.
9. Never double-apply an RSVP.

Create:

`webhook_events`

```text
id
provider
provider_event_id
event_type
payload
received_at
processed_at
processing_error
```

Unique constraint:

```text
(provider, provider_event_id)
```

where possible.

---

# 29. Idempotency

Idempotency is mandatory.

Examples:

A user double-clicks:

```text
Send 400 invitations
```

This must not send 800 messages.

Support an:

```text
Idempotency-Key
```

header on high-impact mutation endpoints.

Store request/result for an appropriate TTL.

Use database uniqueness constraints as additional safety.

---

# 30. Background jobs

Use:

**Redis + BullMQ**

Create separate worker process:

```text
apps/worker
```

Do not process large send batches inside an HTTP request.

Queues might include:

```text
whatsapp-send
whatsapp-webhook
reminders
imports
exports
notifications
event-maintenance
```

---

# 31. Invitation sending workflow

When host presses:

```text
Send 400 invitations
```

Do:

```text
API validates permission
        ↓
API validates invitation readiness
        ↓
Create Send Batch
        ↓
Queue individual messages
        ↓
Respond immediately
        ↓
Worker sends gradually
        ↓
Store Meta message IDs
        ↓
Webhooks update delivery states
```

The browser should show progress.

Never keep the original HTTP request open while hundreds of messages are sent.

---

# 32. Retries

Retry temporary problems.

Do not blindly retry permanent failures.

Examples:

### Retry

- provider timeout
- rate-limited response
- temporary network failure
- transient provider error

### Do not automatically retry

- invalid phone number
- invalid template
- revoked number
- malformed destination

Use:

- exponential backoff
- bounded retries
- dead-letter/error state

---

# 33. Reminder engine

Reminder rules belong to the backend.

Example:

```text
Initial invitation
       ↓
No RSVP after 3 days
       ↓
First reminder
       ↓
Still pending
       ↓
2 days before deadline
       ↓
Final reminder
```

Never remind:

```text
ACCEPTED
PARTIALLY_ACCEPTED
DECLINED
CANCELLED
```

Avoid repeated reminders within a configurable cooldown.

---

# 34. Guests without accounts

Guests do NOT use authentication accounts.

Never create 600 user accounts for 600 guests.

Use secure public invitation capabilities.

Example:

```text
https://domain.com/i/{secure-token}
```

Token requirements:

- cryptographically random
- high entropy
- impossible to enumerate
- revocable
- optionally expirable

Store token hash rather than raw token where practical.

The token identifies authorization to access exactly one invitation.

It must not grant access to the host dashboard or other invitations.

---

# 35. Public guest API

Example:

```text
GET /api/v1/public/invitations/:token
```

Returns only information required by the recipient.

Not:

- internal notes
- host billing
- other guests
- phone lists
- co-host information

Submit RSVP:

```text
POST /api/v1/public/invitations/:token/rsvp
```

Rate-limit public endpoints.

---

# 36. RSVP audit trail

Never simply overwrite RSVP information without history.

Record:

```text
previous_status
new_status
previous_count
new_count
source
actor
timestamp
```

Sources:

```text
WHATSAPP
GUEST_WEB
HOST_MANUAL
SYSTEM
```

Example:

```text
Mohammed accepted with 3 attendees
Guest changed to 2 attendees
Host manually changed to 3
```

---

# 37. Message model

`messages`

```text
id
event_id
invitation_group_id
provider
provider_message_id
message_type
template_id
locale
status
queued_at
sent_at
delivered_at
read_at
responded_at
failed_at
failure_code
failure_reason
created_at
```

Message types:

```text
INVITATION
REMINDER
RSVP_CONFIRMATION
ENTRY_PASS
MANUAL
```

---

# 38. Phone number rules

Store normalized numbers in:

**E.164**

Examples:

```text
+9665XXXXXXXX
+9715XXXXXXXX
+965XXXXXXXX
```

Default UI country may be Saudi Arabia.

But architecture must support the GCC.

Use a mature phone parser library.

Do not implement phone parsing with regex alone.

Preserve:

```text
phone_e164
country_code
```

Phone numbers always remain visually LTR even in Arabic UI.

---

# 39. Duplicate handling

Duplicate phone numbers should not silently create duplicate invitations.

Within an event:

Show warning.

Possible legitimate case:

Two genuinely separate invitation groups share one family contact number.

Therefore:

Do not blindly enforce a global unique DB constraint.

Instead implement:

```text
duplicate detection + explicit host override
```

Record override in audit history.

---

# 40. Excel import

Use background processing for large files.

Supported:

```text
.xlsx
.csv
```

Workflow:

```text
Upload
→ Parse
→ Column mapping
→ Validate
→ Review errors
→ Confirm
→ Import
```

Create:

`import_jobs`

and:

`import_rows`

This allows users to fix invalid entries without uploading the entire file again.

---

# 41. Import validations

Check:

- required name
- phone normalization
- unsupported country
- duplicate within file
- duplicate in event
- invalid invitation type
- invalid companion count
- empty family members
- malformed rows

Return row-specific errors.

Do not simply display:

```text
Import failed.
```

---

# 42. Authentication

Host/co-host authentication should be passwordless where practical.

Possible mechanisms:

- email OTP
- phone OTP
- magic link

Do not implement authentication cryptography yourself.

Use a mature managed identity provider.

Supabase Auth is acceptable for MVP.

Backend verifies authenticated JWTs.

Guests remain accountless.

---

# 43. Native-app authentication compatibility

Never design host authentication in a way that only works through browser cookies.

The backend must support standard secure mobile authentication.

Native clients eventually store refresh/session credentials using:

### iOS

Keychain.

### Android

Keystore-backed secure storage.

No auth token belongs in:

```text
UserDefaults
plain SharedPreferences
source code
```

---

# 44. Saudi/GCC privacy

Treat:

- names
- phone numbers
- RSVP decisions
- attendance information
- location/event association

as personal data.

Architecture must account for Saudi PDPL obligations.

Engineering requirements include:

- data minimization
- purpose limitation
- privacy notice
- defined retention
- deletion workflows
- export/access processes when applicable
- access logging
- role-based access
- secure backups
- vendor/processor inventory
- documented data locations
- documented international transfers
- incident response

Do not assume a foreign cloud region is automatically suitable.

Before production deployment, document where:

```text
database
backups
logs
analytics
WhatsApp-related information
email provider information
error monitoring information
object storage
```

are physically processed.

The hosting choice must be reviewed against applicable Saudi data-transfer requirements.

This is an engineering requirement, not an afterthought.

---

# 45. Sensitive-field strategy

Phone numbers require special attention.

At minimum:

- TLS in transit
- managed encryption at rest
- tightly restricted production access
- secret management
- no PII in application logs

For higher assurance, consider:

```text
encrypted_phone
phone_lookup_hash
phone_last4
```

using application-managed/envelope encryption.

Do not expose full phone numbers to check-in staff unless permission allows it.

---

# 46. Logging rule

Never casually log:

```text
full guest name
full phone number
invitation URL token
WhatsApp access token
auth JWT
OTP
```

Use structured logging.

Example:

```json
{
  "event": "whatsapp.message.failed",
  "eventId": "...",
  "invitationGroupId": "...",
  "providerErrorCode": "..."
}
```

Not:

```text
Message to +966xxxxxxxx failed for Mohammed...
```

---

# 47. Audit log

Create append-oriented:

`audit_logs`

Example:

```text
id
event_id
actor_user_id
actor_type
action
target_type
target_id
metadata
created_at
```

Important audit actions:

- guest created
- guest deleted
- guest edited
- RSVP manually changed
- invitation batch sent
- reminder batch sent
- co-host invited
- permission changed
- event archived
- export generated

---

# 48. Object storage

Use object storage for:

- event images
- invitation design assets
- generated exports
- generated passes
- temporary import files

Use:

Supabase Storage or S3-compatible storage.

Never store user-uploaded files permanently in the Next.js filesystem.

---

# 49. QR pass architecture

Do not encode guest personal information directly into the QR.

Bad:

```text
Mohammed Al Otaibi
+966...
3 guests
```

Good:

```text
opaque pass token
```

The server resolves it.

QR:

```text
PASS_TOKEN
```

Backend:

```text
PASS_TOKEN
→ invitation group
→ expected party
→ check-in state
```

---

# 50. Check-in API

Example:

```text
POST /api/v1/events/:eventId/check-ins/resolve
```

```json
{
  "token": "..."
}
```

Returns:

```json
{
  "invitationGroupId": "...",
  "displayName": "محمد العتيبي",
  "confirmedAttendance": 3,
  "checkedInAttendance": 0
}
```

Then:

```text
POST /api/v1/events/:eventId/check-ins
```

with:

```json
{
  "invitationGroupId": "...",
  "attendeeCount": 3
}
```

---

# 51. Check-in idempotency

Scanning twice must never silently produce six attendees.

Second scan returns:

```text
ALREADY_CHECKED_IN
```

along with:

- previous check-in timestamp
- number checked in
- staff member/device if available

---

# 52. Offline check-in future architecture

MVP:

Online-first.

Future native application:

Allow temporary offline scanning.

Local native database stores:

- event pass index
- check-in operations
- synchronization state

When connectivity returns:

```text
local operation queue
→ API
→ conflict detection
→ server reconciliation
```

Multiple offline devices can create conflicts, so never claim fully reliable duplicate prevention while every scanner is disconnected.

Clearly surface synchronization status.

---

# 53. Maps

Do not build an unnecessary mapping subsystem.

Store:

```text
latitude
longitude
venue_name
map_url
```

Guest actions:

```text
Open Google Maps
Open Apple Maps
```

A full Maps API should only be introduced if venue search/editor requirements justify it.

---

# 54. Localization

First-class locales:

```text
ar-SA
en
```

Arabic is the source UX.

Do not create English and mirror it afterward.

Use translation keys.

Example:

```text
dashboard.expectedAttendance
guest.rsvp.accept
guest.rsvp.decline
```

Do not hardcode Arabic text in business logic.

---

# 55. RTL

The entire host application must be tested with:

```html
dir="rtl"
```

Use logical CSS properties:

```text
margin-inline-start
padding-inline-end
border-inline-start
inset-inline-end
```

Avoid:

```text
margin-left
margin-right
```

when logical properties are appropriate.

Directional icons must flip.

Phone numbers remain LTR.

---

# 56. Time

Store times correctly.

Event has explicit timezone:

Example:

```text
Asia/Riyadh
```

Store machine timestamps as UTC.

Display using event/user timezone.

Never assume every event is Saudi forever.

---

# 57. Date formatting

Use locale-aware presentation.

Arabic dashboard can use Arabic-Indic numerals according to design rules.

API always transmits machine-safe ISO representations.

Example:

```text
2026-09-04T18:30:00Z
```

Never transmit translated date strings as the canonical value.

---

# 58. Design system for native apps

Web React components cannot be reused directly in native Swift/Kotlin.

Do not pretend otherwise.

Reuse instead:

1. Design tokens
2. Brand rules
3. API contracts
4. Domain terminology
5. UX flows
6. status enums
7. localization catalog
8. OpenAPI models

Then implement native design-system components.

---

# 59. iOS technology

Future native iOS application:

## Language

Swift.

## UI

SwiftUI.

## Architecture

Feature-based architecture with:

```text
View
ViewModel / Observable state
Repository
API client
Domain models
```

Use modern Swift concurrency:

```text
async / await
```

Networking:

```text
URLSession
```

or a minimal strongly typed wrapper around it.

Do not introduce a giant networking library without need.

---

# 60. iOS modules

Potential structure:

```text
WeddingApp/
├── App/
├── Core/
│   ├── Networking/
│   ├── Authentication/
│   ├── DesignSystem/
│   ├── Localization/
│   └── Storage/
│
├── Features/
│   ├── Events/
│   ├── Dashboard/
│   ├── Guests/
│   ├── Invitations/
│   ├── Reminders/
│   ├── CheckIn/
│   └── Settings/
│
└── GeneratedAPI/
```

`GeneratedAPI` can be produced from OpenAPI.

---

# 61. Android technology

Future Android application:

## Language

Kotlin.

## UI

Jetpack Compose.

## Architecture

Recommended layered architecture:

```text
UI / Compose
ViewModel
Domain/use cases
Repository
Remote API
Local persistence
```

Use:

- Kotlin Coroutines
- Flow / StateFlow
- ViewModel
- Retrofit + OkHttp or equivalent mature HTTP stack
- Kotlin serialization/Moshi depending on generated client strategy
- Room for offline check-in/cache where needed

Prefer Compose over XML for new screens.

---

# 62. Android modules

Example:

```text
app/
core/
    network/
    auth/
    designsystem/
    localization/
    database/
feature/
    events/
    dashboard/
    guests/
    invitations/
    reminders/
    checkin/
    settings/
generated-api/
```

---

# 63. Native push notifications

Future host apps can support:

### iOS

APNs.

### Android

Firebase Cloud Messaging.

Use for useful host notifications:

- RSVP spike/summary
- failed message batch
- co-host invite
- event-day operations
- export ready

Do not send push notification for every WhatsApp read receipt.

---

# 64. Universal/deep links

Plan URLs from day one.

Examples:

```text
https://app.domain.com/events/{id}
https://app.domain.com/events/{id}/guests/{guestId}
```

Later native apps register:

- Universal Links on iOS
- App Links on Android

The same URL should:

- open app when installed
- open web when app not installed

---

# 65. Credits architecture

Even before payment pricing is finalized, support a proper credit ledger.

Do NOT store:

```text
remaining_credits = 150
```

as the only billing truth.

Create ledger:

```text
credit_ledger
```

Transactions:

```text
PURCHASE
BONUS
SEND_USAGE
REFUND
MANUAL_ADJUSTMENT
EXPIRY
```

Balance:

```text
sum(ledger entries)
```

This produces an auditable billing system.

---

# 66. Payment provider

Do not couple business logic to one payment gateway until pricing and commercial requirements are finalized.

Create:

```ts
interface PaymentProvider
```

Later integrate the selected Saudi-compatible provider.

Billing should support future:

- per-event packages
- invitation bundles
- subscriptions
- usage billing

Do not invent pricing in code.

---

# 67. Export architecture

Large exports should be background jobs.

Example:

```text
Request Excel export
       ↓
Queue export job
       ↓
Worker generates XLSX
       ↓
Upload to private storage
       ↓
Signed temporary download URL
```

Do not generate a 20,000-row XLSX in a browser request.

---

# 68. Reports

Build server-side reporting queries for:

- invitation groups
- named guests
- expected attendance
- RSVP
- WhatsApp delivery
- check-in
- no-shows
- invitation type distribution

Never calculate critical dashboard counts by downloading all guests to the frontend.

---

# 69. Search

Guests require fast search.

Support:

- display name
- contact
- phone
- group name

Use PostgreSQL indexing.

Start without Elasticsearch.

Introduce external search only when demonstrated scale requires it.

---

# 70. Pagination

Do not return every guest.

Use cursor pagination or well-designed page pagination.

Example:

```text
GET /events/:id/invitations?limit=50&cursor=...
```

Support filters server-side.

---

# 71. API error format

Use a consistent error envelope.

Example:

```json
{
  "error": {
    "code": "INVITATION_PHONE_DUPLICATE",
    "message": "This phone number already exists in the event.",
    "details": {
      "existingInvitationId": "..."
    }
  }
}
```

Do not make clients parse English sentences to determine error type.

Native apps will depend on stable error codes.

---

# 72. API versioning

Start with:

```text
/v1
```

Breaking contract changes require:

```text
/v2
```

Do not break old mobile applications immediately after deploying the server.

Unlike web, users may keep an older native version installed for months.

Backend compatibility is therefore mandatory.

---

# 73. Feature flags

When native apps launch, server and client deployments will no longer happen simultaneously.

Support basic feature flags.

Possible:

```text
invitationDesignerEnabled
checkInEnabled
billingEnabled
autoReminderEnabled
```

Avoid giant configuration systems until needed.

---

# 74. Minimum supported app versions

Future API should be able to communicate:

```json
{
  "minimumIOSVersion": "...",
  "minimumAndroidVersion": "...",
  "latestIOSVersion": "...",
  "latestAndroidVersion": "..."
}
```

Only force upgrades for security or genuine incompatibility.

---

# 75. n8n

n8n may be used, but **not as the core backend**.

Good n8n uses:

- internal operations
- notifying support
- CRM synchronization
- admin workflows
- daily internal reports
- sales automations
- non-critical integrations

Do NOT put critical business logic such as:

```text
RSVP
guest creation
permission validation
credit charging
WhatsApp webhook truth
check-in
```

inside n8n.

The application must remain functional if n8n is unavailable.

---

# 76. Caching

Use Redis selectively.

Good cache candidates:

- dashboard aggregates for high-volume events
- rate limits
- idempotency
- short-lived auth/session metadata
- job queues

Do not cache everything prematurely.

PostgreSQL remains the source of truth.

---

# 77. Transaction boundaries

Operations that must succeed together use a DB transaction.

Example RSVP:

```text
update RSVP
update attending members
update expected_attendees
create RSVP history
create audit entry
```

should be atomic where appropriate.

A failed operation must not leave:

```text
status = ACCEPTED
expected_attendees = 0
```

---

# 78. Domain layer

Create domain services such as:

```text
InvitationDomainService
RsvpDomainService
MessagingDomainService
ReminderDomainService
CheckInDomainService
PermissionsDomainService
CreditsDomainService
```

Controllers should not contain business algorithms.

Bad:

```ts
@Controller()
class RsvpController {
  // 200 lines of attendance calculation
}
```

Good:

```ts
return rsvpService.submit(...)
```

---

# 79. Avoid premature microservices

Do not create:

```text
guest-service
rsvp-service
message-service
auth-service
event-service
billing-service
```

as separate deployments initially.

Use a **modular monolith**.

Deploy:

```text
API
Worker
Web
```

This is sufficient.

Modules remain separable internally.

If scale later justifies service extraction, boundaries already exist.

---

# 80. Backend modules

Recommended NestJS modules:

```text
AuthModule
UsersModule
EventsModule
MembershipsModule
InvitationsModule
GuestsModule
RsvpModule
MessagingModule
WhatsappModule
RemindersModule
ImportsModule
ExportsModule
CheckInModule
ReportsModule
BillingModule
AssetsModule
AuditModule
WebhookModule
NotificationsModule
HealthModule
```

---

# 81. Repository strategy

Repository layer isolates ORM details where domain complexity benefits from it.

Do not expose Prisma objects directly through every API response.

API DTOs are deliberate contracts.

Database schema ≠ public API.

---

# 82. Security basics

Mandatory:

- HTTPS only
- secure headers
- restrictive CORS
- CSP on web
- CSRF protection where relevant
- authenticated host endpoints
- authorization on every event resource
- rate limiting
- payload limits
- file upload validation
- file size limits
- MIME validation
- malware/security consideration for uploads
- webhook signature verification
- secrets outside source code
- secret rotation plan
- audit logging
- no stack traces returned to users

---

# 83. Multi-tenancy attack prevention

Every event-resource query must verify event membership.

Bad:

```text
GET /invitations/{uuid}
```

where possession of a UUID is enough.

Good:

Authorization verifies:

```text
current user
       ↓
event membership
       ↓
required permission
       ↓
resource belongs to event
```

Write automated cross-tenant tests.

User A must never see Event B.

---

# 84. Public token protection

Do not use sequential invitation IDs in public links.

Bad:

```text
/invite/9182
/invite/9183
/invite/9184
```

Use opaque random tokens.

Apply:

- rate limiting
- abuse monitoring
- no-index
- secure response headers

---

# 85. Invitation link SEO

Guest invitation pages are private.

Set:

```text
noindex
nofollow
noarchive
```

Do not allow search engines to index private weddings.

---

# 86. File upload security

For Excel and images:

Validate:

- allowed extension
- actual MIME
- maximum file size
- parser safety
- image dimensions
- malicious content where relevant

Store uploads under generated object keys.

Never trust original filenames as paths.

---

# 87. Observability

Use:

### Structured logs

Pino or equivalent.

### Error monitoring

Sentry.

### Metrics

At minimum:

- API request rate
- API error rate
- queue depth
- queue failures
- WhatsApp send success
- WhatsApp webhook processing lag
- import failures
- database health

### Health endpoints

```text
/health/live
/health/ready
```

---

# 88. Product analytics

Product analytics may be added using a privacy-conscious analytics system such as PostHog.

Track product actions, not guest private details.

Good:

```text
event_created
guest_import_completed
invitation_batch_sent
reminder_batch_sent
```

Bad:

```text
guest_mohammed_phone_966...
```

---

# 89. Testing strategy

This project is not done because pages visually load.

## Unit tests

Test:

- invitation rules
- RSVP calculation
- permission evaluation
- credit calculations
- reminder eligibility
- message-state transitions
- phone normalization

---

# 90. Integration tests

Test:

- database
- transactions
- API authorization
- event isolation
- webhook processing
- job queue behavior
- invitation sending
- import processing

Use real PostgreSQL-compatible test environments rather than mocking every database interaction.

---

# 91. Web E2E

Use:

**Playwright**

Critical flows:

```text
Create account
Create event
Add single guest
Add family
Add companion invitation
Import guests
Send invitations
Receive mock webhook
Guest accepts
Dashboard updates
Send reminder
Add co-host
Check permission restrictions
```

---

# 92. Visual tests

Use Storybook for productionized design-system components.

Test important components in:

```text
Arabic RTL
English LTR
desktop
mobile
```

Use visual regression for critical layouts.

---

# 93. Accessibility testing

Use:

- semantic HTML
- keyboard tests
- axe
- screen-reader sanity testing

Guest RSVP is particularly important.

Guest actions require large targets and simple language.

---

# 94. WhatsApp contract tests

Do not test against production WhatsApp numbers for every CI run.

Create representative webhook fixtures.

Examples:

```text
message sent
message delivered
message read
message failed
button reply
duplicate webhook
out-of-order webhook
malformed webhook
```

---

# 95. Load testing

Before production, use k6 or equivalent.

Scenarios:

### Invitation launch

Host sends:

```text
2,000 invitations
```

System queues them without API failure.

### Webhook spike

Hundreds of delivery/read events arrive quickly.

### Event check-in

Several devices scan guests concurrently.

---

# 96. Native tests

Future iOS:

- domain tests
- API client tests
- ViewModel tests
- SwiftUI UI tests
- check-in scanner tests

Future Android:

- JUnit
- repository tests
- ViewModel tests
- Compose UI tests
- offline synchronization tests

---

# 97. CI/CD

Use GitHub Actions.

Every pull request must run:

```text
install
lint
format check
typecheck
unit tests
integration tests
web build
api build
worker build
OpenAPI validation
```

Selected branches also run:

```text
E2E
```

---

# 98. Environments

Support:

```text
local
development
staging
production
```

Never use production WhatsApp credentials locally.

Never use the production database for staging.

---

# 99. Docker

Containerize:

```text
api
worker
```

This prevents infrastructure lock-in.

Web can run in a compatible modern Node deployment environment.

---

# 100. Database backups

Production PostgreSQL requires:

- automated backups
- point-in-time recovery where available
- tested restore procedure

A backup that has never been restored in a test is not a proven backup.

---

# 101. Deployment portability

Avoid architecture that requires one hosting vendor forever.

The system should be deployable to a suitable provider/region based on:

- security
- latency
- Saudi data requirements
- cost
- operational capability

Environment variables provide infrastructure endpoints.

---

# 102. What stays on the web forever

Even after native applications launch, keep a web application.

Reasons:

- event planners use laptops
- large guest lists work better on desktop
- spreadsheet imports are desktop-heavy
- reports are desktop-friendly
- setup/configuration is easier on large screens

Native apps complement web.

They do not replace it.

---

# 103. Best mobile-app scope

Do not duplicate every desktop function immediately.

First native release should prioritize:

1. Event dashboard
2. Guest search
3. RSVP status
4. Add/edit guest
5. Failed-message alerts
6. Reminder actions
7. Event-day check-in
8. QR scanning
9. Notifications

Keep advanced invitation editing/import workflows on web initially.

---

# 104. Guest app strategy

There should initially be **no guest application**.

Do not ask wedding guests to install an app.

Guest journey:

```text
WhatsApp
   ↓
Accept / Decline
   ↓
Optional invitation page
   ↓
Map / QR
```

This is a competitive advantage.

---

# 105. MVP definition

## MVP 1 — Foundation

Build:

- repository
- design-system conversion
- database
- API
- auth
- event membership
- deployment environments
- CI/CD

---

# 106. MVP 2 — Event creation

Build:

- events
- onboarding
- event settings
- event switcher
- dashboard shell

---

# 107. MVP 3 — Guest management

Build:

- invitation groups
- single person
- named group
- companions
- guest CRUD
- search
- filtering
- bulk selection
- Excel import

This must be stable before WhatsApp sending.

---

# 108. MVP 4 — WhatsApp

Build:

- Meta setup
- provider abstraction
- message templates
- message preview
- send batches
- worker
- retries
- message states
- webhooks
- failures

---

# 109. MVP 5 — RSVP

Build:

- WhatsApp responses
- public invitation links
- single RSVP
- family RSVP
- companion RSVP
- response editing
- manual host editing
- RSVP audit history
- expected attendance calculations

---

# 110. MVP 6 — Reminders

Build:

- reminder eligibility
- manual reminders
- automatic reminder rules
- reminder history
- spam protection

---

# 111. MVP 7 — Team

Build:

- co-host invitations
- roles
- permissions
- audit trail

---

# 112. MVP 8 — Reports and billing foundation

Build:

- RSVP reports
- delivery reports
- exports
- credit ledger
- usage records

Payment can follow commercial decisions.

---

# 113. MVP 9 / Phase 2 — Check-in

Build:

- QR passes
- web scanner
- search check-in
- partial check-in
- duplicate protection
- event-day dashboard

Then prioritize native check-in apps.

---

# 114. Phase 3 — Native apps

Create:

### iOS

Swift + SwiftUI.

### Android

Kotlin + Jetpack Compose.

Both consume `/api/v1`.

Both use OpenAPI-generated/shared contracts.

Do NOT rewrite backend rules in each application.

---

# 115. Out of MVP scope

Unless explicitly requested, do not distract the initial release with:

- guest social network
- guest accounts
- chat
- photo sharing
- seating-chart engine
- vendor marketplace
- AI-generated invitations
- complex accounting
- full event-planning ERP
- multi-tenant enterprise planner platform
- template marketplace

Build the invitation-management core extremely well first.

---

# 116. Code-quality rules

Use:

- clear names
- small cohesive functions
- explicit types
- domain enums
- DB constraints
- validation at boundaries
- comments for WHY, not obvious WHAT
- tests for business invariants

Do not generate giant files.

A practical maximum should trigger refactoring when a file becomes difficult to reason about.

---

# 117. No magic strings

Avoid:

```ts
if (status === "accepted")
```

throughout the codebase.

Centralize types/enums.

Example:

```ts
RsvpStatus.ACCEPTED
```

API values remain stable.

---

# 118. Database constraints

Do not trust application validation alone.

Examples:

```text
max_companions >= 0
expected_attendees >= 0
```

Use foreign keys.

Use unique constraints where domain logic guarantees uniqueness.

Use indexes for frequently filtered foreign keys/statuses.

---

# 119. Business invariants belong to tests

Examples that must have tests:

```text
Single invitation cannot accept 2 people.

Family with 4 members and 3 attending is PARTIALLY_ACCEPTED.

Companion invitation allowing 2 companions cannot accept 4.

Declined invitation always has expected attendance 0.

Check-in cannot exceed reasonable confirmed capacity without explicit override.

Co-host without send permission cannot send invitations.

Duplicate webhook cannot trigger duplicate RSVP.

Duplicate send request cannot send twice.
```

---

# 120. Destructive actions

Soft delete/archive where business history matters.

Do not erase operational history casually.

Examples:

Event:

```text
archived_at
```

Invitation:

```text
cancelled_at
```

Audit history survives.

Actual permanent deletion should follow explicit retention/privacy workflows.

---

# 121. Event deletion

Event deletion requires:

- owner permission
- explicit confirmation
- understanding of associated data
- audit record

Consider delayed permanent deletion.

Example:

```text
Delete requested
→ 30-day recovery period
→ permanent purge
```

subject to final privacy policy.

---

# 122. Invitation editing after sending

Important rule:

Editing a guest after a message was sent must not rewrite historical message data.

Messages retain snapshots of:

- template
- locale
- variables used
- send timestamp

Current invitation can change separately.

---

# 123. Sending safety

Before a large send:

Show server-generated summary:

```text
Ready: 397
Already sent: 2
Invalid: 1
Estimated credit usage: 397
```

Host confirms.

Backend then re-validates before queueing.

Never trust only the frontend confirmation state.

---

# 124. Credit safety

Charging and sending must be logically coordinated.

Do not:

```text
send message
then maybe subtract credit
```

without transactional strategy.

Create a reservation/usage strategy that prevents:

- negative balances
- double charging
- free duplicate sends caused by retries

Provider retry of the same logical message must not charge again.

---

# 125. WhatsApp provider IDs

Always persist provider message IDs.

They are required to correlate:

```text
send
delivery
read
failure
response
```

Do not attempt correlation using phone number alone.

---

# 126. Dashboard performance

Dashboard endpoint can expose aggregates.

Example:

```text
GET /api/v1/events/:eventId/dashboard
```

Response:

```json
{
  "invitationGroups": 450,
  "namedGuests": 620,
  "expectedAttendees": 497,
  "rsvp": {
    "acceptedGroups": 280,
    "partialGroups": 14,
    "declinedGroups": 48,
    "pendingGroups": 108
  },
  "delivery": {
    "sent": 421,
    "delivered": 410,
    "read": 388,
    "failed": 3
  }
}
```

The frontend should not make 30 requests and calculate these values itself.

---

# 127. Event activity

Activity feed should be generated from meaningful domain events.

Examples:

```text
Ahmed accepted for 3 people
12 guests were imported
Reminder sent to 89 groups
3 messages failed
Noura joined as co-host
```

Do not include every read receipt.

---

# 128. Domain events

Internally support application/domain events.

Examples:

```text
InvitationCreated
InvitationBatchQueued
MessageDelivered
RsvpChanged
ReminderSent
GuestCheckedIn
CoHostJoined
```

Initially these can remain inside the modular monolith.

They simplify future integrations.

---

# 129. Notifications derived from events

Example:

```text
MessageBatchCompleted
↓
3 failures
↓
create host notification
```

rather than messaging modules calling frontend-specific notification logic.

---

# 130. Admin/operations tools

Eventually create internal admin tooling separate from normal event owners.

Admin may inspect:

- account
- event ID
- queue issues
- provider errors
- credit adjustments
- support diagnostics

Access must be heavily restricted and audited.

Never solve support problems by giving staff unrestricted production DB access as the normal workflow.

---

# 131. No PII in analytics

Critical.

Analytics identifiers should use:

```text
event_id
user_id
feature
```

not:

```text
guest phone
guest invitation token
guest name
```

---

# 132. Production readiness checklist

Before public launch ensure:

### Business

- Single invitation works
- Named family works
- Companions work
- Partial acceptance works
- RSVP edit works
- manual RSVP works
- reminder eligibility works
- count semantics are correct

### WhatsApp

- templates approved
- sending works
- webhook verification works
- retries work
- duplicate webhook works
- failed numbers work
- sending queue works

### Security

- cross-event authorization tests pass
- secrets are not committed
- rate limits enabled
- public tokens high entropy
- logs scrub PII
- backup configured
- privacy policy implemented
- retention process documented

### UX

- Arabic RTL
- English LTR
- mobile guest
- elderly-friendly RSVP
- loading states
- error states
- empty states

### Operations

- monitoring
- alerting
- backups
- staging
- rollback strategy

---

# 133. Documentation you must maintain

Create and keep updated:

```text
/docs/business/business-rules.md

/docs/architecture/overview.md
/docs/architecture/data-model.md
/docs/architecture/message-flow.md
/docs/architecture/rsvp-flow.md

/docs/security/security-model.md
/docs/security/privacy-and-pdpl.md
/docs/security/threat-model.md

/docs/mobile/native-strategy.md

/docs/runbooks/whatsapp-failures.md
/docs/runbooks/queue-backlog.md
/docs/runbooks/database-restore.md

/openapi/openapi.yaml
```

---

# 134. Architecture decision records

Write ADRs for major irreversible decisions.

Initial ADRs:

```text
ADR-001 API-first architecture
ADR-002 Modular monolith
ADR-003 PostgreSQL
ADR-004 NestJS backend
ADR-005 Next.js web
ADR-006 Meta WhatsApp Cloud API
ADR-007 OpenAPI native-client strategy
ADR-008 Redis/BullMQ jobs
ADR-009 Guest token authentication model
ADR-010 Platform-neutral design tokens
```

---

# 135. Skills you are expected to apply

Act with expert-level competence in:

### Product

- SaaS product architecture
- wedding/event business workflows
- operational UX
- permissions
- billing systems
- audit trails

### Web

- TypeScript
- React
- Next.js
- HTML
- CSS
- RTL
- accessibility

### Backend

- Node.js
- NestJS
- REST
- OpenAPI
- webhook design
- queues
- idempotency
- transactional systems

### Database

- PostgreSQL
- Prisma
- relational modeling
- indexing
- migrations
- query optimization

### Messaging

- WhatsApp Business Platform
- Cloud API
- templates
- interactive messages
- webhook status handling

### Infrastructure

- Docker
- Redis
- CI/CD
- object storage
- environment management
- monitoring
- backups

### Security

- authentication
- authorization
- OWASP practices
- secret management
- PII
- multi-tenancy
- audit logging
- Saudi PDPL awareness

### iOS

- Swift
- SwiftUI
- async/await
- URLSession
- Keychain
- APNs
- Universal Links

### Android

- Kotlin
- Jetpack Compose
- Coroutines
- Flow
- ViewModel
- Retrofit/OkHttp
- Room
- Keystore
- FCM
- App Links

### Testing

- unit tests
- integration tests
- Playwright
- API contract tests
- webhook fixtures
- load testing

---

# 136. How you must work

Do NOT immediately generate thousands of lines of unrelated code.

Work in vertical slices.

For each feature:

```text
Business rule
↓
Database model
↓
Domain service
↓
API contract
↓
Tests
↓
Frontend
↓
E2E
```

Example:

### Add guest

Finish:

```text
DB
API
validation
permissions
tests
UI
success
error
RTL
```

before jumping to an unrelated feature.

---

# 137. Definition of done

A screen is not done because it looks correct.

A feature is done when:

- business rule implemented
- validation implemented
- database constraints implemented where appropriate
- authorization implemented
- API documented
- errors handled
- audit behavior considered
- tests pass
- Arabic works
- English works
- mobile behavior works
- loading state exists
- empty state exists
- failure state exists
- no PII leaks
- implementation matches provided design system

---

# 138. Never fake production behavior

Do not leave important features backed permanently by:

```text
mockGuests
fakeSendMessage()
setTimeout(...)
localStorage database
hard-coded RSVP
```

Mocks are allowed only for isolated development/tests.

Production flows must connect to real backend contracts.

---

# 139. Preserve existing design work

Before implementing screens:

1. Inspect the supplied design-system files.
2. Extract the design tokens.
3. Understand RTL guidelines.
4. Understand existing components.
5. Understand host UI kit.
6. Understand guest invitation kit.
7. Rebuild these as production TypeScript components.

Do not visually redesign the product unless required by missing functionality.

---

# 140. Final architectural target

The production system should ultimately look like:

```text
                           INTERNET
                              │
             ┌────────────────┴────────────────┐
             │                                 │
             ▼                                 ▼
      Host Web / Guest Web               Native Apps
          Next.js                    SwiftUI / Compose
             │                                 │
             └────────────────┬────────────────┘
                              │
                         HTTPS REST
                              │
                              ▼
                     ┌──────────────────┐
                     │   NestJS API     │
                     │     /api/v1      │
                     └────────┬─────────┘
                              │
        ┌─────────────────────┼────────────────────┐
        │                     │                    │
        ▼                     ▼                    ▼
   PostgreSQL               Redis              Storage
        │                     │
        │                     ▼
        │              ┌──────────────┐
        │              │ BullMQ Worker│
        │              └──────┬───────┘
        │                     │
        │                     ▼
        │             WhatsApp Cloud API
        │                     │
        │                     ▼
        │                  Webhooks
        │                     │
        └─────────────────────┘
```

Additional systems:

```text
Sentry
CI/CD
Backups
Product analytics
Push notifications later
Payment provider later
```

---

# 141. Core rule for future mobile development

The question is NOT:

> “Can we convert the Next.js website into Swift and Kotlin later?”

The correct architecture is:

> “Can Swift, Kotlin and Next.js all become clients of the same backend and design language?”

The answer must be yes.

Reuse:

```text
Backend
Database
API
OpenAPI
Business rules
Authentication model
Design tokens
Localization
Terminology
Assets
```

Reimplement only:

```text
Native UI
native navigation
native device capabilities
```

That is the intended architecture.

---

# 142. Final instruction

Build this product as if:

- real Saudi weddings will depend on it;
- invitation lists may contain thousands of people;
- WhatsApp can retry or duplicate events;
- users can accidentally click actions twice;
- co-hosts must not see data they do not have permission to see;
- elderly guests must understand RSVP immediately;
- event venues may have weak connectivity;
- the project will eventually have dedicated iOS and Android apps;
- old mobile clients may remain installed after the API evolves;
- guest phone numbers are sensitive personal data;
- production failures on an event night are unacceptable.

Prefer simple, explicit, reliable engineering.

Do not overengineer with microservices.

Do not underengineer critical flows with no-code automation.

Build a strong modular monolith, a stable API, a reliable messaging worker, a correct relational database, and an excellent RTL user experience.

The result should be a product that can grow from:

**Saudi wedding invitation web application**

into:

**a full GCC event invitation, RSVP and attendance platform**

without replacing its foundation.