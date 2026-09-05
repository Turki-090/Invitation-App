# Data model

The first migration establishes users, events, event memberships, invitation groups, named guest members, RSVP state and history, public invitation capabilities, and append-oriented audit logs.

Key boundaries:

- A role belongs to a user-event membership, never globally to a user.
- An invitation group is the WhatsApp sending unit; a guest member is a named person inside it.
- RSVP state and expected attendee count belong to the invitation group aggregate.
- Public invitation tokens are stored as hashes and authorize exactly one invitation group.
- Operational history is retained through RSVP history and audit logs.

Database constraints and application transactions must enforce non-negative counts and relationship integrity. Cross-table invitation-type rules are enforced in the domain service and tested.
