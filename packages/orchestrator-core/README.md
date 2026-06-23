# @anksen-agent-studio/orchestrator-core

`orchestrator-core` is the future home for reusable Agent Studio orchestration contracts and engine logic.

This package is intentionally a skeleton during the first extraction phase. It does not copy implementation from `jinhu-smart-park/ops/agent-orchestrator` yet.

## Future Scope

Planned extraction candidates from the Jinhu Smart Park project-local orchestrator:

- Goal Engine contracts and goal-state lifecycle.
- Planner Agent contracts and planner-output validation.
- Event Store contracts for task lifecycle events.
- Queue read-model projection contracts.
- Task dispatch, claim, complete, audit, integrate, reconcile, and finalize orchestration.
- Doctor, self-repair, daemon, and autonomous-loop core decision rules.
- Project-agnostic validation and risk classification.

## Out Of Scope For Bootstrap

The bootstrap phase does not:

- Move Jinhu Smart Park business code.
- Move project-specific task history, results, reports, run logs, or runtime memory.
- Execute Agent tasks.
- Execute deploy, production migration, production seed, reset, cleanup, or production data operations.
- Replace the current `jinhu-smart-park/ops/agent-orchestrator` scripts.

## Extraction Approach

1. Keep `jinhu-smart-park` as the business project and source of project-specific evidence.
2. Add project-agnostic schemas and pure utility contracts here first.
3. Introduce a `project-connector` adapter boundary for filesystem, Git, and worktree access.
4. Port one capability at a time with parity tests against fixture projects before pointing at real project state.
5. Keep write operations approval-gated and adapter-scoped.

## Safety Boundary

All implementation moved into this package must treat project repositories as external workspaces. Business paths such as `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, and env files must remain protected by project adapter policy.

