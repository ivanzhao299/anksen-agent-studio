# MEDIA-004 KLING Overseas API Integration

## 目标

将海外版 KLING Open Platform 接入既有 Digital Human Pipeline，使 Studio
能够把已经通过角色锁定、场景落地和首尾帧审查的计划提交到 KLING Video
3.0，并把任务状态、结果下载和审计证据纳入现有治理链。

本能力沿用 Studio 既有 Planner、Governance、Credential Vault、
Professional Runner 与 artifact 边界，不新增第二套 Runtime、Worker、
Queue 或状态机。

## 认证边界

- KLING 海外网页的 Chrome 登录态只服务网页产品。
- Open Platform 使用独立 API Key 和 Bearer 认证。
- Studio 不读取 Chrome cookie、localStorage 或网页登录凭据。
- Studio 只保存 `kling-api-key-ref` 引用。
- 执行时引用绑定到 `KLING_API_KEY` 或 macOS Keychain
  `com.anksen.agent-studio.kling-api / kling-api-key`，明文只存在于受控执行边界。
- 计划、日志、审计文件均不得出现 API Key、Bearer Header 或 Base64
  图片内容。

当前本地环境没有配置该引用时，真实提交会以
`KLING_API_KEY_REFERENCE_UNRESOLVED` 阻断。

macOS 推荐用隐藏输入写入系统钥匙串：

```bash
security add-generic-password -U \
  -a kling-api-key \
  -s com.anksen.agent-studio.kling-api \
  -w
```

`kling-credential-status --dry-run` 只返回引用是否存在，不读取或显示密钥值。

## 当前 API 映射

海外 API 基址：

`https://api-singapore.klingai.com`

首尾帧提交：

`POST /image-to-video/kling-3.0`

任务查询：

`GET /tasks?task_ids=<task_id>`

提交内容由以下结构组成：

1. `prompt`
2. `first_frame`
3. `last_frame`
4. `settings.resolution`
5. `settings.duration`
6. `settings.audio`
7. `settings.multi_shot`
8. `options.external_task_id`
9. `options.watermark_info`

本地 front / side / back 角色参考图继续作为角色审查证据保存。除非已经在
KLING 平台创建并取得合法 Element ID，否则不会把本地路径伪装成 KLING
Element。

## 治理流程

```text
角色与场景资产
  -> 首尾帧准备
  -> dispatch plan
  -> dry-run
  -> Credential Reference 检查
  -> Cost Approval
  -> KLING submit
  -> task status / poll
  -> result download
  -> provider submission audit
```

`kling-submit --dry-run`：

- 不读环境变量；
- 不调用外部模型；
- 不写 audit；
- 仅展示 endpoint、payload 摘要和治理要求。

`kling-submit --apply --cost-approved`：

- 解析 `KLING_API_KEY`；
- 在执行边界将首尾帧编码为 Base64；
- 调用海外 KLING API；
- 只持久化 task ID 与脱敏审计信息。

`kling-poll --apply --download`：

- 查询直到 `succeeded` 或 `failed`；
- 成功时把视频下载为 `provider-result.mp4`；
- 不把有时效的 provider URL 写入审计文件。

## 命令

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs kling-submit \
  --plan <absolute-or-repo-plan-path> \
  --dry-run

node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs kling-submit \
  --plan <absolute-or-repo-plan-path> \
  --apply \
  --cost-approved

node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs kling-status \
  --audit <provider-submission-audit.json> \
  --apply

node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs kling-poll \
  --audit <provider-submission-audit.json> \
  --apply \
  --download
```

## 当前边界

- 本轮不会自动产生付费 KLING 请求。
- 本轮不会把 Chrome 登录态转换或复制为 API 凭证。
- 本轮不会把真实 API Key 写入仓库。
- 一个真实提交仍需要明确成本批准及可解析的 credential reference。
- 下载结果需要在 KLING 返回 URL 的有效期内完成。

## 官方协议来源

- [Kling API Overview](https://kling.ai/document-api/guides/get-started/overview)
- [Kling API Quick Start](https://kling.ai/document-api/guides/get-started/quick-start)
- [Kling Video 3.0 Image-to-Video](https://kling.ai/document-api/api/video/3-0-omni/image-to-video)
