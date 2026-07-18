# AD-004.5 Data Migration

Studio has no registered ORM or migration runner. Therefore AD-004.5 supplies isolated PostgreSQL DDL `001_autonomous_kernel.up.sql` and an exact reverse-order down migration, but does not execute either. Integration with a migration runner is a later operational decision.

The schema covers Goal, Task, Dependency, Attempt, Planner Submission, Worker, Session, Lease, Outbox and State Transition. It enforces scoped Goal idempotency, `(goal_id, task_key)`, cross-Goal-safe composite foreign keys, dependency uniqueness, `(task_id, attempt_number)`, one partial-index ACTIVE lease and unique monotonically allocated fencing values. Queue, lease-expiry and unpublished-outbox scans are indexed.

Activation plan: create an isolated Studio database; apply up migration in a transaction; run repository/contention tests; enable shadow reads; reconcile counts/transitions; then explicitly approve authoritative mode. Rollback requires stopping claimers, draining workers, exporting audit/outbox evidence, applying down migration, and restoring the previous control-plane mode. No production data was migrated.
