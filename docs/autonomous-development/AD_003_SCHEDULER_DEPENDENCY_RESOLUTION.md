# AD-003 Scheduler and Dependency Resolution

The pure resolver distinguishes satisfied, waiting, blocked and optional dependencies. Readiness and Goal aggregation are deterministic. Queue order is priority, readiness time, creation time and task key.

`schedulerTick` locks a bounded candidate set with `FOR UPDATE ... SKIP LOCKED`, supports zero-write `dryRun`, resolves dependency rows, and changes state using version CAS. Every mutation writes transition audit and outbox records in the same transaction. Repeated ticks become no-ops once no eligible transition remains.
