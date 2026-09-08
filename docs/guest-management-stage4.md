# Stage 4 invitation groups and guest management

Stage 4 delivers the event-scoped invitation-group aggregate used by later
imports, WhatsApp delivery, and RSVP workflows. One invitation group is one
contact and sending unit; its nested guest members are named people. Every API
and screen keeps invitation groups, named guests, maximum capacity, and expected
attendance distinct.

## Host routes and API contract

The localized host route is `/{locale}/events/{eventId}/guests`. It uses the
responsive Stage 2 host shell and the canonical API under
`/api/v1/events/{eventId}/invitations`.

| Operation                                 | Capability     | Behavior                                                                                  |
| ----------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `GET /invitations`                        | `guest.view`   | Searches, filters, sorts, and returns one bounded page plus explicit active-event totals. |
| `POST /invitations`                       | `guest.create` | Normalizes the phone and creates the group, members, and audit evidence atomically.       |
| `GET /invitations/{invitationId}`         | `guest.view`   | Returns event-owned detail and permission-shaped phone fields.                            |
| `PATCH /invitations/{invitationId}`       | `guest.edit`   | Validates the merged aggregate and replaces member structure in one transaction.          |
| `POST /invitations/{invitationId}/cancel` | `guest.delete` | Soft-cancels one group without deleting operational history.                              |
| `POST /invitations/bulk-cancel`           | `guest.delete` | Safely cancels up to 100 selected event-owned groups and reports idempotent results.      |

Missing events, inactive or revoked memberships, and cross-event identifiers use
the same anti-enumeration not-found path. An active member without the required
capability receives forbidden. Owners retain the domain bypass. Co-host defaults
allow guest viewing, full phone viewing, creation, and editing; deletion remains
an explicit capability. Check-in staff can view guest records but receive masked
phones.

## Aggregate invariants

The domain layer and deferred PostgreSQL constraint triggers enforce the final
transaction state:

- `SINGLE` has exactly one named primary member, no companions, and capacity 1.
- `NAMED_GROUP` has one or more named members, at most one primary member, no
  unnamed companions, and capacity equal to its member count.
- `PRIMARY_WITH_COMPANIONS` has exactly one named primary member and a
  nonnegative companion allowance; capacity is `1 + maxCompanions`.
- Member positions are positive and unique within a group. At most one primary
  member can exist. Companion and expected-attendance counts cannot be negative.
- Once an RSVP record exists, type, member, and capacity edits are rejected so a
  structural edit cannot orphan response data.

Invitations are cancelled, not deleted. Dashboard and guest-management totals
exclude cancelled groups while their records, nested members, RSVP data, and
append-only audit evidence remain available.

## Phone and duplicate policy

The server uses full `libphonenumber` metadata. National input is interpreted
using the selected GCC country (`SA`, `AE`, `BH`, `KW`, `OM`, or `QA`), while a
valid international number is normalized independently. PostgreSQL stores the
resulting E.164 value and ISO country metadata and rejects malformed storage
values.

Same-event phone matches are detected after normalization. A transaction-scoped
advisory lock serializes creation for the event-and-phone pair, preventing two
concurrent requests from bypassing duplicate review. A match returns the stable
`DUPLICATE_PHONE_REQUIRES_OVERRIDE` conflict with masked summaries. A legitimate
shared family contact requires an explicit override; the decision and matched
record identifiers are append-audited without storing phone PII in audit
metadata.

Members without `guest.phone.view` receive `phoneE164: null`, an LTR masked
display value, and cannot search stored full-phone data. Duplicate errors are
masked for every role.

## Lists and host interface

List requests use page pagination bounded to 100 records, deterministic sorting
with an ID tie-breaker, and server-side filters for invitation type, RSVP state,
and cancellation state. Search covers group display name, contact name, named
member name, and—only when authorized—phone. PostgreSQL indexes cover active
phone lookup and the supported event/filter/sort paths.

The Arabic-RTL and English-LTR host interface provides explicit summary units,
responsive table and mobile-card layouts, RSVP tabs, search, filters, sorting,
pagination, row selection, bulk cancellation, and loading, empty, error, and
success states. Add and edit drawers use the supplied invitation-type cards,
named-member editor, GCC phone control, and companion stepper. Detail and
destructive confirmation drawers retain the design system's keyboard, focus,
and screen-reader contracts. Import, sending, reminders, and RSVP editing remain
truthfully outside this stage.

## Automated coverage

- Domain tests cover every invitation structure, capacity calculation,
  duplicate decisions, GCC and international normalization, invalid phones, and
  masking.
- Contract tests cover create/update validation, explicit duplicate decisions,
  bounded list queries, bulk selection, masked responses, stable conflicts, and
  generated OpenAPI compatibility.
- Real-PostgreSQL tests cover transactional creation and rollback, storage
  constraints, sequential and concurrent duplicates, audited override, member
  replacement, RSVP structure locks, individual and bulk cancellation,
  hundreds-of-groups pagination, search/filter/sort behavior, permission
  shaping, hidden-phone search, and cross-tenant denial.
- Web interaction tests cover API-backed table states, filtering and selection,
  all three invitation forms, duplicate override, detail/edit/cancel flows, and
  localized responsive rendering.
