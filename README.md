# ANKSEN Agent Studio

ANKSEN Agent Studio is the standalone platform workspace for goal-driven agent orchestration, project runtime memory, skill routing, resident observation, discovery, and future console operations.

This repository starts as a platform skeleton plus reusable core contracts. It does not contain Jinhu Smart Park business code, project task evidence, queue state, events, run logs, reports, or runtime evidence.

## Workspace Layout

```text
anksen-agent-studio/
  apps/
    console/
  packages/
    orchestrator-core/
    runtime-adapters/
    skill-router/
    evolution-center/
    discovery-engine/
    runtime-memory/
    project-connector/
    production-ops/
  docs/
    release/
  examples/
    jinhu-smart-park/
```

## Package Responsibilities

- `apps/console`: future Agent Studio Web Console.
- `packages/orchestrator-core`: Goal Engine, Planner, task lifecycle, event store, audit, integration, finalize, and autonomous loop core contracts.
- `packages/runtime-adapters`: Codex CLI, Git, filesystem, browser, and future hosted runtime adapters.
- `packages/skill-router`: skill registry and natural-language skill routing.
- `packages/evolution-center`: Resident Observer, failure patterns, learning log, and improvement backlog.
- `packages/discovery-engine`: legacy discovery, browser/API discovery, schema inference, entity mapping, and replica planning/scoring.
- `packages/runtime-memory`: durable platform memory, handoff summaries, and validation contracts.
- `packages/project-connector`: project configuration and adapter contracts for business repositories.
- `packages/production-ops`: production operation planning contracts only. It must not execute deploy, migration, seed, reset, cleanup, or production data writes without a separately approved implementation.

## Initial Commands

```bash
pnpm install
pnpm typecheck
pnpm lint:check
pnpm studio:doctor
```

Useful dry-run CLI examples:

```bash
node packages/orchestrator-core/bin/studio.mjs project inspect --config examples/jinhu-smart-park/project.config.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs project parity --config examples/jinhu-smart-park/project.config.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs project import-memory --config examples/jinhu-smart-park/project.config.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs project memory --config examples/jinhu-smart-park/project.config.example.json --summary
node packages/orchestrator-core/bin/studio.mjs project task-plan --config examples/jinhu-smart-park/project.config.example.json --text "优化智慧园区仪表盘移动端样式" --dry-run
node packages/orchestrator-core/bin/studio.mjs project task-plan --config examples/jinhu-smart-park/project.config.example.json --text "优化智慧园区仪表盘移动端样式" --apply-proposal
node packages/orchestrator-core/bin/studio.mjs project proposals --config examples/jinhu-smart-park/project.config.example.json
node packages/orchestrator-core/bin/studio.mjs skill-route --text "生成一份推进方案 Word 文件" --dry-run
node packages/orchestrator-core/bin/studio.mjs goal-to-queue --text "继续把 Agent Studio 提升到 99%" --dry-run
node packages/orchestrator-core/bin/studio.mjs discovery --target packages/discovery-engine/examples/discovery-target.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs runtime-memory --summary
```

## Safety Rules

- Do not import or copy business code from `jinhu-smart-park`.
- Do not copy project evidence such as `events/**`, `queue/*.json`, `runs/**`, `reports/**`, `results/**`, or runtime memory snapshots.
- Do not deploy.
- Do not run production migration, seed, reset, cleanup, or production operations.
- Treat project repositories as external adapters accessed through explicit `project.config` files.

## Bootstrap Status

This first commit establishes the workspace skeleton, package boundaries, and one example project connector for `jinhu-smart-park`.
