# AD-005 Readiness Review

Decision: contract and local process supervision ready; authoritative runtime not ready. Tests use isolated temporary directories and deterministic local Node child processes. They do not invoke Codex, a model, a managed project or production work.

Later PostgreSQL verification must use an ephemeral database addressed only by `TEST_DATABASE_URL`; reject hosts/databases not explicitly marked test. Apply the AD-004.5 migration, then run parallel Claim contention with `SKIP LOCKED`, active lease unique-constraint races, fencing CAS, and Runtime result fencing writes. Run migration up/down/up and drop the isolated database afterward. Docker may provision the fixture but is optional and was not used by AD-005.

Remaining integration work: persist runtime state/outbox transitions through a fencing-aware repository, test parent-process crash cleanup on each supported OS, configure provider adapters, and connect AD-004 Worker through RuntimeService. Codex remains disabled by default.
