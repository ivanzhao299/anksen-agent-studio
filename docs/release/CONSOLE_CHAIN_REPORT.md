# Console Chain Report

- validation_id: V5-CONSOLE-CHAIN
- generated_at: 2026-06-24
- status: PASS
- score: 90/100

## Chain

Console -> Projects -> Runtime -> Governance -> Autopilot -> Evolution -> Memory -> Discovery

## Evidence

Validation:

- `pnpm typecheck` passes for `apps/console`.
- `apps/console/src/route-manifest.ts` declares route-level read-only render metadata.
- `node packages/orchestrator-core/bin/studio.mjs console render --dry-run` validates Dashboard, Projects, Runtime, Governance, Autopilot, and Memory route coverage.
- Console fixtures include Projects, Project Connector, Runtime Center, Runtime Adapters, Credential Vault, Governance, Planning, Autopilot, Memory, Evolution, Discovery, and V5 roadmap completion.
- Console read-model now includes the second managed project placeholder `phoenix-erp`.

## Product Readiness

PASS. The Console still does not connect to a database or start a Next.js server, but it has a verifiable route/render smoke for the key operator pages required by this sprint.

## Remaining Gaps

- A future UI sprint can add browser-level visual smoke once the Console is run as a Next.js app.
- Approval queues should remain read-only until a separate mutation approval workflow is approved.

## Safety

- Database: not connected.
- External services: not called.
- Agent execution: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Credential values: not read.
