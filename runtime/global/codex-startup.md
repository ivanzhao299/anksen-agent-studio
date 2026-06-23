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
- current_v4_stage: V4-O Production Operations Center approval gate
- next_stage: Await explicit approval for V4-O Production Operations Center implementation
- next_action: Await explicit approval for V4-O Production Operations Center implementation
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
