# AD-004.5 Source Inventory

Evidence source: the three immutable commits in the incorrectly targeted Smart Park repository. Patch exports are reference material only; no commit was cherry-picked.

| Area | Source capability | Studio disposition |
|---|---|---|
| Goal / Proposal | Goal inbox and idempotent create | Adapted to `ad_goal`; model-gateway Proposal remains approval input, not a second Goal |
| Task Queue | Task graph queue projection | `ad_task` is the future transactional source; controlled queue preflight remains a gate |
| Worker Claim | Atomic claim and CAS | Ported to `claimNext`; existing claim gate remains authorization/preflight |
| Worker Registry | Worker/session/lease | Live state in `ad_worker*`; declarative profiles come from worker-pool adapter |
| Scheduler | readiness, dependency, tick | Pure rules plus transactional `schedulerTick` |
| Runtime Adapter | daemon execution boundary | Replaced by Studio runtime-adapters port; default is `NOT_EXECUTED` |
| Event Store | lifecycle events | No compatible Studio event store exists; transactional outbox retained |
| Audit | state transition journal | Dedicated append-only transition table retained |
| Outbox | transactional events | Dedicated outbox retained; no existing transactional outbox to reuse |
| PostgreSQL / ORM | TypeORM/PostgreSQL | PostgreSQL semantics retained; Smart Park ORM/container wiring rejected |
| API Gateway | controllers | Smart Park controllers rejected; Studio authenticated action boundary is the adapter point |
| Console | operator views | Existing console reused unchanged |
| Authentication | guards | Existing access-center boundary reused; no kernel authentication duplicate |
| Permission / RBAC | business permissions | Smart Park permissions rejected; Studio RBAC supplies actor/scope |
| Project / Workspace | tenant/park/project | Adapted to organization/workspace/project |
| Node / Agent Registry | daemon workers | worker-pool supplies profiles; live sessions are kernel state |
| Deployment / env | park service configuration | Not migrated; activation remains disabled until separately wired |

AD-002 extracted Goal, Task, Dependency, Attempt, Planner Submission, outbox, DAG validation/topology/root/leaf and transactional plan write. AD-003 extracted dependency/readiness rules, deterministic queueing, CAS scheduler tick, aggregation and transition audit. AD-004 extracted registry/session/claim/lease/fencing/heartbeat/reaping/drain/recovery and a no-runtime adapter. Park entities, menus, controllers, migration numbers, deployment files, runtime JSON, locks and dirty state were excluded.
