# ADR-008: Redis and BullMQ jobs

Status: accepted.

Large sends, webhooks, reminders, imports, exports, and notifications run outside HTTP requests through bounded BullMQ jobs backed by Redis.
