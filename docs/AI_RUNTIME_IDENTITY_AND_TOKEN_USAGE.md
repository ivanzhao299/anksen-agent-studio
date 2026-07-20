# AI Runtime 身份认证与 Token 用量中心

## 入口

Studio 左侧系统导航的“凭证”进入 `/credentials`。运行管理页也提供“AI 身份与用量”入口。

## 认证方式与位置

| Runtime | 认证方式 | Credential Reference | 引用位置 |
| --- | --- | --- | --- |
| Codex CLI | 本机用户 CLI Session | `codex-local-session-ref` | `user-session://codex-cli/current-user` |
| Claude Code | CLI Session 或环境引用 | `anthropic-primary-ref` | `ANTHROPIC_API_KEY` 名称引用 |
| Gemini CLI | CLI Session 或外部 Vault | `google-primary-ref` | GCP Secret Manager 引用 |
| DeepSeek | 平台托管环境引用 | `deepseek-platform-ref` | `DEEPSEEK_API_KEY` 名称引用 |
| Qwen | 平台托管环境引用 | `qwen-platform-ref` | `DASHSCOPE_API_KEY` 名称引用 |
| Aider | 外部模型环境引用 | `aider-model-ref` | `AIDER_MODEL_API_KEY` 名称引用 |
| OpenHands | 外部 Worker Keychain 引用 | `openhands-worker-ssh-ref` | macOS Keychain 项目引用 |
| Local Agent | 无需认证 | `local-runtime-none` | `none://local-runtime` |

Studio 对 Codex 执行 `codex login status` 健康检查，只记录成功或失败，不保存命令输出、账号信息、Cookie、Token 或会话值。其他 Runtime 在没有安全、稳定的认证状态接口时显示 `reference_only` 或 `EXTERNAL_SESSION_NOT_VERIFIED`，不根据安装状态猜测已登录。

Credential Reference 注册位置：`packages/credential-vault/examples/credential-references.example.json`。该文件只保存引用标识和后端位置，不保存密钥值。

## Token 统计

API：`GET /api/runtime/identity-usage`

前端展示每个 Runtime 的：

- 运行次数
- 已报告 Token 的运行次数
- 未报告 Token 的运行次数
- Input Tokens
- Output Tokens
- Cached Tokens
- Total Tokens
- 数据完整性：`COMPLETE`、`PARTIAL`、`NOT_REPORTED` 或 `NO_RUNS`

统计只解析 Runtime 明确返回的结构化字段或 `tokens used` 输出。没有报告 Input/Output 拆分时对应字段显示“未报告”，不会把总量编造成输入或输出，也不会根据字符数估算 Token。

当前历史 Console Action 日志中，Codex 有部分运行报告了总 Token，用量中心会汇总这些已报告数据，同时保留未报告运行数量。新完成的 Action Run 会把解析结果写入自身持久化运行记录。

## 安全约束

- API 固定返回 `secretValuesExposed=false`。
- 不读取环境变量值、Vault 内容、Keychain 内容、CLI Cookie 或 Session Token。
- 前端只显示 Reference ID、引用类型和引用位置。
- Token 用量是审计和容量指标，不作为账单金额；成本换算必须在后续增加带版本的模型价格表后单独实现。
