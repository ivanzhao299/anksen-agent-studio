# ANKSEN Agent Studio Console

This package is the local Pilot Console for Agent Studio. It includes typed view-model exports and a dependency-free local Web Console under `web/`.

## Local Start

```bash
pnpm --filter @anksen/console dev
```

The default URL is `http://127.0.0.1:4317`.

Static build:

```bash
pnpm --filter @anksen/console build
```

## Views

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
- Pilot Status

## Data Sources

The current implementation uses local fixtures and runtime memory snapshots:

- `runtime/global/*`
- `runtime/projects/jinhu-smart-park/*`
- `packages/*/examples/*.json`
- `packages/skill-router/registry/*.json`
- `autopilot-runs/*.json`

Pilot-5 does not connect Phoenix ERP through a local path. Future onboarding should use a GitHub Repo Connector flow.

## Exports

- `consoleFixture`
- `consoleNavigation`
- `consolePanels`
- `consoleReadOnlySummary`
- `getConsolePanel(id)`
- `getConsoleModuleDetails(id)`
- `getConsoleViewModel()`
- `consoleActionCenter`
- `consoleActions`
- `buildConsoleActionPlan(id)`

## Data Policy

- Does not connect to a real database.
- Does not call external services.
- Does not execute Agents.
- Does not modify managed projects.
- Does not deploy or run production operations.
- Does not access servers.
- Does not read or store real credential values.
- Does not connect Phoenix ERP through a local path.


## Operable Read-Only Controls

The Console exposes command descriptors for dry-run and proposal-only actions. These descriptors are view-model data only; they do not execute commands, call external services, deploy, connect to servers, read credential values, or write managed projects.

- Context Summary
- Runtime Health
- Project Inspect
- Worker Health
- Credential Validate
- Governance Check
- Autopilot Dry Run
- Proposal Review
- Proposal Approve (proposal-only)
