# Queue backlog runbook

Compare queue depth, oldest-job age, worker health, Redis health, provider rate limits, and recent deployment changes. Scale consumers only within provider and database capacity. Preserve idempotency when replaying jobs and never delete a backlog without a documented recovery decision.
