# Data model

The first migrations establish users, events, event memberships, invitation
groups, named guest members, RSVP state and history, public invitation
capabilities, append-oriented audit logs, private stored assets, reviewable
imports, versioned invitation templates, and immutable content snapshots.

Key boundaries:

- A role belongs to a user-event membership, never globally to a user.
- An invitation group is the WhatsApp sending unit; a guest member is a named person inside it.
- RSVP state and expected attendee count belong to the invitation group aggregate.
- Public invitation tokens are stored as hashes and authorize exactly one invitation group.
- A stored asset belongs to one event; import sources and invitation images
  cannot be attached across event boundaries.
- An import row keeps immutable parser output and separate host corrections. A
  completed row links to at most one event-local invitation group.
- A content snapshot binds one invitation group to the exact approved template
  version and optional image digest used to render it.
- Operational history is retained through RSVP history and audit logs.

Database constraints and application transactions enforce non-negative counts,
tenant-safe composite relationships, terminal-state metadata, template-content
immutability, and snapshot source integrity. Cross-table invitation-type and
readiness rules are enforced in the domain service and tested against real
PostgreSQL transactions.
