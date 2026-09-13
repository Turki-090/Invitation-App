# Data model

The first migrations establish users, events, event memberships, invitation
groups, named guest members, RSVP state and history, public invitation
capabilities, append-oriented audit logs, private stored assets, reviewable
imports, versioned invitation and reminder templates, immutable content
snapshots, send batches, logical messages and attempts, webhook evidence,
idempotency records, team invitations, reminder rules and runs, recipient
cooldown state, and operational notifications.

Key boundaries:

- A role belongs to a user-event membership, never globally to a user.
- A team invitation belongs to one event and one normalized GCC phone number.
  Only its SHA-256 token hash is stored; acceptance creates or reactivates one
  event membership without permitting ownership transfer.
- A custom membership permission document is the complete allow-list rather
  than an additive override. Billing management and permanent event deletion
  remain non-delegable owner capabilities.
- An invitation group is the WhatsApp sending unit; a guest member is a named person inside it.
- RSVP state and expected attendee count belong to the invitation group aggregate.
- Public invitation tokens are stored as hashes and authorize exactly one invitation group.
- A stored asset belongs to one event; import sources and invitation images
  cannot be attached across event boundaries.
- An import row keeps immutable parser output and separate host corrections. A
  completed row links to at most one event-local invitation group.
- A content snapshot binds one invitation group to the exact approved template
  version and optional image digest used to render it.
- A send batch records one confirmed high-impact request. One initial invitation
  message may exist per event-local invitation group, and one message may exist
  per invitation in a batch.
- A message is the immutable logical and accounting send unit. It copies the
  recipient, provider template, variable order and values, rendered content, and
  Stage 5 snapshot hashes so later invitation edits cannot rewrite history.
- A message attempt is one provider call. Attempt numbering is unique within the
  logical message and a request fingerprint preserves the exact call identity;
  retries never create another logical credit unit.
- Provider message IDs are unique per provider and are the normal webhook
  correlation key. A status callback may also carry the UUID logical message ID
  so evidence that arrives before provider-ID storage can be reconciled safely;
  the provider ID is then written once.
- A webhook event has a provider-stable identity and immutable normalized
  payload evidence. Its processing state may advance independently of message
  delivery state.
- An idempotency record is scoped to event and operation. It stores only a hash
  of the caller key, binds it to one request hash, and replays the linked batch
  response for 24 hours.
- A reminder rule stores its trigger offset, cooldown, maximum-send cap, and
  approved reminder template. A reminder run stores one immutable eligibility
  outcome and reason-code set per considered invitation group, whether or not a
  message was queued.
- Recipient reminder state links one invitation group to its latest queued
  reminder message and queue time. It prevents overlapping reminders and lets a
  newer logical reminder supersede an older unsent job; successful per-rule
  counts are derived from immutable run items and message state.
- A notification is addressed to one user within one event and is unique for a
  domain kind/source tuple. Read state is per recipient and never broadens event
  access.
- Operational history is retained through RSVP history, message attempts,
  webhook evidence, reminder runs, notifications, and audit logs.

Database constraints and application transactions enforce non-negative counts,
tenant-safe composite relationships, terminal-state metadata, template-content
immutability, snapshot source integrity, one initial invitation send, and
provider/webhook uniqueness. Database triggers protect batch and message
identity, completed attempts, webhook evidence, reminder decisions, owner
memberships, and accepted team links, and independently require each new message
to match an approved event-local snapshot. Partial unique indexes prevent more
than one pending team invitation for an event/phone and more than one scheduled
run per rule/evaluation slot. Cross-table invitation-type and readiness rules
are enforced in domain/application services and exercised against real
PostgreSQL transactions.
