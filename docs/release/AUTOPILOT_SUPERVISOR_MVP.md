# Autopilot Supervisor MVP

## Objective

Autopilot Supervisor upgrades ANKSEN Agent Studio from manual instruction copying into a platform-level supervisor that can inspect the current platform state, infer the next safe step, and produce an auditable action plan.

The MVP does not execute Agents. It does not write managed projects. It only produces dry-run output or platform-side run records under `autopilot-runs/`.

## Inputs

Autopilot reads:

- `README.md`
- `docs/release/**`
- `examples/jinhu-smart-park/runtime-memory/**`
- `examples/jinhu-smart-park/task-proposals/**`
- `examples/jinhu-smart-park/execution-reports/**`
- `packages/**/schemas/**`
- `packages/**/examples/**`

These sources let Autopilot identify extraction status, managed project adapter status, remote execution evidence, runtime memory state, task proposal state, runtime center readiness, and schema/example coverage.

## Commands

```bash
node packages/orchestrator-core/bin/studio.mjs autopilot --goal "继续推进 V4" --dry-run
node packages/orchestrator-core/bin/studio.mjs autopilot --goal "继续推进 V4" --apply --max-steps 1
```

`--max-steps 1` is mandatory in the MVP. Infinite loops are not allowed.

## Current Stage Detection

The MVP evaluates:

- Extraction completed: based on `ANKSEN_AGENT_STUDIO_EXTRACTION_CLOSURE_REPORT.md`.
- Remote Execute completed: based on platform-side execution reports.
- Next stage: `V4-I Agent Runtime Center`.
- Runtime Center bootstrapped: based on `packages/runtime-center` and `AGENT_RUNTIME_CENTER_PRD.md`.

## Action Shape

Autopilot emits one action with:

- `title`
- `reason`
- `target_package`
- `expected_files`
- `validation_commands`
- `risk`
- `approval_required`
- `execution_mode`

High-risk actions must have an approval gate and are never auto-executed by this MVP.

## Apply Behavior

`--apply --max-steps 1` writes:

- `autopilot-runs/<run_id>.json`
- `autopilot-runs/<run_id>.md`

Apply does not:

- execute Agents
- modify `jinhu-smart-park`
- deploy
- run production migration/seed/reset/cleanup
- push or merge
- perform an unbounded loop

## Stop Condition

Every run records:

```text
STOP: max_steps=1 reached after generating one supervised action.
```

The run is considered complete only when the action plan has been emitted or persisted and safety boundaries remain intact.

## Next Iterations

1. Add policy bundles for deciding whether an action can become a task proposal.
2. Connect Autopilot to project task-plan in proposal-only mode.
3. Add approval queue integration.
4. Add Console view for Autopilot runs.
5. Add bounded multi-step mode after per-step approval checkpoints exist.
