# Persistent Night Shift Kernel

Persistent Night Shift uses migration `001_autonomous_kernel` unchanged and adds reversible migration `002_persistent_night_shift` for Session, Scheduler Tick, Claim, Error and final Report facts. Every database entry point requires `TEST_DATABASE_URL`, localhost, and a database name containing `test` or `fixture`.

The local fixture is Docker `postgres:16-alpine`, container `anksen-night-shift-pg-test`, host port `55439`, database `anksen_night_shift_test`. It is isolated from the existing Smart Park PostgreSQL containers. The commands create/start it automatically but never remove or connect to production containers.

Commands:

```bash
pnpm night-shift:postgres:smoke
pnpm night-shift:resume:smoke
pnpm night-shift:contention:test
```

The first performs migration up/down/up and completes the CONTROLLED_STUB Goal. Resume launches two separate Node processes: one persists a RUNNING checkpoint and the second idempotently reaccepts the Goal, resumes scheduling, completes it and reloads the JSON report. Contention uses two Scheduler calls and two Worker connections, verifies SKIP LOCKED, distinct claims, one ACTIVE lease per Task, a single winner for one queued Task and stale fencing rejection.

Reaper locks expired leases with SKIP LOCKED. An Attempt explicitly marked `sideEffectsPossible:false` returns to QUEUED; commit/artifact or unknown side-effect evidence moves the Task to BLOCKED. Lease, Attempt, Worker claim/count, transition audit and outbox event are updated in one transaction.

CONTROLLED_STUB remains the only registered Runtime. This fixture proves PostgreSQL orchestration semantics, not production activation readiness.
