# Pilot-2 Worker Pool MVP

- pilot_id: PILOT-2-WORKER-POOL-MVP
- generated_at: 2026-06-24
- status: PASS_READY_FOR_DRY_RUN_USE
- scope: local worker pool only

## Summary

Pilot-2 establishes a local Worker Pool control surface for ANKSEN Agent Studio. It prepares worker registry, profile, health, assignment, isolation, cancellation, kill-switch, and audit log contracts without connecting to remote servers or starting production workers.

The MVP registers one local worker:

- worker_id: `local-codex-1`
- runtime: `codex-cli`
- adapter: `codex-cli`
- worker_kind: `local`
- risk: `MEDIUM`
- execution_mode: `local_repo_execute`

## Package

`packages/worker-pool/`

Schemas:

- `schemas/worker-registry.schema.json`
- `schemas/worker-profile.schema.json`
- `schemas/worker-health.schema.json`
- `schemas/worker-assignment.schema.json`
- `schemas/worker-isolation-policy.schema.json`
- `schemas/worker-cancellation.schema.json`
- `schemas/worker-audit-log.schema.json`

Examples:

- `examples/worker-registry.example.json`
- `examples/worker-health.example.json`
- `examples/worker-assignment.example.json`
- `examples/worker-isolation-policy.example.json`
- `examples/worker-cancellation.example.json`
- `examples/worker-audit-log.example.json`

## CLI

```bash
node packages/orchestrator-core/bin/studio.mjs worker list --dry-run
node packages/orchestrator-core/bin/studio.mjs worker health --dry-run
node packages/orchestrator-core/bin/studio.mjs worker assign --runtime codex-cli --dry-run
node packages/orchestrator-core/bin/studio.mjs worker cancel --worker local-codex-1 --dry-run
```

## Governance

| Worker Class | Default Risk | Default Mode | Execution |
| --- | --- | --- | --- |
| local | LOW/MEDIUM | `local_repo_execute` | Allowed for governed local repository tasks. |
| remote | HIGH | `proposal_only` | Blocked until a proposal is approved. |
| production | CRITICAL | `human_approval_required` | Blocked until explicit CRITICAL approval exists. |

## Isolation Policy

The local worker policy allows only Studio-owned local repository paths:

- `docs/release/**`
- `runtime/pilot/**`
- `packages/worker-pool/**`

Forbidden paths include:

- `jinhu-smart-park/**`
- `../jinhu-smart-park/**`
- `.env*`
- secret/private key path patterns

## Kill Switch

`worker cancel --worker local-codex-1 --dry-run` produces a cancellation plan with:

- kill_switch_status: `ARMED_DRY_RUN`
- would_cancel_active_tasks: yes
- would_stop_worker_process: no

No process is stopped in Pilot-2 because no long-running worker process is started.

## Safety

- Server connections: disabled.
- SSH: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Credential values: not read.
- Managed project writes: disabled.
- `jinhu-smart-park` modifications: forbidden.

## Validation

Required validation:

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs worker list --dry-run
node packages/orchestrator-core/bin/studio.mjs worker health --dry-run
node packages/orchestrator-core/bin/studio.mjs worker assign --runtime codex-cli --dry-run
node packages/orchestrator-core/bin/studio.mjs worker cancel --worker local-codex-1 --dry-run
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
git diff --check
```

## Result

Pilot-2 is ready for local dry-run use. It does not prove remote worker execution. Remote worker and production worker classes remain governed future work.
