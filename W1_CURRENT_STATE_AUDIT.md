# W1 Current State Audit

审计时间：2026-07-05  
审计范围：ANKSEN Agent Studio 独立仓库（只读）  
仓库路径：`/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/anksen-agent-studio`

## 1. 当前项目定位摘要

当前仓库已经不是“空壳控制台”，而是一个偏本地优先、控制面优先的 Agent Studio 独立平台：

- 以 `apps/console` 作为本地控制台入口
- 以 `packages/*` 提供规划、治理、运行时、凭证、项目接入、Worker 池、访问控制等平台能力
- 以 `runtime/global`、`runtime/projects`、`autopilot-runs` 维护平台记忆、项目上下文和执行记录
- 以 `packages/orchestrator-core/bin/studio.mjs` 作为当前真正的 CLI 编排核心

从代码和文档来看，这个仓库的核心目标已经很明确：

1. 做一个统一的 AI Control Plane
2. 对接外部项目仓库，而不是把业务代码塞回 Studio 本仓库
3. 通过治理、规划、上下文、Worker 元数据和 Console 来驱动任务执行

结论：

- 这是一个**已具备平台骨架和多模块实现的本地控制面仓库**
- 但它还**不是一个完整的“控制面 + 实时 Worker Node 网络”产品**
- 当前更接近：**本地控制台 + 单体 CLI 编排器 + JSON runtime memory + dry-run / local execute 混合平台**

---

## 2. 当前目录结构摘要

### 顶层结构

```text
apps/
  console/

packages/
  access-center/
  credential-vault/
  discovery-engine/
  evolution-center/
  governance-center/
  mobile-stack-pack/
  orchestrator-core/
  planning-center/
  production-ops/
  project-connector/
  runtime-adapters/
  runtime-center/
  runtime-memory/
  skill-router/
  worker-pool/

runtime/
  global/
  local-services/
  pilot/
  projects/

docs/
  release/

examples/
  jinhu-smart-park/
  phoenix-erp/

autopilot-proposals/
autopilot-runs/
README.md
package.json
pnpm-workspace.yaml
```

### workspace / package 特征

- 使用 `pnpm workspace`
- workspace 仅包含：
  - `apps/*`
  - `packages/*`
- 当前只有 1 个 app：`apps/console`
- 当前有 15 个平台包
- 根仓库没有发现：
  - `plugins/` 目录
  - `infrastructure/` 或 `infra/` 目录
  - `Dockerfile` / `docker-compose`
  - `.github/workflows`
  - `turbo.json`

结论：

- 这是一个**轻量 monorepo**
- 结构上是“一个 Console app + 一组平台包 + 一组本地 runtime memory”
- 基础设施层与 CI/CD 层目前明显偏弱

---

## 3. 已完成模块清单

以下模块从代码、schema、example、CLI 或本地服务实现看，已经具备明确落地内容，不再是纯文档占位：

### 3.1 Console 本地控制台

位置：

- `apps/console/src/*`
- `apps/console/web/*`

已完成能力：

- 本地 Web 控制台
- 本地登录会话接入
- 本地 Action Server
- 控制台渲染与静态构建
- 控制台动作计划 / 执行 / 日志读取
- 基于本地文件的中文默认界面

说明：

- 这是当前最“产品化”的入口之一
- 但 UI 仍在高频迭代中

### 3.2 Access Center

位置：

- `packages/access-center/`

已完成能力：

- 本地用户
- 密码哈希
- 本地 session
- 角色 / 套餐 / membership / invite
- 路由能力校验
- Console action 能力校验
- 套餐并发限制 / 访问边界

说明：

- 这是当前仓库里实现程度最高的核心模块之一
- 已具备“访问控制中心”雏形

### 3.3 Planning Center

位置：

- `packages/planning-center/`

已完成能力：

- next action 生成
- completion-aware 规划
- V5 roadmap 感知
- batch plan 输出
- 风险/执行模式选择

说明：

- 已能做规划
- 但仍偏策略编排与启发式判断，不是独立规划服务

### 3.4 Governance Center

位置：

- `packages/governance-center/`

已完成能力：

- 风险等级策略
- approval policy
- release gate
- governance dry-run 检查

### 3.5 Runtime Center

位置：

- `packages/runtime-center/`

已完成能力：

- runtime registry
- runtime select
- runtime health
- credential reference presence 判断
- runtime/provider/profile 元数据聚合

### 3.6 Runtime Adapters

位置：

- `packages/runtime-adapters/`

已完成能力：

- adapter schema
- adapter registry
- invoke plan contract
- runtime adapter 元数据层

说明：

- 这是“统一接多种 AI / Agent 执行方式”的契约层
- 目前仍以计划和元数据为主，不做真实外部模型编排

### 3.7 Credential Vault

位置：

- `packages/credential-vault/`

已完成能力：

- 凭证引用 schema
- backend policy
- scope / audit / rotation policy
- runtime health 的引用存在性判断

说明：

- 当前是 **reference-only policy layer**
- 不读取真实 secret 值

### 3.8 Worker Pool

位置：

- `packages/worker-pool/`

已完成能力：

- worker registry
- worker profile
- worker health dry-run
- worker assignment
- cancel / kill-switch dry-run
- capability tags
- parallel smoke 相关支撑

### 3.9 Project Connector

位置：

- `packages/project-connector/`

已完成能力：

- project intake
- stack detector
- command detector
- debug specialist dry-run
- 多项目 placeholder / runtime memory 支撑
- 外部 repo 适配信息读取

### 3.10 Context / Runtime Memory

位置：

- `runtime/global/*`
- `runtime/projects/*`

已完成能力：

- 全局上下文
- 项目上下文
- 启动索引
- handoff / decision log
- 项目链路证据
- pilot / run / proposal 记录

### 3.11 Autopilot / Batch / Parallel 相关

主要实现位置：

- `packages/orchestrator-core/bin/studio.mjs`

已完成能力：

- autopilot run
- autopilot batch
- dry-run / apply 区分
- governance gate 接入
- run summary / report 写入
- parallel smoke / child process 相关实现

### 3.12 其他已完成契约层

- `packages/mobile-stack-pack/`：移动端项目识别契约
- `packages/production-ops/`：生产运维 dry-run 契约
- `packages/skill-router/`：技能路由 registry / rules

---

## 4. 正在开发 / 半成品模块

### 4.1 Console UI / UX

现状：

- 能运行、能登录、能调动作
- 但登录页、主页、导航、对话工作台、移动端适配仍在持续调整
- 当前 Git 也显示 Console 渲染文件仍处于本地修改状态

判断：

- **功能可用，产品体验未稳定**

### 4.2 Orchestrator Core 的工程化拆分

现状：

- `packages/orchestrator-core/bin/studio.mjs` 约 11k+ 行
- 大量核心能力集中在单一 CLI 文件中

判断：

- **能力已多，但代码组织仍是半成品**
- 当前不是一个可持续维护的长期结构

### 4.3 Discovery / Evolution / Runtime Memory 包

现状：

- `packages/discovery-engine/`
- `packages/evolution-center/`
- `packages/runtime-memory/`

从 `src/index.ts` 与结构看：

- 以 schema / type / skeleton 为主
- 缺少强实现层

判断：

- **契约层已搭，执行引擎未成型**

### 4.4 Worker 真正网络化运行时

现状：

- 有 registry / assignment / dry-run / parallel smoke
- 也有本地 child process 并行证据
- 但没有真正持久 Worker Node 服务

判断：

- **真实 Worker 网络仍是半成品**

### 4.5 Managed Project 写入执行架构

现状：

- README 和 runtime memory 已明确：Studio 不应把业务代码写回自己仓库
- 当前平台已有外部项目路径和上下文导入
- 但“真正把任务稳定分派到挂接项目仓库、自动分支/同步/验证/回写”的抽象还不够干净

判断：

- **这是当前最关键的结构性半成品之一**

---

## 5. 缺失的关键能力

### 5.1 独立 Gateway / API 服务层

当前没有明确的：

- `apps/api`
- `packages/gateway`
- 独立 HTTP control plane backend

现状更多是：

- Console 本地服务
- CLI 单体执行

### 5.2 持久 Worker Node 服务

缺失：

- 长生命周期 worker daemon
- worker lease / registration / liveness protocol
- remote worker 生命周期治理

### 5.3 正式 Task Dispatcher 子系统

当前有 dispatch 能力痕迹，但缺少：

- 独立 dispatcher 模块
- 明确任务队列模型
- retry / backoff / lease / ack 机制
- 调度状态存储与恢复机制

### 5.4 标准化插件 / MCP 宿主层

文档和产品方向里有 plugin / mcp / runtime 接入概念，但仓库内没有看到：

- 正式 `plugins/` 运行时目录
- 独立插件装载器
- 明确 MCP host service

### 5.5 自动化测试体系

本次审计未发现成规模的：

- 单元测试目录
- 集成测试目录
- 统一测试脚本体系

当前更偏：

- typecheck
- 自定义 lint-check
- smoke / doctor / dry-run

### 5.6 CI / 部署基础设施

缺失：

- GitHub Actions
- Docker 构建定义
- 部署编排层
- 环境分层配置

### 5.7 挂接项目的正式执行桥

缺失重点：

- “Control Plane -> Managed Repo Executor” 的稳定桥接层
- 多仓分支一致性与 worktree 生命周期治理
- 项目级任务隔离协议

---

## 6. 与 “AI Control Plane + Worker Node” 架构的匹配度

以下为基于仓库现状的推断性评估：

### 6.1 AI Control Plane 匹配度：高（约 80%）

已具备：

- 访问控制
- 规划
- 治理
- 运行时选择
- 凭证引用策略
- Worker 元数据与分配策略
- 全局 / 项目记忆
- Console 入口
- run / report / proposal 记录

结论：

- Control Plane 方向已经成型

### 6.2 Worker Node 匹配度：低到中（约 35%）

已有：

- worker registry
- local child process 并行 smoke
- assignment / capability / cancellation dry-run

缺失：

- 持久 Worker Node
- live heartbeat protocol
- dispatcher / queue / retry / lease
- remote worker runtime

结论：

- Worker Node 目前仍偏“设计与本地模拟”

### 6.3 总体匹配度：中等偏上（约 65%）

总结：

- 这是一个**控制面领先、执行面滞后**的架构
- 适合继续沿“AI Control Plane + Managed Worker Execution”演进
- 不适合现在就自称为完整 Worker 平台

---

## 7. 是否已经存在 Worker Registry / Heartbeat / Task Dispatcher

| 能力 | 现状 | 结论 |
|---|---|---|
| Worker Registry | `packages/worker-pool/` 已有 schema、example、utils、CLI | **已存在，但偏元数据/干运行层** |
| Heartbeat | `apps/console/web/action-server.mjs` 有本地 action heartbeat 机制 | **部分存在，仅覆盖本地 Console action 进度** |
| Task Dispatcher | `autopilot run/batch`、parallel smoke、dispatch schema 痕迹存在，且部分状态来自外部项目导入 | **部分存在，但未抽成正式子系统** |

明确判断：

1. **Worker Registry：有**
2. **Heartbeat：有局部实现，但没有平台级 worker heartbeat**
3. **Task Dispatcher：只有部分编排行为，没有完整独立 dispatcher**

---

## 8. 不建议改动的稳定区域

以下区域建议视为当前稳定合同层，避免随意大改：

### 8.1 runtime memory 分层结构

- `runtime/global/*`
- `runtime/projects/*`

原因：

- 这是当前 Console、Planning、Autopilot、Context Summary 的共同基础

### 8.2 Access Center 的数据契约与核心工具

- `packages/access-center/schemas/*`
- `packages/access-center/lib/access-center-utils.mjs`

原因：

- 已承载本地登录、角色、套餐、动作权限等关键逻辑

### 8.3 Governance / Credential / Runtime / Worker 的 schema 体系

- `packages/governance-center/schemas/*`
- `packages/credential-vault/schemas/*`
- `packages/runtime-center/*`
- `packages/worker-pool/schemas/*`

原因：

- 这些已经形成平台内部约定，贸然改名或改字段会连带影响 Console、CLI、runtime health、governance check

### 8.4 项目接入与安全边界原则

- README 中“外部项目是 managed repo、Studio 不直接吞业务代码”的原则
- `runtime/projects/*` 的项目上下文分层

原因：

- 这是平台和业务仓库解耦的关键边界

### 8.5 不建议大爆炸重写 `studio.mjs`

原因：

- 虽然它是技术债核心，但它也是当前真实运行核心
- 正确做法应是“抽离子模块”，而不是整体推倒重写

---

## 9. 可以扩展的推荐位置

### 9.1 调度器 / 执行桥

推荐位置：

- `packages/orchestrator-core/lib/*`
- 或新建 `packages/dispatch-center/`
- 或新建 `packages/managed-project-executor/`

适合承载：

- task dispatch
- project binding
- worktree / branch 管理
- worker execution contract
- retry / lease / ack

### 9.2 正式 Gateway 层

推荐位置：

- 新建 `apps/api/`
- 或 `packages/gateway/`

适合承载：

- Console 后端 API
- 统一 session / auth / action endpoint
- 后续多端接入

### 9.3 真 Worker Node

推荐位置：

- 新建 `packages/worker-node/`
- 或 `apps/worker/`

适合承载：

- registration
- heartbeat
- polling / push task
- task sandbox
- run manifest

### 9.4 测试层

推荐位置：

- 各 package 下新增 `test/`
- 或集中到 `packages/*/test` / `apps/*/test`

优先覆盖：

- access
- planning
- governance
- worker dispatch
- console action server

### 9.5 项目仓库执行适配器

推荐位置：

- `packages/project-connector/` 下扩展执行桥
- 或独立 `packages/project-runtime-bridge/`

适合承载：

- managed repo checkout / branch sync
- project command execution
- repo-safe write boundary

---

## 10. 技术债和风险

### 10.1 单体 CLI 过大

`packages/orchestrator-core/bin/studio.mjs` 超大，当前是最核心也是最大风险点：

- 可维护性差
- 测试困难
- 变更回归风险高
- 新功能很容易继续堆进去

### 10.2 文档先行、实现滞后

仓库文档丰富，但部分模块仍主要停留在：

- schema
- examples
- proposal
- dry-run

风险：

- 容易让人误判“能力已经完成”

### 10.3 缺少标准测试体系

当前验证方式偏：

- typecheck
- smoke
- doctor
- lint-check

风险：

- 行为回归难以及时发现
- 调度与权限逻辑缺少自动保护网

### 10.4 缺少 CI / infra

没有发现：

- CI 工作流
- 部署构建定义
- 标准镜像 / 编排

风险：

- 本地能跑，不等于平台可持续交付

### 10.5 真实 Worker 仍未成网

虽然有 parallel smoke 和 child process 证据，但平台级 worker 网络还未落地。

风险：

- 现在更像“本地编排器”
- 不是“多节点执行平台”

### 10.6 managed project 执行桥仍有结构风险

`runtime/global/platform-state.json` 已明确提示：

- managed-project branch sync pending
- multi_agent_dispatch_ready: false

风险：

- 平台与外部项目仓库的真实执行关系尚未彻底稳定

### 10.7 Console UI 仍在频繁修改

从近期提交和当前本地变更可见：

- 登录页 / 控制台样式还在持续打磨

风险：

- 产品体验不稳定
- 容易出现“看起来像完成，实则仍在调整”的错觉

---

## 11. 下一阶段 P1-001 最小实施建议

### 建议名称

**P1-001：Managed Project Executor Bridge MVP**

### 为什么它应当是下一步最小实施项

当前最大缺口不是再加一个文档型包，而是：

- Studio 已有控制面
- 但“如何把任务稳定、可审计、安全地投递到挂接项目仓库执行”仍缺一个正式桥接层

这也是避免“重复开发、写错仓库、分支不同步、任务落错位置”的最小关键路径。

### P1-001 最小目标

建立一个最小可运行桥接层，完成：

1. **项目绑定**
   - 明确每个 managed project 的 repo path / branch / execution root

2. **任务投递合同**
   - 定义 task spec、allowed paths、validation commands、result artifact

3. **执行器抽离**
   - 从 `studio.mjs` 中抽出最小执行桥，而不是继续堆逻辑进主 CLI

4. **状态回写**
   - 把 task status / worker assignment / result / validation 统一写回 runtime memory

5. **单项目 smoke**
   - 只针对一个 external repo 做本地安全闭环验证

### P1-001 完成标准

最少满足：

- Control Plane 可生成一个任务
- 任务被正式投递到指定 managed repo 执行桥
- 执行桥返回日志、状态、验证结果
- Runtime Memory 可追踪
- 不再依赖“人工知道该去哪个仓库改什么”

---

## 12. 本次审计声明

本次审计结论如下：

- **本次审计没有修改任何现有代码**
- **没有安装任何新依赖**
- **没有调整仓库格式**
- **没有提交任何 commit**
- 为满足审计输出要求，仅新增本审计文档 `W1_CURRENT_STATE_AUDIT.md`

---

## 附：Git 与工程现状速记

### 当前 Git 状态

- 当前分支：`main`
- 远端：`origin https://github.com/ivanzhao299/anksen-agent-studio.git`
- 当前工作区存在本地未提交修改：
  - `apps/console/web/render.mjs`

### 最近提交摘要

近期提交集中在两类方向：

1. Console 登录页与交互呈现
2. Access Center / 套餐权限 / 内测访问控制

最近提交示例：

- `21d8c79 refactor(console): soften login hero`
- `f51beff refactor(console): streamline login page`
- `3e9ed54 refactor(console): simplify premium login entry`
- `181fd8a refactor(console): refine product login presentation`
- `adf2f1f feat(console): productize login page`
- `89eaa4c feat(access): materialize approved invites`
- `6baeac8 feat(access): add invite review flow`
- `394b486 feat(access): add console entitlement alerts`
- `53f0db0 feat(access): enforce plan execution limits`
- `787b4e4 feat(access): add local user provisioning controls`

### 启动 / 校验脚本简记

根仓库关键脚本：

- `pnpm typecheck`
- `pnpm lint:check`
- `pnpm console:dev`
- `pnpm runtime-health-check`
- `pnpm studio:doctor`

`apps/console`：

- `pnpm --filter @anksen/console dev`
- `pnpm --filter @anksen/console build`
- `pnpm --filter @anksen/console typecheck`

### 测试 / CI 简记

本次审计未发现：

- 明确成规模单元测试目录
- GitHub Actions
- Docker / infra 构建层

因此当前仓库更适合作为：

- 本地控制面研发仓
- 平台能力试验仓

而非已经完成全栈交付治理的正式多节点平台仓。
