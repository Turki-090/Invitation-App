# Business rules

## Counting language

Every API and screen distinguishes invitation groups, named guests, and expected attendees. Counts always name their unit.

## Invitation types

- `SINGLE`: exactly one primary named member, maximum attendance 1.
- `NAMED_GROUP`: one or more named members, no unnamed companions; each attending member is selected explicitly.
- `PRIMARY_WITH_COMPANIONS`: exactly one primary named member plus zero or more allowed unnamed companions.

## RSVP

States are `PENDING`, `ACCEPTED`, `PARTIALLY_ACCEPTED`, and `DECLINED`. Named groups use the partial state when at least one but fewer than all members attend. Single and companion invitations do not use partial acceptance. A decline always sets expected attendance to zero.

## Authorization

Owners may perform event actions. Co-hosts and check-in staff receive event-scoped capabilities. Every event resource query checks active membership, required permission, and event ownership of the resource.

## Audit and deletion

Material changes are append-audited. Events are archived and invitations cancelled where operational history matters. Permanent deletion follows a separate retention/privacy workflow.
