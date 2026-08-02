# Agent 管理中心

Agent 管理中心是 Console 中仅供平台管理员使用的运行时配置入口。页面路由为 `/agent-admin`，复用现有 Access Center、Runtime Center、Runtime Adapter Registry、Worker Pool 与 Credential Vault，不创建第二套调度器或注册中心。

## 可视化能力

- 查看 Runtime Adapter、供应商、调用方式、技能、健康状态和风险基线。
- 启用或停用 Agent，设置优先级与并发上限；配置会作为覆盖层进入现有 Runtime Center 选择器。
- 为 Agent 选择 Credential Reference。页面和接口只展示引用状态，不读取或保存密钥明文。
- 设置套餐可用范围、月度预算、币种、计费单位和参考单价。
- 查看本地 Worker 绑定状态与管理员配置审计记录。

## 权限边界

页面和 API 都要求 `agent.manage`、`runtime.read`、`worker.read`、`credential.read`。默认只有 `platform_owner` 和 `workspace_admin` 具备入口权限，普通成员、访客和匿名用户均不可见且无法调用 API。

受保护接口：

- `GET /api/admin/agents`
- `GET /api/admin/agents/audit`
- `PUT|PATCH /api/admin/agents/:adapterId`

写请求同时校验同源访问。配置写入 `runtime/global/agent-control-config.json`，审计写入 `runtime/local-services/agent-control-audit.jsonl`，文件权限为 `0600`。任何包含 secret、password、token、API key 或 private key 字段的请求都会被拒绝。

## 调度接入

Runtime Center 在原有技能、区域、健康、预算、认证和偏好评分基础上读取 Agent 覆盖层：

- `enabled=false` 的 Agent 不参与选择。
- `priority` 参与现有选择器评分，数值越小优先级越高。
- `max_parallel_tasks` 与 Runtime Profile、预算并发上限共同取最小值。

套餐授权仍由 Access Center 判定，真实凭证仍由 Credential Vault 后端提供，页面不承担凭证存储或模型调用。
