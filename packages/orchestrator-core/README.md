# @anksen-agent-studio/orchestrator-core

`orchestrator-core` is the home for reusable Agent Studio orchestration contracts and engine logic.

The autonomous kernel contains platform-neutral Goal/task graph, scheduler, worker protocol and PostgreSQL persistence primitives. It does not copy project-specific state from `jinhu-smart-park/ops/agent-orchestrator`, expose a new API, run a migration, or start a runtime.

## Future Scope

Extraction candidates from the Jinhu Smart Park project-local orchestrator:

- Goal Engine contracts and goal-state lifecycle.
- Planner Agent contracts and planner-output validation.
- Event Store contracts for task lifecycle events.
- Queue read-model projection contracts.
- Task dispatch, claim, complete, audit, integrate, reconcile, and finalize orchestration.
- Beta-003 Studio Gateway exposes the existing Goal/Planner/Night Shift path through authenticated REST and MCP-compatible contracts; it does not create a second orchestration implementation.
- Doctor, self-repair, daemon, and autonomous-loop core decision rules.
- Project-agnostic validation and risk classification.

## Out Of Scope For Bootstrap

The current extraction phase does not:

- Move Jinhu Smart Park business code.
- Move project-specific task history, results, reports, run logs, or runtime memory.
- Move `queue/task-queue.json`, `task-locks.json`, `task-results.json`, `events/**`, `runs/**`, `reports/**`, or `results/**`.
- Execute Agent tasks.
- Execute deploy, production migration, production seed, reset, cleanup, or production data operations.
- Replace the current `jinhu-smart-park/ops/agent-orchestrator` scripts.

## Current CLI

```bash
node packages/orchestrator-core/bin/studio.mjs doctor --project examples/jinhu-smart-park/project.config.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs skill-route --text "修改 ERP 前端页面样式" --dry-run
node packages/orchestrator-core/bin/studio.mjs goal-to-queue --text "继续把 Agent Studio 提升到 99%" --dry-run
node packages/orchestrator-core/bin/studio.mjs runtime-memory --summary
node packages/orchestrator-core/bin/studio.mjs observe --dry-run
node packages/orchestrator-core/bin/studio.mjs evolution-plan --dry-run
node packages/orchestrator-core/bin/studio.mjs discovery --target packages/discovery-engine/examples/discovery-target.example.json --dry-run
```

## Extraction Approach

1. Keep `jinhu-smart-park` as the business project and source of project-specific evidence.
2. Add project-agnostic schemas and pure utility contracts here first.
3. Introduce a `project-connector` adapter boundary for filesystem, Git, and worktree access.
4. Port one capability at a time with parity tests against fixture projects before pointing at real project state.
5. Keep write operations approval-gated and adapter-scoped.

## Safety Boundary

All implementation moved into this package must treat project repositories as external workspaces. Business paths such as `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, and env files must remain protected by project adapter policy.
