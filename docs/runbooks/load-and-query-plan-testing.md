# Load and query-plan testing runbook

Load tests run against the local `dawah_test` database seeded by
`load/seed/seed-load-fixtures.mjs`, never against staging or production data.
The full procedure is in `load/README.md` and the expected plans are in
`docs/query-plan-review.md`.

Before measuring, confirm three things: the seed completed and reports its
group, template and band summary; the API request throttler has been raised for
the load window and the limit in force has been written down; and `ANALYZE` has
run since the seed, because a plan chosen from default statistics tells you
nothing. Run one scenario at a time. Two scenarios sharing the database measure
each other.

Read a failed run in this order: an aborted run with a configuration message is
a setup problem and nothing in it is valid; a non-zero invariant counter is a
correctness defect and outranks every timing in the same run; a failed rate
threshold means requests were rejected, so read the error-code counters; a
failed duration threshold is a question for `EXPLAIN (ANALYZE, BUFFERS)` before
it is a question for the ceiling. Compare the observed plan against the one
`docs/query-plan-review.md` predicts, and treat a sequential scan or a spilled
sort where an index scan was expected as stale statistics or an ignored index
until proven otherwise.

Record the k6 summary, the throttler limit, the seed size and the `RUN_ID` with
every result. Reseed between runs, or pass a new `RUN_ID`: idempotency keys are
derived from it, and a repeated `RUN_ID` makes the second run replay the first.
Restore the throttler limit and delete the private `.env.load` when the window
closes.
