# Console Chain Report

- validation_id: V5-CONSOLE-CHAIN
- generated_at: 2026-06-24
- status: PARTIAL
- score: 64/100

## Chain

Console -> Projects -> Runtime -> Governance -> Autopilot -> Evolution -> Memory -> Discovery

## Evidence

Validation:

- `pnpm typecheck` passes for `apps/console`.
- Console fixtures include Projects, Runtime Center, Runtime Adapters, Credential Vault, Governance, Planning, Autopilot, Memory, Evolution, and Discovery.
- Console V5 Roadmap view-model data now includes completion, remaining gaps, recent run history, and proposal-only stage flags.

Direct runtime import check:

- Attempting to import `apps/console/src/index.ts` directly with Node failed because source files use `.js` ESM specifiers and no compiled JS output exists in `src`.

## Product Readiness

PARTIAL. The Console has a typed read-only view-model and local fixtures for the requested surfaces, but it is not yet a runnable operator UI in this repository validation. The source typechecks, yet direct runtime import requires a build/transpile path.

## Remaining Gaps

- Add a real Console app entrypoint or build artifact validation.
- Add route/page-level rendering checks for Projects, Runtime, Governance, Autopilot, Evolution, Memory, and Discovery.
- Add V5 completion and proposal queue views to the UI layer, not only the TypeScript view-model.

## Safety

- Database: not connected.
- External services: not called.
- Agent execution: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Credential values: not read.
