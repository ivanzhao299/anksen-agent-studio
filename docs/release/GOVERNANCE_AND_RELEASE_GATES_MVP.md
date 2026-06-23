# Governance and Release Gates MVP

## Goal

V4-M moves Agent Studio automation into a shared governance layer before any future Credential Vault, Runtime Adapter, or Production Operations Center capability can execute work.

The MVP is local-repository-only and dry-run-only. It defines policy files, approval rules, risk rules, release gates, and audit-oriented CLI checks. It does not deploy, run production operations, connect to servers, store credential values, or write to managed projects.

## Package

`packages/governance-center/`

Schemas:

- `governance-policy.schema.json`
- `approval-policy.schema.json`
- `release-gate.schema.json`
- `risk-policy.schema.json`

Examples:

- `governance-policy.example.json`
- `approval-policy.example.json`
- `release-gates.example.json`
- `risk-policy.example.json`

Runtime helper:

- `lib/governance-center-utils.mjs`

## Approval Matrix

| Risk | Automation Mode | Rule |
| --- | --- | --- |
| LOW | `automatic_execute` | Automatic execution is allowed after governance checks. |
| MEDIUM | `autopilot_execute` | Autopilot may execute one safe local step after governance checks. |
| HIGH | `proposal_only` | Execution must stop at proposal generation. |
| CRITICAL | `human_approval_required` | Explicit human approval is required. |

## CLI

All commands are dry-run only:

```bash
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run
node packages/orchestrator-core/bin/studio.mjs approval-policy --dry-run
```

## Autopilot Integration

Autopilot Runner now evaluates a selected action in this order before any local execution:

1. Governance check
2. Approval policy
3. Release gate
4. Execution decision

Only local `anksen-agent-studio` actions with LOW or MEDIUM risk and passing release gates can enter `local_repo_execute`. HIGH stops at proposal-only mode. CRITICAL requires human approval.

## Release Gate Blocks

The release gate policy keeps these categories blocked:

- Managed project writes
- Deploy
- Production operations
- Server access
- Credential value access

These blocks are expected safety evidence, not executable capabilities.

## Validation

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run
git diff --check
git status
```

## Proposal

Implemented from approved proposal:

`proposal-v4-m-governance-release-gates-2026-06-23T144920143Z-3868db72`
