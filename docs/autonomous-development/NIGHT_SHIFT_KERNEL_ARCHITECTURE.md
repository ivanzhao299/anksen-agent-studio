# Night Shift Kernel Architecture

```text
access-center / model-gateway / console
              | authorized Studio scope
Goal -> planning-center RulePlannerEngine/PlannerService
              -> standard Task Graph -> orchestrator-core autonomous kernel
worker-pool     -> adapters -> worker registry / claim / lease
                              | transactional SQL
                              +-> audit + outbox
                              | injected execution port
                 RuntimeService -> runtime-adapters
                    (Codex disabled; controlled stub by default)
                              |
                    managed project via project-connector
```

The kernel owns durable orchestration facts. Control-plane packages authorize and propose; they do not duplicate those facts. Workers must use RuntimeService rather than construct commands. Runtime adapters execute only after policy and fencing validation; Codex additionally requires its feature flag. Smart Park is below the project-connector boundary.

The Night Shift MVP smoke path uses `NightShiftSessionService` with an isolated in-memory Kernel fixture and CONTROLLED_STUB only. It verifies the orchestration protocol without claiming database or production Runtime readiness.
