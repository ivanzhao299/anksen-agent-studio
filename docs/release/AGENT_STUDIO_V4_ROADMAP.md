# ANKSEN Agent Studio V4 Roadmap

## Goal

V4 should turn ANKSEN Agent Studio from a project-local orchestrator extraction into a reusable AI Software Factory platform that can connect to multiple repositories through explicit project connectors.

## Proposed Tracks

| Track | Objective |
| --- | --- |
| V4-A Project Connector Runtime | Standardize `--project` adapters, frozen path policy, and worktree discovery. |
| V4-B Core Engine Parity | Port reusable doctor, skill routing, goal planning, runtime memory, discovery, and evolution logic with fixture parity tests. |
| V4-C Console Read-Only MVP | Build a standalone `apps/console` that reads platform and project state without mutation. |
| V4-D Hosted Runtime Adapters | Add guarded adapters for Codex CLI, browser, and future hosted execution. |
| V4-E Multi-Project Workspace | Support multiple project connectors in one console. |
| V4-F Governance and Release Gates | Add approvals, audit trail, policy bundles, and release readiness gates. |

## Safety Boundary

V4 must keep business repositories external. Deploy, production migration, production seed, reset, cleanup, and production data writes remain forbidden unless a separate approved production-ops implementation exists.

