# New Codex Window Startup

First command:

```bash
node packages/orchestrator-core/bin/studio.mjs context summary
```

Then inspect the active managed project when needed:

```bash
node packages/orchestrator-core/bin/studio.mjs context project --project jinhu-smart-park
```

## Current State

- platform_status: READY_FOR_PILOT
- current_stage: V5 closure complete; Pilot local control plane active; managed-project branch sync pending
- next_stage: Continue single-worktree development on jinhu-smart-park feature branch; resync stale agent worktrees before any multi-agent dispatch.
- next_action: Stabilize jinhu-smart-park branch topology before multi-agent execution
- active_managed_project_branch: feature/engineering-project-delivery-runtime

## Required Reading

- runtime/global/codex-startup.md
- runtime/global/handoff-summary.md
- runtime/global/platform-state.json
- runtime/global/roadmap-memory.json
- runtime/projects/jinhu-smart-park/handoff-summary.md
- docs/release/V5_PRODUCTIZATION_CLOSURE_REPORT.md
- docs/release/PILOT_5_CONSOLE_PRODUCTIZATION.md
- README.md

## Safety

- Do not push jinhu-smart-park directly to main; keep active development on reviewed feature or integration branches until merge time.
- Do not dispatch stale agent worktrees until they are resynced to the active managed-project branch.
- Do not deploy.
- Do not run production migration, seed, reset, cleanup, or production operations.
- Do not read or write real credential values.
- Keep Studio Context under runtime/global and Project Context under runtime/projects/<project_id>.
