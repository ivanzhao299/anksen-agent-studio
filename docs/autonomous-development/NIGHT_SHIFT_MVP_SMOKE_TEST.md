# Night Shift MVP Smoke Test

`NightShiftSessionService` connects the Rule Planner, an isolated Autonomous Kernel fixture, Scheduler, resident worker loop and `CONTROLLED_STUB` Runtime. It never connects to PostgreSQL and never registers Codex, Claude or a production Runtime.

The session API is `createSession(options)`, `acceptGoal(sessionId, goal)`, `run(sessionId)`, `requestShutdown()` and `report(sessionId)`. Options include `mode: once|daemon`, `maxRuntimeMs`, `idleTimeoutMs` and `maxTasks`. SIGINT/SIGTERM in the CLI requests graceful shutdown.

The fixture preserves the production protocol invariants needed by the smoke test: idempotent Goal/plan insertion, unique Task keys, PENDING/BLOCKED -> READY -> QUEUED scheduling, exclusive claim, one ACTIVE lease, monotonic fencing, Attempt/Task writeback and Goal aggregation. It is test infrastructure, not a replacement persistence implementation.

Run:

```bash
pnpm night-shift:smoke
pnpm night-shift:smoke -- --daemon
```

The smoke Goal is “补充 Runtime Adapter 文档并生成检查报告。” The CLI prints a JSON Session Report containing session/Goal status, task outcome counts, attempts, ticks, claims, Runtime executions, timestamps and error summary.
