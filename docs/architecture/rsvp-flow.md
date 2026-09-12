# RSVP flow

1. A recipient opens an opaque invitation capability or responds through WhatsApp.
2. The API hashes and resolves the capability without exposing internal event data.
3. The domain service validates the invitation structure and calculates RSVP state.
4. One serialized database transaction updates RSVP members, RSVP state, expected attendance, immutable before/after history, idempotency, audit activity, and the confirmation outbox.
5. The worker drains the durable confirmation outbox through bounded, ambiguity-safe WhatsApp delivery while dashboard aggregates read the committed invitation totals.

The calculation and guest-policy sources are `packages/domain/src/invitation.ts` and `packages/domain/src/rsvp.ts`. A decline always produces zero expected attendees. A named group is partially accepted only when some but not all named members attend. Unnamed companions never create a partial state.

Guest submissions use a canonicalized client-generated UUID as a capability-scoped idempotency key. WhatsApp responses are accepted only when the callback action and invitation/member binding match the immutable sent snapshot. Provider occurrence time prevents delayed responses from replacing a newer web, host, or WhatsApp choice; a database-issued webhook ingestion sequence deterministically orders distinct callbacks that carry the same whole-second provider timestamp.

Only the latest unsent confirmation for an invitation remains eligible. A newer response supersedes older pending work, while a newer confirmation waits for an already-started send to finish. This prevents configurable worker concurrency from sending two confirmation revisions for the same invitation at once.
