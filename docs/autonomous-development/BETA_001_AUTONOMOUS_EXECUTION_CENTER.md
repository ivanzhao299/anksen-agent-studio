# Beta-001 Autonomous Execution Center

## Scope

Autonomous Execution Center (AEC) is the Studio product surface for the existing autonomous-development kernel. It adds an authenticated goal API and a chairman dashboard. It does not introduce another Planner, Scheduler, Worker, Runtime Adapter, database model, or migration.

Real Codex execution remains disabled. Every Beta-001 execution uses `CONTROLLED_STUB` in the isolated PostgreSQL fixture selected by `TEST_DATABASE_URL`.

## Execution path

```text
Studio /execution → POST /api/aec/goals
  → Access Center authentication + RBAC (`aec-goal`)
  → AutonomousExecutionCenter
  → PersistentNightShiftService.acceptGoal
  → existing PlannerService → existing Task Graph tables
  → PersistentNightShiftService.run
  → existing Scheduler → Resident Worker → CONTROLLED_STUB
  → Attempt/Lease/Goal/Session persistence
  → existing Outbox + SessionProjectionConsumer
  → GET /api/aec/dashboard → Morning Report
```

## Existing-kernel ownership

| Concern | Existing implementation consumed by AEC |
| --- | --- |
| Planning and graph creation | `PlannerService`, invoked by `PersistentNightShiftService.acceptGoal` |
| Goal, task, attempt, lease and session state | Autonomous Kernel PostgreSQL migrations and repositories |
| Scheduling and dependency resolution | Persistent Night Shift scheduler tick |
| Claim and execution | Existing resident-worker claim/run/fencing flow |
| Runtime | Existing `CONTROLLED_STUB` adapter only |
| Reporting | Existing session report, outbox and session projection |
| Authorization | Existing Console session authentication and Access Center RBAC |

## Chairman dashboard

`/execution` displays the latest Night Shift Session, Goal, Tasks, Workers, Queue, Blocked tasks, Runtime, Approval counts, last-run totals, Morning Report and current controlled-stub readiness. The dashboard reads the existing `ad_*` kernel and activation-gate tables; it has no parallel state store.

The **New Goal** form defaults to “完善 Runtime 文档”. Submitting it runs the complete loop synchronously for the Beta fixture and refreshes the same kernel-backed dashboard.

## Safety boundary

- `CODEX` is never selected by AEC and the dashboard reports its feature flag as false.
- The API requires an authenticated Console session and `autopilot.execute.local` (or wildcard) capability.
- The local isolated PostgreSQL fixture is used; production database configuration is not read.
- Beta-001 performs no push, merge, deployment, or production migration.
