# Pilot-5 Console Productization

- pilot_id: PILOT-5-CONSOLE-PRODUCTIZATION
- generated_at: 2026-06-24
- status: PASS_READY_FOR_LOCAL_USE
- scope: local Web Console only

## Summary

Pilot-5 turns the Console from a read-only data model into a runnable local Web Console. It uses a dependency-free Node HTTP server and static build script under `apps/console/web/`.

The Console reads local repository files only. It does not connect to a database, call external APIs, invoke models, connect to servers, deploy, run production operations, read credential values, or write managed projects.

Phoenix ERP is not connected in this pilot. It will be onboarded later through a GitHub Repo Connector instead of a presumed local path.

## Product Direction

ANKSEN Agent Studio Console is positioned as a unified AI development workspace, not a traditional backend administration page.

The primary user workflow is:

1. Select a project.
2. Enter a goal in a conversational task box.
3. Choose automatic planning, a specific AI/Agent, or plan-only mode.
4. Let Studio coordinate planning, Agent execution, validation/CI preparation, and reporting.

The homepage keeps only the user-facing controls needed for this workflow:

- goal input
- project selector
- AI/Agent selector
- execution timeline
- result report
- necessary configuration entry

Runtime, Worker, Governance, Credential, Memory, and Autopilot internals remain implemented in the backend and internal routes, but they are not exposed as the main homepage product surface.

Current priority projects:

- `jinhu-smart-park`: connected; primary pilot and go-live readiness target
- `phoenix-erp`: waiting for GitHub remote onboarding

## Language Policy

The Pilot Console defaults to Simplified Chinese (`zh-CN`). Enterprise pilot usage prioritizes Chinese labels, navigation, module titles, status text, and risk hints.

The i18n structure is in place for later bilingual support:

- `apps/console/src/i18n/zh-CN.ts`
- `apps/console/src/i18n/en-US.ts`
- `apps/console/src/i18n/index.ts`

The current `en-US` package is a placeholder structure only. Full English translation is deferred until the enterprise pilot language requirements settle.

## Start Console

Preferred command:

```bash
pnpm --filter @anksen/console dev
```

Root convenience command:

```bash
pnpm console:dev
```

Default local URL:

```text
http://127.0.0.1:4317
```

Static build:

```bash
pnpm --filter @anksen/console build
```

## Page Modules

- AI 工作台
- 项目
- Agent
- 任务
- 报告
- 配置

Internal diagnostic routes remain available for runtime, credentials, governance, planning, memory, and pilot status, but they are not the primary navigation.

## Local Data Sources

The Console reads:

- `runtime/global/platform-state.json`
- `runtime/global/roadmap-memory.json`
- `runtime/global/v5-roadmap.json`
- `runtime/projects/jinhu-smart-park/project-state.json`
- `packages/runtime-center/examples/*.json`
- `packages/worker-pool/examples/*.json`
- `packages/governance-center/examples/*.json`
- `packages/credential-vault/examples/*.json`
- latest JSON record in `autopilot-runs/`
- `apps/console/examples/console-actions.example.json`

The Console does not read Phoenix ERP local files in Pilot-5.

## Console Smoke

New command:

```bash
node packages/orchestrator-core/bin/studio.mjs console smoke --dry-run
```

Smoke validates:

- required routes exist
- data files are readable
- dashboard model can be generated
- external calls are disabled
- credential values are not read
- managed project writes are disabled
- deploy and production operations are disabled
- Phoenix ERP local path is not connected

## Action Policy

Console Actions follow Governance Gate:

- LOW: local safe execution allowed
- MEDIUM: local safe execution allowed
- HIGH: proposal-only
- CRITICAL: human approval required

Managed project writes, deploy, production operations, server access, external model calls, and credential value reads remain disabled unless a later approved governance flow explicitly enables them.

## GitHub Repo Connector Path

Future Phoenix ERP onboarding should use a GitHub Repo Connector flow:

1. Read repository metadata from GitHub.
2. Create project registry entry as planned/not connected.
3. Generate runtime memory from repository metadata.
4. Require governance review before local checkout or managed project writes.

Pilot-5 does not implement that connector.

## Validation

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs console smoke --dry-run
pnpm --filter @anksen/console typecheck
pnpm --filter @anksen/console build
git diff --check
git status
```

Expected result: all checks pass with no external calls, no secrets read, no managed project writes, no deploy, and no production operations.
