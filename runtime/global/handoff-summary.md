# ANKSEN Agent Studio Runtime Handoff

Generated at: 2026-06-29T03:58:28Z

## Platform

- platform_status: READY_FOR_PILOT
- repo_branch: main
- repo_clean: yes
- repo_head: ac88a23 chore(context): refresh platform and project memory

## Current Stage

- current_stage: V5 closure complete; Pilot local control plane active; managed-project branch sync pending
- next_stage: Continue single-worktree development on jinhu-smart-park feature branch; resync stale agent worktrees before any multi-agent dispatch.
- next_action: Stabilize jinhu-smart-park branch topology before multi-agent execution
- target_project: jinhu-smart-park
- risk: MEDIUM
- execution_mode: single_worktree_until_resynced

## Managed Projects

- jinhu-smart-park: doctor=CONDITIONAL_GO, repo_branch=feature/engineering-project-delivery-runtime, repo_clean=yes, memory=runtime/projects/jinhu-smart-park
- phoenix-erp: status=PLANNED, connection=NOT_CONNECTED, memory=runtime/projects/phoenix-erp

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
- docs/release/V5_PRODUCTIZATION_CLOSURE_REPORT.md
- docs/release/PILOT_5_CONSOLE_PRODUCTIZATION.md
- README.md

## Safety Boundaries

- Do not push jinhu-smart-park directly to main; keep active development on reviewed feature or integration branches until merge time.
- Do not dispatch stale agent worktrees until they are resynced to the active managed-project branch.
- Do not deploy.
- Do not run production migration, seed, reset, cleanup, or production operations.
- Do not read or write real credential values.
- Keep Studio Context under runtime/global and Project Context under runtime/projects/<project_id>.
