# ADR-011: Authentica for sign-in code delivery

Status: accepted.

Host sign-in is a phone one-time code. Supabase Auth generates and verifies that
code and issues the session; Authentica delivers it over SMS through Supabase's
send-SMS hook rather than through a client call.

Authentica also offers verification, and it is deliberately unused. Verifying
there would make delivery capable of issuing sessions, and would put a second
answer to "who is signed in" outside the token the API validates. Delivery is a
channel concern, so changing delivery vendor touches no session, user mapping,
or client code.

The hook is authenticated with the Standard Webhooks signature over a bounded
timestamp. Unauthenticated it would be an open relay for sending codes to
arbitrary numbers on the account's balance, so startup validation refuses an API
that enables delivery without a usable hook secret.

See `docs/operations/authentica-otp-activation.md`. The vendor's API
blueprint is kept at `docs/vendor/authenticasa.apib` for reference.

# Review update — 2026-09-19

SMS is now the default delivery channel. The hook persists a deduplication claim before sending and never automatically retries an ambiguous provider result. The current public Authentica schema omits the custom `otp` field documented in the older blueprint. Production activation remains blocked on vendor confirmation and a real handset-to-Supabase-session test. See the updated activation runbook for details.
