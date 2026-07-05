# Studio Access Center MVP

## 目标

为 ANKSEN Agent Studio 增加本地可用的用户、角色、套餐和内测权限边界，避免任何本机访问者都直接触发 Console 动作。

## 本轮范围

- 新增 `packages/access-center/`
- 文件化用户、角色、套餐、成员关系与本地会话
- Console Action Server 接入登录态与动作判定
- CLI 增加 Access Center 只读检查命令
- CLI 增加本地账号管理命令
- Console 页面增加本地登录门禁、会话显示与基于 access profile 的页面裁剪
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

## CLI 命令

### 只读命令

- `node packages/orchestrator-core/bin/studio.mjs access summary --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access users --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access plans --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access check --user operator --action smart-park-continue --project jinhu-smart-park --dry-run`

### 本地账号管理

- `node packages/orchestrator-core/bin/studio.mjs access grant --user viewer --role reviewer --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access set-plan --user operator --plan team --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access reset-password --user viewer --password "NewPassword!2026" --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access enable-user --user viewer --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs access disable-user --user viewer --dry-run`

这些命令默认操作本地 runtime JSON，不会接外部身份系统，不会写真实业务系统账号。

## Console 裁剪

登录后，Console 会按当前账号的角色、套餐和 capability 自动裁剪：

- 顶部导航只显示当前账号有权访问的模块
- 未开通的页面会返回明确的 Access Center 拦截提示
- `config` 页面仅对 `access.manage` 能力开放
- `actions / autopilot` 页面要求具备对应规划或执行能力

## 下一步

1. 接企业用户目录或 SSO
2. 增加 Access Center 的用户创建、套餐升级和 seat 分配命令
3. 把套餐能力继续接到项目数量、Worker 并发数、Runtime 使用额度
4. 把审批、团队邀请和账单边界接到正式 Product Access Center
