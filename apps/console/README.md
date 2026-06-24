# ANKSEN Agent Studio Console

This package is the local Pilot Console for Agent Studio. It includes typed view-model exports and a dependency-free local Web Console under `web/`.

## Local Start

```bash
pnpm --filter @anksen/console dev
```

The default URL is `http://127.0.0.1:4317`.

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

## Data Policy

- Does not connect to a real database.
- Does not call external services.
- Does not execute Agents.
- Does not modify managed projects.
- Does not deploy or run production operations.
- Does not access servers.
- Does not read or store real credential values.
- Does not connect Phoenix ERP through a local path.


## Operable Read-Only Controls

The Console exposes command descriptors for dry-run and proposal-only actions. These descriptors are view-model data only; they do not execute commands, call external services, deploy, connect to servers, read credential values, or write managed projects.

- Context Summary
- Runtime Health
- Project Inspect
- Worker Health
- Credential Validate
- Governance Check
- Autopilot Dry Run
- Proposal Review
- Proposal Approve (proposal-only)
