# ANKSEN Agent Studio V4 Roadmap

## Goal

V4 should turn ANKSEN Agent Studio from a project-local orchestrator extraction into a reusable AI Software Factory platform that can connect to multiple repositories through explicit project connectors.

## Proposed Tracks

| Track | Objective | Current Status |
| --- | --- | --- |
| V4-A Project Connector Runtime | Standardize `--project` adapters, frozen path policy, and worktree discovery. | Complete for initial Jinhu connector. |
| V4-B Core Engine Parity | Port reusable doctor, skill routing, goal planning, runtime memory, discovery, and evolution logic with fixture parity tests. | In progress through package contracts and CLI dry-runs. |
| V4-C Console Read-Only MVP | Build a standalone `apps/console` that reads platform and project state without mutation. | Complete as local fixture-backed read-only skeleton. |
| V4-D Hosted Runtime Adapters | Add guarded adapters for Codex CLI, browser, and future hosted execution. | Runtime Adapter Marketplace MVP complete as dry-run registry under `packages/runtime-adapters`. |
| V4-E Multi-Project Workspace | Support multiple project connectors in one console. | MVP complete as read-only workspace contracts under `packages/project-connector`. |
| V4-F Governance and Release Gates | Add approvals, audit trail, policy bundles, risk matrix, and release readiness gates. | MVP complete as dry-run-only Governance Center under `packages/governance-center`, with Production Ops gates still blocked. |

## Multi-Project Workspace MVP

The first workspace model is read-only and context-backed:

- Source of truth: `runtime/global/codex-context-index.json` and `runtime/projects/<project_id>`.
- Project connector package: `packages/project-connector`.
- Example workspace: `packages/project-connector/examples/multi-project-workspace.example.json`.
- Managed project writes: disabled.
- Deploy and production operations: forbidden.
- Credential values: not read.

## Governance and Release Gates MVP

The unified governance model is local and dry-run only:

- Source of truth: `packages/governance-center/examples/*.example.json`.
- Schema bundle: `packages/governance-center/schemas/`.
- CLI validation: `node packages/orchestrator-core/bin/studio.mjs governance check --dry-run`.
- Approval matrix: LOW allows automation, MEDIUM allows Autopilot, HIGH requires proposal-only, and CRITICAL requires human approval.
- Autopilot gate order: governance check, approval policy, release gate, execution decision.
- Deploy execution: forbidden.
- Production operations: forbidden.
- Managed project writes: blocked unless a separate explicit approval exists.
- Credential values: not read or stored.

## Runtime Adapter Marketplace MVP

The first adapter marketplace is registry-backed and dry-run only:

- Source of truth: `packages/runtime-adapters/examples/runtime-adapters.example.json`.
- Schema bundle: `packages/runtime-adapters/schemas/`.
- CLI validation: `node packages/orchestrator-core/bin/studio.mjs adapter list --dry-run`.
- Invoke planning: `node packages/orchestrator-core/bin/studio.mjs adapter invoke-plan --runtime codex-cli --skill code_development --dry-run`.
- Runtime Center profiles reference `adapter_id`.
- Governance Center evaluates adapter metadata risk.
- Model invocation, credential value access, server access, deploy, production operations, and managed project writes remain disabled.

## Safety Boundary

V4 must keep business repositories external. Deploy, production migration, production seed, reset, cleanup, and production data writes remain forbidden unless a separate approved production-ops implementation exists.
