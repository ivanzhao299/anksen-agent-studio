# V5 Governance Validation Test Matrix

- batch_id: batch-plan-464dac0c47
- owner_agent: agent-2
- execution_mode: local_repo_execute

| Area | Command | Expected |
| --- | --- | --- |
| Typecheck | pnpm typecheck | PASS |
| Lint | pnpm lint:check | PASS |
| Governance | node packages/orchestrator-core/bin/studio.mjs governance check --dry-run | PASS |
| Batch Planner | node packages/orchestrator-core/bin/studio.mjs autopilot batch --goal "继续推进 V5" --dry-run | PASS |
| Diff Hygiene | git diff --check | PASS |

## Gate Policy

- LOW: automatic local repository execution may be planned.
- MEDIUM: Autopilot local repository execution may be planned.
- HIGH: proposal-only.
- CRITICAL: proposal-only with explicit human approval before any future execution.
