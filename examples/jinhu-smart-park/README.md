# Jinhu Smart Park Project Adapter

This example shows how ANKSEN Agent Studio can read the existing `jinhu-smart-park` business repository through a project adapter.

The adapter is read-only in this extraction phase. It does not move platform state out of the business repository and does not execute Agent tasks.

## Config

```text
examples/jinhu-smart-park/project.config.example.json
```

The config points to:

- main project worktree
- agent-1 through agent-5 worktrees
- existing `ops/agent-orchestrator` project state
- Runtime Memory files
- safe read paths
- guarded business and production paths

## Inspect

Run from the `anksen-agent-studio` repository root:

```bash
node packages/orchestrator-core/bin/studio.mjs project inspect --config examples/jinhu-smart-park/project.config.example.json --dry-run
```

The inspection prints:

- project id and project path
- Git repository status
- detected stack
- available commands
- guarded paths
- Runtime Memory status
- recommended next actions

## Safety Rules

- No Agent execution.
- No deploy.
- No production migration, seed, reset, cleanup, or production data operation.
- No write to `jinhu-smart-park`.
- Business paths remain guarded by adapter policy.

