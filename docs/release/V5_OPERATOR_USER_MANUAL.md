# V5 Operator User Manual

- batch_id: batch-plan-bec739c319
- owner_agent: agent-1
- execution_mode: local_repo_execute

## Purpose

This manual gives operators a safe V5 workflow for reading roadmap state, reviewing batch plans, and approving future work without starting real Workers or production operations.

## Operator Workflow

1. Review the V5 roadmap with `node packages/orchestrator-core/bin/studio.mjs autopilot batch --goal "继续推进 V5" --dry-run`.
2. Confirm LOW and MEDIUM tasks remain scoped to this repository.
3. Keep HIGH and CRITICAL tasks in proposal-only mode.
4. Review every batch run report before authorizing a future executor.

## Hard Boundaries

- Do not deploy.
- Do not run production operations.
- Do not connect to servers.
- Do not read or store real credential values.
- Do not modify managed projects, including jinhu-smart-park.
