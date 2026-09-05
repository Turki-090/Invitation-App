# Message flow

Large sends are asynchronous. The API validates permissions, readiness, credits, and an `Idempotency-Key`, persists a send batch, and enqueues one logical message per invitation group. The worker sends through a provider abstraction and stores provider message identifiers.

WhatsApp webhooks are authenticated, deduplicated by provider event identifier, persisted, acknowledged quickly, and processed asynchronously. Delivery state remains separate from RSVP state. Out-of-order events are reduced through an explicit state transition policy rather than arrival order alone.

This document will be expanded when the messaging vertical slice is implemented.
