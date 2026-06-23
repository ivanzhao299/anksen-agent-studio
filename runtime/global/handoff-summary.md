# ANKSEN Agent Studio Runtime Handoff

Generated at: 2026-06-23T15:59:16.528Z

## Platform

- platform_status: GO
- repo_branch: main
- repo_clean: no
- repo_head: 89d0bdf chore(project-connector): add stack detector and debug specialist mvp

## V4 Stage

- current_stage: V4-O Production Operations Center approval gate
- next_stage: Await explicit approval for V4-O Production Operations Center implementation
- next_action: Await explicit approval for V4-O Production Operations Center implementation
- target_package: docs/release
- risk: HIGH
- execution_mode: blocked

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
