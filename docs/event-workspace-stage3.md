# Stage 3 event onboarding and workspace

Stage 3 completes the event-configuration vertical slice. Hosts create an event
through a four-step localized wizard, open it in a responsive workspace, inspect
server-computed counts, edit settings, move through the event lifecycle, switch
events, archive safely, and recover an archive without deleting history.

## Product routes

- `/{locale}/events` lists non-archived events available through an active
  membership and opens the create-event wizard.
- `/{locale}/events/{eventId}` is the event overview.
- `/{locale}/events/{eventId}/settings` contains event and RSVP settings plus the
  confirmed archive action.

Arabic RTL is the source layout. English uses the supplied English event and
venue names when present and falls back to Arabic without inventing content.
The workspace uses the Stage 2 host shell at desktop, collapsed, and mobile
breakpoints.

## API and authorization contract

The canonical OpenAPI contract defines these authenticated operations:

| Operation                                   | Required permission | Behavior                                                                                                                                                        |
| ------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /events/{eventId}`                     | `event.view`        | Returns the complete event settings and allowed next statuses.                                                                                                  |
| `PATCH /events/{eventId}`                   | `event.edit`        | Validates the merged persisted and submitted settings, then append-audits changed field names.                                                                  |
| `POST /events/{eventId}/status-transitions` | `event.edit`        | Applies only an allowed lifecycle edge and append-audits the old and new status.                                                                                |
| `POST /events/{eventId}/archive`            | `event.archive`     | Sets `ARCHIVED` and `archived_at`; no operational record is deleted.                                                                                            |
| `POST /events/{eventId}/recovery-request`   | `event.archive`     | Immediately restores the status captured in the latest archive audit record and clears `archived_at`. Legacy archives without that metadata recover to `DRAFT`. |
| `GET /events/{eventId}/dashboard`           | `event.view`        | Returns explicit invitation-group, named-guest, expected-attendee, and RSVP-group counts.                                                                       |

Every event operation resolves the authenticated user against an `ACTIVE`
membership for that exact event before reading or mutating event data. Missing
events, non-members, and revoked memberships all receive the same `404`
response, preventing UUID probing across tenants. An active membership without
the requested capability receives `403`. Owners retain the domain-level
permission bypass; known additive permission overrides are accepted for other
roles.

## Lifecycle policy

Archive and recovery are separate audited operations and never ordinary status
transitions.

| Current status | Allowed next status                     |
| -------------- | --------------------------------------- |
| `DRAFT`        | `ACTIVE`                                |
| `ACTIVE`       | `RSVP_OPEN`, `EVENT_DAY`, `COMPLETED`   |
| `RSVP_OPEN`    | `RSVP_CLOSED`, `EVENT_DAY`, `COMPLETED` |
| `RSVP_CLOSED`  | `RSVP_OPEN`, `EVENT_DAY`, `COMPLETED`   |
| `EVENT_DAY`    | `COMPLETED`                             |
| `COMPLETED`    | None                                    |
| `ARCHIVED`     | None                                    |

The deliberate `RSVP_CLOSED` to `RSVP_OPEN` edge lets an owner reopen replies.
Invalid transitions return `409` with the current, requested, and allowed
statuses.

## Aggregate semantics

Dashboard counts are calculated in PostgreSQL and exclude cancelled invitation
groups:

- `invitationGroups` counts invitation records, not people.
- `namedGuests` counts guest-member rows belonging to included groups.
- `expectedAttendees` sums each included group's derived expected count.
- RSVP counts classify included invitation groups as accepted, partially
  accepted, declined, or pending.

An event with no invitation records returns explicit zeros. The web interface
keeps these units visible and shows a truthful preparation state; guest
management and sending remain later-stage capabilities.

## Date, time, and map safety

Event dates use validated `YYYY-MM-DD` calendar values. Times use `HH:mm` local
wall-clock values and an IANA time-zone identifier. The API converts PostgreSQL
date/time sentinel values without applying the host machine's time zone, and the
web formats them with an explicit UTC presentation anchor, preventing an event
date or wall-clock time from shifting between Riyadh, CI, and a user's browser.

Map links are optional and must be HTTPS destinations on Google Maps or Apple
Maps hosts. The same allow-list protects API input and rendered external links.

## Automated coverage

- Domain tests lock the lifecycle graph and archive separation.
- Contract tests cover defaults, real calendar dates, IANA zones, coordinate
  pairing, map allow-listing, nullable update clears, and OpenAPI type parity.
- Real-PostgreSQL integration tests cover create/get/update, audit metadata,
  lifecycle conflicts, archive/recovery, aggregate math, revoked memberships,
  role overrides, and cross-tenant denial for every event operation.
- Web interaction tests cover the keyboard-operable wizard, step validation,
  overview aggregates, localized event data, event switching, lifecycle actions,
  settings updates, and confirmed archive behavior.
