# Business rules

## Counting language

Every API and screen distinguishes invitation groups, named guests, and expected attendees. Counts always name their unit.

## Invitation types

- `SINGLE`: exactly one primary named member, maximum attendance 1.
- `NAMED_GROUP`: one or more named members, no unnamed companions; each attending member is selected explicitly.
- `PRIMARY_WITH_COMPANIONS`: exactly one primary named member plus zero or more allowed unnamed companions.

## RSVP

States are `PENDING`, `ACCEPTED`, `PARTIALLY_ACCEPTED`, and `DECLINED`. Named groups use the partial state when at least one but fewer than all members attend. Single and companion invitations do not use partial acceptance. A decline always sets expected attendance to zero. Guests may respond only while RSVP is open and the event-local deadline has not passed; existing responses may change only when guest edits are enabled. Authorized hosts may record or correct responses until the invitation is cancelled or the event is archived. WhatsApp offers only immediately actionable choices and at most three quick replies; the private web invitation remains the exact-selection path for a named subset or an intermediate companion count.

## Authorization

Owners may perform event actions. Co-hosts and check-in staff receive
event-scoped capabilities. Role defaults may be replaced by an exact custom
allow-list; permanent event deletion and billing management cannot be delegated.
A team manager cannot grant or renew capabilities they do not hold. Every event
resource query checks active membership, required permission, and event
ownership of the resource.

## Team invitations

Team invitations are bound to a normalized GCC phone number, expire after seven
days, and return their raw acceptance token only when created or resent. The
accepting authenticated principal must carry the matching verified phone claim.
Ownership cannot be invited, changed, or revoked through the team lifecycle.

## Reminders

A reminder may target only an invitation group that received an initial
invitation, remains pending, is not cancelled, is outside the configured
cooldown, and has not reached the configured maximum reminder count. Accepted,
partially accepted, and declined groups are never eligible. Manual sends require
a fresh server confirmation; manual and scheduled runs persist every eligible
or excluded decision. Selection is rechecked transactionally and again before
provider contact. Repeating a confirmation, schedule slot, or queue job cannot
create another logical send.

## Audit and deletion

Material changes are append-audited. Meaningful asynchronous outcomes create
event-scoped, per-user notifications with idempotent source identities. Events
are archived and invitations cancelled where operational history matters.
Permanent deletion follows a separate retention/privacy workflow.
