# Production Operations Center Dry-Run MVP

## Goal

V4 adds a Production Operations Center dry-run layer so Agent Studio can model future server configuration, deployment, backup, rollback, security hardening, and monitoring workflows without executing them.

This MVP is a planning and safety surface only. It does not connect to servers, open SSH sessions, deploy, run production operations, modify managed projects, or read/write real credentials.

## Package

`packages/production-ops/`

Schemas:

- `server-registry.schema.json`
- `environment-provisioning-plan.schema.json`
- `deploy-plan.schema.json`
- `backup-plan.schema.json`
- `rollback-plan.schema.json`
- `security-hardening-plan.schema.json`
- `monitoring-check.schema.json`
- existing governance/release evidence schemas

Examples:

- `server-registry.example.json`
- `environment-provisioning-plan.example.json`
- `deploy-plan.example.json`
- `backup-plan.example.json`
- `rollback-plan.example.json`
- `security-hardening-plan.example.json`
- `monitoring-check.example.json`

## CLI

All commands are dry-run only:

```bash
node packages/orchestrator-core/bin/studio.mjs production server-list --dry-run
node packages/orchestrator-core/bin/studio.mjs production deploy-plan --dry-run
node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run
node packages/orchestrator-core/bin/studio.mjs production rollback-plan --dry-run
```

## Governance

- Every production action is HIGH risk by default.
- HIGH risk production actions remain `proposal_only`.
- Any real execution path requires CRITICAL human approval.
- Release gates keep these categories blocked:
  - deploy
  - production operation
  - server access
  - credential value access
  - managed project writes

The `production safety-check --dry-run` command evaluates both the Production Ops policy bundle and Governance Center action gates.

## Console Reservation

The read-only Console can display the Production Ops dry-run surface from local fixtures:

- server registry count
- plan count
- deploy plan status
- rollback plan status
- safety policy
- governance gate status

It must not add mutation controls for production execution.

## Safety

- Real SSH: disabled.
- Server connections: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Managed project writes: disabled.
- Credential values: not read.
- `jinhu-smart-park`: not modified.

## Validation

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs production server-list --dry-run
node packages/orchestrator-core/bin/studio.mjs production deploy-plan --dry-run
node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run
node packages/orchestrator-core/bin/studio.mjs production rollback-plan --dry-run
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
git diff --check
git status
```
