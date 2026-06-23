# ANKSEN Agent Studio V4 Roadmap

## Goal

V4 should turn ANKSEN Agent Studio from a project-local orchestrator extraction into a reusable AI Software Factory platform that can connect to multiple repositories through explicit project connectors.

## Proposed Tracks

| Track | Objective | Current Status |
| --- | --- | --- |
| V4-A Project Connector Runtime | Standardize `--project` adapters, frozen path policy, and worktree discovery. | Complete for initial Jinhu connector. |
| V4-B Core Engine Parity | Port reusable doctor, skill routing, goal planning, runtime memory, discovery, and evolution logic with fixture parity tests. | In progress through package contracts and CLI dry-runs. |
| V4-C Console Read-Only MVP | Build a standalone `apps/console` that reads platform and project state without mutation. | Complete as local fixture-backed read-only skeleton. |
| V4-D Hosted Runtime Adapters | Add guarded adapters for Codex CLI, browser, and future hosted execution. | Planned. |
| V4-E Multi-Project Workspace | Support multiple project connectors in one console. | MVP complete as read-only workspace contracts under `packages/project-connector`. |
| V4-F Governance and Release Gates | Add approvals, audit trail, policy bundles, and release readiness gates. | MVP complete as dry-run-only governance gates under `packages/production-ops`. |

## Multi-Project Workspace MVP

The first workspace model is read-only and context-backed:

- Source of truth: `runtime/global/codex-context-index.json` and `runtime/projects/<project_id>`.
- Project connector package: `packages/project-connector`.
- Example workspace: `packages/project-connector/examples/multi-project-workspace.example.json`.
- Managed project writes: disabled.
- Deploy and production operations: forbidden.
- Credential values: not read.

## Governance and Release Gates MVP

The first governance model is local and dry-run only:

- Source of truth: `packages/production-ops/examples/governance-policy.example.json` and `packages/production-ops/examples/release-gates.example.json`.
- Schema bundle: `packages/production-ops/schemas/`.
- CLI validation: `node packages/orchestrator-core/bin/studio.mjs production-ops validate --dry-run`.
- Deploy execution: forbidden.
- Production operations: forbidden.
- Managed project writes: blocked unless a separate explicit approval exists.
- Credential values: not read or stored.

## Safety Boundary

V4 must keep business repositories external. Deploy, production migration, production seed, reset, cleanup, and production data writes remain forbidden unless a separate approved production-ops implementation exists.
