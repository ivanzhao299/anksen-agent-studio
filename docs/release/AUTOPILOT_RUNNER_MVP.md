# Autopilot Runner MVP

## Objective

Autopilot Runner reduces manual instruction transfer between ChatGPT and Codex by letting ANKSEN Agent Studio execute one bounded, safe platform-repository step from a Planning Center `next_action`.

The MVP is intentionally single-step. It does not create an autonomous loop, does not execute managed-project work, and does not bypass approval gates.

## Commands

```bash
node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "继续推进 V4" --dry-run
node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "继续推进 V4" --apply --max-steps 1
```

`--max-steps 1` is mandatory for apply mode.

## Execution Policy

Autopilot Runner may execute only when all conditions are true:

- `target_project` is `anksen-agent-studio`
- risk is `LOW` or `MEDIUM`
- the action does not reference deploy, production operations, destructive data operations, or secret values
- the selected validation commands are in the runner allowlist

Otherwise the runner remains in proposal-only mode.

## Local Repository Execution

For a safe local action, the runner:

- creates an internal task
- records an executor prompt and run plan
- selects a local code runtime through Runtime Center dry-run metadata
- runs validation commands
- writes `autopilot-runs/<run_id>.json`
- writes `autopilot-runs/<run_id>.md`
- commits the bounded local result

## Run Artifact Contract

Each run record includes:

- `goal`
- `planning_output`
- `selected_action`
- `execution_mode`
- `commands_run`
- `changed_files`
- `validation_result`
- `commit_hash`
- `next_recommendation`

## Safety

Autopilot Runner does not:

- execute Agents
- deploy
- run production operations
- read or write real credential values
- read real environment variable values
- write API keys, SSH keys, tokens, passwords, or private keys
- modify `jinhu-smart-park` unless a future managed-project proposal is explicitly approved

## Next Milestones

1. Add structured proposal files for managed-project and HIGH-risk actions.
2. Add a Console view for Autopilot run history and next recommendations.
3. Add per-step approval checkpoints before any multi-step mode.
4. Add runtime usage metrics for local repository automation.
