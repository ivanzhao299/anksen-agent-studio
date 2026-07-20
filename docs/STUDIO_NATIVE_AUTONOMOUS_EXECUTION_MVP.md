# 长任务：Studio 原生自主执行能力 MVP

## 目标

让用户从 Studio 首页提交目标后进入 Studio 自己的执行工作台，由后台 Agent 任务独立运行。关闭或刷新页面不影响当前任务；服务重启后可以恢复运行记录并明确处理不确定状态。Codex 对话窗口不再是日常任务的必经入口。

## 任务图与结果

| 任务 | 验收结果 | 状态 |
| --- | --- | --- |
| NS-001 | 审计首页、AEC、Action Server 和受控 Codex 链路 | 完成 |
| NS-002 | 首页目标进入 Studio 原生 Action Workbench | 完成 |
| NS-003 | 后台运行与浏览器请求、页面生命周期解耦 | 完成 |
| NS-004 | 将每次运行、消息、时间线、输出和日志持久化 | 完成 |
| NS-005 | 服务重启时重载历史运行，恢复最近任务 | 完成 |
| NS-006 | 对中断中的任务执行副作用安全恢复策略 | 完成 |
| NS-007 | 页面打开时自动续显最近任务并继续轮询 | 完成 |
| NS-008 | 完成取消、失败、恢复提示、测试和本地发布 | 完成 |

## 独立能力边界

当前 Studio 可以独立完成：

- 从统一首页接收 Goal。
- 选择项目、Agent/Runtime 和工作模式。
- 启动本地 Codex/Claude CLI 或内部 Planner。
- 在后台持续执行，网页刷新或关闭不终止任务。
- 展示实时输出、阶段时间线、结果和审计日志。
- 重新打开工作台自动恢复最近任务。
- 取消仍在当前服务进程中运行的任务。
- 服务重启后恢复历史记录。

服务重启时如果任务最后状态为 `RUNNING/QUEUED`，Studio 将其转为 `RECOVERY_REQUIRED`，不会自动重跑。原因是旧进程可能已经产生副作用，盲目重试会造成重复修改、重复提交或重复外部动作。用户确认后可以提交新的单次 Attempt。

## Codex 执行模式

- Studio 原生 Agent 入口已经能启动真实本地 Codex CLI。
- 默认 Codex 模式仍为只读分析与计划，禁止修改挂接项目。
- 写代码任务必须使用现有 Governed Codex Runtime，满足 Project Policy、RBAC、Worker Authorization、Credential Reference、单次 Approval、Lease 和 Fencing。
- 本任务不把 `write_enabled` 偷改为 true，也不长期打开 Codex Feature Flag。
- push、merge、deploy 和生产操作继续禁止。

## 真实性

运行记录持久化在 `autopilot-runs/console-actions`，每条记录包含 run ID、用户、项目、Runtime、风险、治理结论、消息、时间线、输出摘要和日志路径。恢复的是持久化证据，不是进程内模拟状态。

## 下一阶段

要达到完全无人值守的长期写代码能力，还需要把 Governed Codex Runner 做成独立 Resident Worker 服务，并增加 Studio 内的 Project Path Policy 编辑、一次性 Approval 消费、跨进程 Lease 心跳和写后验证界面。本 MVP 已解决“必须依赖当前对话窗口”和“刷新后丢失任务”的问题，但不会用降低安全门槛换取表面自动化。
