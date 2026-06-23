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

- platform_status: GO
- current_v4_stage: V4-K Console Read-Only preparation
- next_stage: V4-K Console Read-Only MVP
- next_action: Prepare V4-K Console Read-Only MVP
- managed_projects: jinhu-smart-park

## Required Reading

- runtime/global/codex-startup.md
- runtime/global/handoff-summary.md
- runtime/global/platform-state.json
- runtime/global/roadmap-memory.json
- runtime/projects/jinhu-smart-park/handoff-summary.md
- README.md

## Safety

- Do not modify jinhu-smart-park unless an explicit proposal is approved.
- Do not execute Agents from context commands.
- Do not deploy.
- Do not run production migration, seed, reset, cleanup, or production operations.
- Do not read or write real credential values.
- Keep Studio Context under runtime/global and Project Context under runtime/projects/<project_id>.
