# ANKSEN Agent Studio Bootstrap

## Objective

Bootstrap `anksen-agent-studio` as a standalone platform repository without migrating Jinhu Smart Park business code or large orchestrator logic.

## Initial Repository Boundary

This bootstrap establishes:

- pnpm workspace metadata
- package boundaries
- placeholder TypeScript exports
- release documentation
- one example project connector config
- reusable schema/example files copied from the project-local orchestrator
- an extraction-stage dry-run `studio.mjs` CLI

It does not copy Jinhu Smart Park business code, project task evidence, queue state, events, run logs, reports, results, or runtime memory snapshots.

## Target Architecture

```text
anksen-agent-studio
|-- apps/console
|-- packages/orchestrator-core
|-- packages/runtime-adapters
|-- packages/skill-router
|-- packages/evolution-center
|-- packages/discovery-engine
|-- packages/runtime-memory
|-- packages/project-connector
|-- packages/production-ops
|-- docs/release
`-- examples/jinhu-smart-park
```

## Package Plan

| Package | Responsibility |
| --- | --- |
| `orchestrator-core` | Goal, Planner, event store, queue projection, audit, integration, finalize contracts. |
| `runtime-adapters` | Codex CLI, Git, filesystem, browser, and future hosted runtime adapters. |
| `skill-router` | Skill registry and natural-language skill selection. |
| `evolution-center` | Resident Observer, failure patterns, learning log, and improvement backlog. |
| `discovery-engine` | Legacy discovery, schema inference, entity mapping, replica planning, scoring. |
| `runtime-memory` | Durable platform memory and handoff validation. |
| `project-connector` | External project adapter contract. |
| `production-ops` | Planning-only production operation contracts; no execution in bootstrap. |

## Jinhu Smart Park Connector

The first example connector is:

```text
examples/jinhu-smart-park/project.config.example.json
```

It describes how the standalone platform can later point at the existing Jinhu Smart Park repository without moving its business code or project evidence.

## Safety Rules

- No business code migration.
- No deploy.
- No production migration, seed, reset, cleanup, or production data operation.
- No modification to `jinhu-smart-park`.
- Production operations remain planning-only until a separately approved implementation exists.

## Bootstrap Validation

Run:

```bash
pnpm install
pnpm typecheck
pnpm lint:check
pnpm studio:doctor
git status --short
```

## Next Steps

1. Add fixture parity tests for the extracted CLI.
2. Promote dry-run command contracts into package-level APIs.
3. Add read-only Console shell.
4. Port one reusable capability at a time from `jinhu-smart-park/ops/agent-orchestrator`.
5. Keep project evidence in the business repository unless an explicit export/import flow is approved.
