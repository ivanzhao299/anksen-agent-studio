# ANKSEN Agent Studio Console

This package is the read-only V4 Console view model for the future Next.js App Router surface.

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

## Data Sources

The current implementation uses local fixtures and runtime memory snapshots:

- `runtime/global/*`
- `runtime/projects/jinhu-smart-park/*`
- `packages/*/examples/*.json`
- `packages/skill-router/registry/*.json`
- `autopilot-runs/*.json`

## Exports

- `consoleFixture`
- `consoleNavigation`
- `consolePanels`
- `consoleReadOnlySummary`
- `getConsolePanel(id)`
- `getConsoleModuleDetails(id)`
- `getConsoleViewModel()`

## Data Policy

- Does not connect to a real database.
- Does not call external services.
- Does not execute Agents.
- Does not modify managed projects.
- Does not deploy or run production operations.
- Does not access servers.
- Does not read or store real credential values.
