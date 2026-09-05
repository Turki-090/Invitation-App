# RSVP flow

1. A recipient opens an opaque invitation capability or responds through WhatsApp.
2. The API hashes and resolves the capability without exposing internal event data.
3. The domain service validates the invitation structure and calculates RSVP state.
4. One database transaction updates RSVP members, RSVP state, expected attendance, history, and audit activity.
5. A domain event can enqueue confirmation messaging and refresh dashboard aggregates.

The calculation source is `packages/domain/src/invitation.ts`. A decline always produces zero expected attendees. A named group is partially accepted only when some but not all named members attend. Unnamed companions never create a partial state.
