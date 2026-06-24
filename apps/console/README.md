# ANKSEN Agent Studio Console

This package is the local Pilot Console for Agent Studio. It includes typed view-model exports and a dependency-free local Web Console under `web/`.

## Local Start

```bash
pnpm --filter @anksen/console dev
```

The default URL is `http://127.0.0.1:4317`.

Root convenience command:

```bash
pnpm console:dev
```

Static build:

```bash
pnpm --filter @anksen/console build
```

## Language

The Pilot Console defaults to `zh-CN` for enterprise internal testing. The i18n structure is available under `src/i18n/`; `en-US` is currently a placeholder package for later bilingual support.

## Views

- 总览
- 项目
- 项目接入 / 技术栈检测 / 调试专家
- 运行时
- 运行适配器
- 凭证
- 治理
- 规划
- 自动驾驶
- 记忆中心
- 演进 / 发现
- 试运行状态

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

## Task Workflow

The Console is now task-driven. Use the home page task workbench as the primary entry:

1. Enter a goal in the large goal box.
2. Select the project and action.
3. Click `生成计划` to call:

```bash
node packages/orchestrator-core/bin/studio.mjs console action-plan --action <action_id> --goal "<goal>" --project <project_id> --dry-run
```

4. Review current status, command summary, risk, output, stderr, and action log path.
5. Click `开始执行` only when the plan is LOW or MEDIUM and the Governance Gate allows local execution.

HIGH actions stay `proposal_only`. CRITICAL actions stay `human_approval_required`.

## Action Server

The local Action Server only listens on `127.0.0.1`. Console buttons call local API routes:

- `POST /api/action-plan`
- `POST /api/action-run`
- `GET /api/action-log/latest`

Action logs are written to:

```text
autopilot-runs/console-actions/
```

Smoke test:

```bash
node packages/orchestrator-core/bin/studio.mjs console action-server-smoke --dry-run
```

## Data Policy

- Does not connect to a real database.
- Does not call external services.
- Executes only LOW/MEDIUM local allowlist commands.
- Does not modify managed projects.
- Does not deploy or run production operations.
- Does not access servers.
- Does not read or store real credential values.
- Does not connect Phoenix ERP through a local path.


## Operable Controls

The Console exposes local task actions behind Governance Gate:

- LOW / MEDIUM: local allowlist execution
- HIGH: proposal-only
- CRITICAL: human approval required

Current high-signal buttons:

- `生成计划`
- `开始执行`
- `继续 Smart Park`
- `检查上线阻断项`
- `生成上线计划 Proposal`
- `查看待审批 Proposal`
- `查看 Worker 状态`
