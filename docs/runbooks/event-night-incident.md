# Event-night incident runbook

An event night is the only time this platform has a hard deadline. A wedding
starts when it starts, guests arrive whether or not the scanner works, and a
host cannot reschedule around a deploy. Every decision below is biased towards
protecting the event in progress rather than towards a clean fix.

Scope: any incident while at least one supported event is in `EVENT_DAY`, or
within the twelve hours before one.

## Standing position

- **Never deploy during a supported event** unless the deploy is the remedy for
  the incident itself, and the named incident lead says so explicitly.
- **Never delete a queue backlog** to clear an alert. Sends, webhooks, and
  reminders are durable and idempotent; deleting them destroys evidence and can
  strand a message in `SENDING` forever. See
  [`queue-backlog.md`](queue-backlog.md).
- **Prefer degraded to wrong.** A delayed invitation is recoverable. A duplicate
  send to two thousand guests, or an attendance count that does not match the
  door, is not.

## Roles

| Role          | Responsibility                                              |
| ------------- | ----------------------------------------------------------- |
| Incident lead | Owns the decision to mitigate, roll back, or ride it out.   |
| Communicator  | Talks to the affected hosts; nobody else contacts them.     |
| Operator      | Executes commands; announces each one before running it.    |
| Scribe        | Records timestamps, correlation identifiers, and decisions. |

One person may hold several roles; the incident lead is always named explicitly.

## First five minutes

1. Identify the affected events. Ask the host or read
   `dawah_domain_events_total` and the event report; do not guess from traffic.
2. Classify the failure:
   - **Guests cannot respond** — public RSVP path.
   - **Messages are not arriving** — send pipeline or provider.
   - **The door is not working** — check-in and entry passes.
   - **Hosts cannot see or do anything** — API or authentication.
3. Capture one `requestId` from a failing response, or one `correlationId` from
   a failing job. Every subsequent step is searched by that value: it spans the
   API request and the worker job it produced.
4. Open the platform overview dashboard and note, in this order: backlog age per
   queue, server error ratio, provider outcome mix.

## Decision table

| Symptom                                                       | Most likely cause                                 | First action                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DawahQueueBacklogAging` on `whatsapp-send`, provider healthy | Worker under-scaled or restarting                 | Check worker readiness, then scale consumers within provider and database limits.         |
| Backlog aging **and** `DawahWhatsAppRateLimited`              | Provider throttling; the limiter is doing its job | Do nothing to the queue. Tell the host sends are pacing, give an ETA from backlog age.    |
| `outcome="failed_permanent"` rising                           | Template, recipient policy, or number problem     | Stop further launches for that event. See [`whatsapp-failures.md`](whatsapp-failures.md). |
| Server error ratio up with no deploy                          | Database or Redis pressure                        | Check readiness endpoints and connection saturation before touching application code.     |
| Server error ratio up right after a release                   | The release                                       | Roll back. See [`migration-and-rollback.md`](migration-and-rollback.md).                  |
| Scanners report conflicts on every scan                       | Contention, not corruption                        | Check-in retries serializable conflicts by design; confirm counts before intervening.     |
| Attendance count disagrees with the door                      | Possible correctness defect — highest severity    | Freeze check-in for that event, record counts, escalate immediately.                      |

## Check-in specific

Check-in is feature-flagged. If scanning is failing and cannot be fixed within
minutes, the correct mitigation is to fall back to manual arrival recording and
reconcile afterwards, not to keep retrying a failing scanner at the door.

- `CHECK_IN_ENABLED=false` disables the feature platform-wide. Use it only if
  scanning is failing across events; a single event's door problem is not a
  reason to disable it for everyone.
- Repeated scans of one party are already reported as duplicates rather than
  counted twice, and arrivals never exceed confirmed attendance. A count that
  exceeds confirmed attendance is a correctness incident, not a busy door.

## Communicating with a host

The communicator gives the host three things and nothing else: what is affected,
what the platform is doing about it, and when they will hear again. Never quote
raw error text, never share another event's state, and never promise a delivery
time that depends on the provider.

## Closing the incident

An incident is closed when the event has ended and:

1. The scribe's timeline is recorded with correlation identifiers.
2. Message, RSVP, and attendance counts have been reconciled against the event
   report, and any discrepancy is written down with its cause.
3. Any temporarily changed flag or scaling decision has been returned to its
   documented value, or the deviation is recorded as an accepted exception.
4. A follow-up is filed for anything that was mitigated rather than fixed.

The pilot exit gate requires that no pilot event suffered a data-isolation,
message-duplication, attendance-count, privacy, or recovery failure. An incident
touching any of those five is reported to the go/no-go review regardless of how
quickly it was resolved.
