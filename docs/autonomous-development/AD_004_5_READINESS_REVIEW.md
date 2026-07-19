# AD-004.5 Readiness Review

Decision: **code-extraction ready; production activation not ready**.

Complete locally: platform-neutral contracts, DAG rules, deterministic scheduling rules, PostgreSQL transaction/CAS/SKIP LOCKED claim protocol, worker lifecycle operations, fencing checks, reversible DDL, adapters, no-runtime stub and unit/static migration tests.

Evidence limitations: PostgreSQL was not provisioned, so real transaction contention, partial-index races, migration apply/down/apply and service repository tests were not run. No external API, daemon process or outbox publisher is wired. Heartbeat/reaper/drain SQL is implemented but verified statically rather than against a live database. Production activation therefore requires those tests plus access-center/claim-gate integration.

AD-005 may begin in this Studio repository against these package boundaries, but must not claim production readiness or start real runtime execution.

Smart Park cleanup: create a dedicated cleanup branch after this Studio commit is accepted; prefer reverting `a06f96f`, `5f0b7a2`, then `5a0e7a5` when they are isolated, otherwise precisely delete only files introduced by those commits. Preserve Git history and any already-applied migration ledger entries; do not rewrite history. Retain only a project manifest/project-connector adapter, never a kernel copy. Stash or separately commit existing runtime dirt before cleanup, exclude queue/locks/results, run Smart Park lint/typecheck/build/tests and migration-status checks, compare business APIs, then delete the wrong branch only after Studio integration and cleanup review.
