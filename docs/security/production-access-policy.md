# Production access policy

Production holds guest names, phone numbers, RSVP decisions, and attendance for
people who never signed up for this platform. Access to it is therefore a
privilege that is granted narrowly, justified each time, time-bounded, and
logged.

## Principles

- **Least privilege.** The default is no production access. Being on the team is
  not a justification; being on call for a specific window is.
- **Named individuals.** No shared accounts, no shared credentials. Every action
  in production traces to a person.
- **Justified and bounded.** Elevated access is requested for a stated purpose
  and expires automatically. An open-ended grant is a standing risk.
- **Product first.** If a question can be answered through the product's own
  reporting, through metrics, or through redacted logs, it is answered there.
  Direct database access is the last resort, not the first tool.

## Roles

| Role             | Grants                                                                    | Who                            |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------ |
| Observer         | Dashboards, alerts, redacted structured logs, error reports               | Engineering and operations     |
| On-call operator | Observer, plus deploy, rollback, scale, restart, and feature-flag changes | Named on-call for the window   |
| Data responder   | On-call operator, plus read-only database access for a stated request     | Named, time-bounded, approved  |
| Break-glass      | Full production administration                                            | Two named individuals, jointly |

Observer access carries no personal data: logs, metrics, and error reports are
redacted by design, which is what makes broad observability safe to grant.

## Elevation

A request for data-responder or break-glass access records, before access is
granted:

1. Who is requesting it.
2. What specifically they need to reach.
3. Why the product, metrics, and redacted logs are insufficient.
4. How long they need it.
5. Who approved it — never the requester.

Access expires automatically at the stated time. Extension is a new request.

Break-glass is for an active incident where the on-call operator cannot restore
service otherwise. Its use is announced at the time, not disclosed afterwards,
and is reviewed within one business day regardless of outcome.

## Working inside production

- Read before you write. Take a `SELECT` before any `UPDATE` or `DELETE` and
  record it.
- Never run an unbounded `UPDATE` or `DELETE`. Every statement carries an
  explicit `WHERE` on a specific event or row.
- Never disable a database trigger or constraint. Append-only evidence and the
  owner-membership protections are enforced there deliberately.
- Never copy production personal data to a laptop, a staging environment, a
  spreadsheet, a ticket, or a chat message. Staging uses synthetic fixtures.
- Never read one event's data while investigating another. Cross-event isolation
  is the platform's central promise; an operator is not an exception to it.
- Prefer the domain-level path over a direct write. Cancelling an invitation
  through the product records the change and keeps aggregates consistent; an
  `UPDATE` does neither.

## Logging and review

- Infrastructure access — console sign-in, database session, secret read — is
  logged by the platform provider, retained, and reviewed.
- Application actions by an operator acting as a host are recorded in the
  product's own append-only audit log.
- Access grants and their justifications are reviewed monthly. Anything that has
  become standing is either formalised as a role or removed.
- Every grant is revoked when a person changes role or leaves, on the same day.

## Prohibited

- Sharing credentials or session tokens, including during an incident.
- Using a production credential from a personal or unmanaged device.
- Disabling audit logging, structured logging, or the metrics endpoint to
  "reduce noise".
- Turning off a security control to unblock work. If a control is wrong, change
  it in the repository and ship it.
- Reusing any production secret in another environment.

## Relationship to PDPL

Production access is a processing activity. Grants, justifications, and access
logs are part of the evidence the platform relies on under
[`privacy-and-pdpl.md`](privacy-and-pdpl.md), and unauthorised access is a
personal-data incident subject to the response procedure there.
