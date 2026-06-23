# Web Console Read-Only V4 Enhancement

## Goal

Expand `apps/console` from a minimal read-only skeleton into a V4 module status surface.

The enhancement keeps the Console as local fixtures and view-model code only. It does not add database access, API routes, external service calls, Agent execution, deploy, production operations, server access, managed project writes, or credential value access.

## Covered Modules

- Dashboard
- Projects
- Project Connector / Stack Detector / Debug Specialist
- Runtime Center
- Runtime Adapters
- Credential Vault
- Governance Center
- Planning Center
- Autopilot Runs
- Memory / Context
- Evolution / Discovery

## Data Mapping

The view model maps local read-only sources:

- `runtime/global/*`
- `runtime/projects/jinhu-smart-park/*`
- `packages/project-connector/examples/*`
- `packages/runtime-center/examples/*`
- `packages/runtime-adapters/examples/*`
- `packages/credential-vault/examples/*`
- `packages/governance-center/examples/*`
- `packages/planning-center/examples/*`
- `packages/evolution-center/examples/*`
- `packages/discovery-engine/examples/*`
- `autopilot-runs/*`

## Implementation

- `apps/console/src/fixtures.ts` now contains a V4 module fixture snapshot.
- `apps/console/src/navigation.ts` exposes the 11 read-only Console sections.
- `apps/console/src/view-model.ts` builds panel summaries, per-section details, and safety summaries.
- `apps/console/src/index.ts` exports the expanded view-model API.

## Safety

- Managed project writes: disabled.
- Agent execution: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Server access: disabled.
- Credential values: not read.
- `jinhu-smart-park` business repository: not modified.

## Validation

```bash
pnpm typecheck
pnpm lint:check
git diff --check
git status
```
