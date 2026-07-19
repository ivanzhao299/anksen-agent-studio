# AD-004.5 Target Mapping

`packages/orchestrator-core` is the single Goal/Task/Scheduler/worker-protocol implementation. `planning-center` produces planning data, `worker-pool` owns declarative worker profiles, and `runtime-adapters` owns execution adapters. They do not maintain competing state machines.

| Logical boundary | Target evidence |
|---|---|
| contracts | `packages/orchestrator-core/src/autonomous-kernel/index.ts` |
| task graph / scheduler / recovery | `packages/orchestrator-core/lib/autonomous-kernel/domain.mjs` |
| persistence / events / audit / worker protocol | `packages/orchestrator-core/lib/autonomous-kernel/postgres-store.mjs` |
| integration adapters | `packages/orchestrator-core/lib/autonomous-kernel/adapters.mjs` |
| database | `packages/orchestrator-core/migrations/001_autonomous_kernel.*.sql` |
| verification | `packages/orchestrator-core/test/autonomous-kernel/*.test.mjs` |

No new external route was installed. A future API adapter must authenticate through access-center, enforce the existing claim gate/queue preflight, and pass an authorized Studio scope to the store. This preserves current Console/Gateway/Worker behavior.
