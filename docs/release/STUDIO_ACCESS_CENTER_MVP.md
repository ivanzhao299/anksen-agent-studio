# Studio Access Center MVP

## 目标

为 ANKSEN Agent Studio 增加本地可用的用户、角色、套餐和内测权限边界，避免任何本机访问者都直接触发 Console 动作。

## 本轮范围

- 新增 `packages/access-center/`
- 文件化用户、角色、套餐、成员关系与本地会话
- Console Action Server 接入登录态与动作判定
- CLI 增加 Access Center 只读检查命令
- Console 页面增加本地登录门禁与会话显示
- 不读取真实外部身份系统
- 不接企业 SSO
- 不接数据库

## 模型分层

1. 角色：
   - 定义组织职责与治理边界
2. 套餐：
   - 定义商业能力、可用 seat、可用功能集
3. 成员关系：
   - 把用户绑定到某个 workspace、项目范围与 beta 特性
4. 会话：
   - 本地 `127.0.0.1` Console 的登录态，保存在 `runtime/local-services/access-sessions.json`

## 默认角色

- `platform_owner`
- `workspace_admin`
- `operator`
- `reviewer`
- `viewer`
- `security_admin`

## 默认套餐

- `internal_preview`
- `starter`
- `team`
- `enterprise`

## 默认本地账号

仅用于本地开发/内测，必须在后续企业接入前替换或轮换：

- `owner` / `StudioPilot!2026`
- `beta-admin` / `BetaPilot!2026`
- `operator` / `OperatorPilot!2026`
- `viewer` / `ViewerPilot!2026`

这些密码只用于本地 Studio 控制台，不代表任何真实业务系统凭证。

## 动作门禁

- `LOW`
  - 登录后且能力满足时允许
- `MEDIUM`
  - 登录后且角色/套餐允许时可直执本地安全动作
- `HIGH`
  - 仍保持 `proposal_only`
- `CRITICAL`
  - 仍保持人工审批

## 运行时文件

- `runtime/global/access-state.json`
- `runtime/global/access-users.json`
- `runtime/global/access-memberships.json`
- `runtime/local-services/access-sessions.json`（本地生成，已忽略）

## Console 登录方式

1. 打开本地 Console。
2. 如果未登录，会先看到本地登录页。
3. 输入已分配账号后，Action Server 才允许执行或规划动作。
4. 会话只保存在本机 `runtime/local-services/access-sessions.json`。
5. Console 仍只监听 `127.0.0.1`。

## CLI 只读命令

- `node packages/orchestrator-core/bin/studio.mjs access summary --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access users --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access plans --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access check --user operator --action smart-park-continue --project jinhu-smart-park --dry-run`

## 下一步

1. 接企业用户目录或 SSO
2. 增加密码轮换与账号禁用命令
3. 把 Console 页面里的可见模块和操作按钮做成基于 access profile 的真实动态裁剪
4. 把套餐能力接到项目数量、Worker 并发数、Runtime 使用额度
