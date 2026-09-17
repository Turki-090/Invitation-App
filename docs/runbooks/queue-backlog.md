# Queue backlog runbook

A backlog is a symptom, never a diagnosis. The platform's queues are durable and
idempotent by design, so a deep queue is usually the system absorbing pressure
correctly. The failure mode to guard against is an operator "fixing" the backlog
and destroying work that was about to succeed.

## Read the signal correctly

Backlog **age** is the health signal; depth is context.

- `dawah_queue_oldest_waiting_job_age_seconds` — how long the oldest waiting job
  has waited. This is what alerts.
- `dawah_queue_depth{state=...}` — waiting, active, delayed, and failed counts.
- `dawah_queue_jobs_total{outcome=...}` — succeeded, retried, exhausted.
- `dawah_queue_job_duration_seconds` — whether jobs themselves got slower.

A queue holding two thousand jobs that are all seconds old is a launch in
progress. A queue holding twenty jobs that are an hour old is broken.

## Triage order

1. **Is the worker running?** Worker readiness reports every queue consumer and
   the reminder scheduler individually. A single failing consumer is visible
   there.
2. **Is Redis healthy?** `queue.connection_error` in the worker logs means the
   connection, not the jobs.
3. **Is the database healthy?** Every processor writes; a saturated connection
   pool presents as slow jobs, not failed ones. Compare
   `dawah_queue_job_duration_seconds` against its normal shape.
4. **Is the provider throttling?** For `whatsapp-send`, a rising
   `outcome="rate_limited"` means the limiter is pacing deliberately. Nothing to
   fix. See [`provider-outage.md`](provider-outage.md).
5. **Is one job poisoning the queue?** Rising `outcome="retried"` on one queue
   with a flat success rate points at a specific job, not at capacity.

## Scaling consumers

Scale only after establishing that the worker is healthy and the provider is
not the constraint, and only within two ceilings:

- **Provider limits.** `META_WHATSAPP_SEND_CONCURRENCY` and
  `META_WHATSAPP_MAX_SENDS_PER_SECOND` exist to stay inside Meta's limits.
  Raising them to clear a backlog converts a delay into rate-limit failures.
- **Database capacity.** Each consumer holds connections and takes row locks.
  Doubling consumers against an already-saturated database makes jobs slower,
  not faster.

Record any scaling change and return it to its documented value afterwards.

## Replaying and retrying

- Job identities are deterministic (`message-<id>`, `batch-<id>`,
  `export-<id>`, `reminder-run-<rule>-<slot>`). Re-enqueueing the same logical
  work reuses the same identity and cannot produce a duplicate.
- Idempotency records, confirmation hashes, and scheduled-slot uniqueness
  protect the high-impact paths independently of the queue.
- Exhausted WhatsApp sends are written to durable evidence for operator review.
  Resend through the safe-resend path, which uses the current snapshot and
  refuses to duplicate a delivered message — not by re-adding raw jobs.

## Never delete a backlog

Deleting waiting jobs does not cancel the work; it abandons rows that are
already committed. A deleted send leaves a message stranded, a deleted webhook
job leaves delivery state permanently stale, and a deleted reminder run leaves a
recorded decision with no execution.

If a backlog genuinely must be dropped — for example, a cancelled event whose
sends should not go out — cancel at the domain level so the state change is
recorded and the jobs become no-ops. If there is no domain-level path, the
deletion is a recovery decision: it requires the incident lead's explicit
approval and a written record of exactly what was removed and why.

## Closing out

- Confirm backlog age has returned to its normal range and no queue is still
  accumulating `exhausted` outcomes.
- Reconcile the affected event's counts against its report.
- Return any temporarily changed concurrency or rate limit to its documented
  value.
