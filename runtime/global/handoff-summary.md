# ANKSEN Agent Studio Runtime Handoff

Generated at: 2026-06-23T12:56:30.821Z

## Platform

- platform_status: GO
- repo_branch: main
- repo_clean: no
- repo_head: c35b96b chore: add autopilot runner

## V4 Stage

- current_stage: V4-K Console Read-Only preparation
- next_stage: V4-K Console Read-Only MVP
- next_action: Prepare V4-K Console Read-Only MVP
- target_package: apps/console
- risk: MEDIUM
- execution_mode: local_repo_execute

## Managed Projects

- jinhu-smart-park: doctor=GO, repo_clean=yes, memory=runtime/projects/jinhu-smart-park

## Required Startup Command

```bash
node packages/orchestrator-core/bin/studio.mjs context summary
```

## Required Reading

- runtime/global/codex-startup.md
- runtime/global/handoff-summary.md
- runtime/global/platform-state.json
- runtime/global/roadmap-memory.json
- runtime/projects/jinhu-smart-park/handoff-summary.md
- README.md

## Safety Boundaries

- Do not modify jinhu-smart-park unless an explicit proposal is approved.
- Do not execute Agents from context commands.
- Do not deploy.
- Do not run production migration, seed, reset, cleanup, or production operations.
- Do not read or write real credential values.
- Keep Studio Context under runtime/global and Project Context under runtime/projects/<project_id>.
