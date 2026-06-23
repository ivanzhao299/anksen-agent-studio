# Governance and Release Gates MVP

## Scope

V4-M adds a local, dry-run-only governance layer for release readiness evidence. It defines policy and gate metadata, validates that forbidden operations stay blocked, and exposes Studio CLI commands for audit-style checks.

This MVP does not execute deploys, production operations, Agents, server connections, or credential value reads.

## Files

- `packages/production-ops/schemas/governance-policy.schema.json`
- `packages/production-ops/schemas/release-gate.schema.json`
- `packages/production-ops/schemas/release-evidence.schema.json`
- `packages/production-ops/examples/governance-policy.example.json`
- `packages/production-ops/examples/release-gates.example.json`
- `packages/production-ops/lib/production-ops-utils.mjs`
- `packages/production-ops/src/index.ts`

## CLI

All commands are dry-run only:

```bash
node packages/orchestrator-core/bin/studio.mjs production-ops policy --dry-run
node packages/orchestrator-core/bin/studio.mjs production-ops gates --dry-run
node packages/orchestrator-core/bin/studio.mjs production-ops validate --dry-run
```

## Safety Gates

The MVP explicitly blocks:

- Agent execution
- Managed project writes
- Deploy execution
- Production operations
- Credential value access

The gate validator treats those blocks as expected safety evidence. A forbidden operation that is not blocked is a validation failure.

## Validation

Required checks:

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs production-ops validate --dry-run
git diff --check
git status
```

## Proposal

Implemented from approved proposal:

`proposal-v4-m-governance-release-gates-2026-06-23T144920143Z-3868db72`
