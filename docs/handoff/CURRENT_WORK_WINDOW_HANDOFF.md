# ANKSEN Agent Studio 新工作窗口交接

更新时间：2026-08-29（Asia/Shanghai）

> 本文是新工作窗口的当前入口。新窗口不得从历史嵌套目录继续工作，也不得仅依据旧报告判断运行状态；必须先执行本文的实时核验命令。

## 1. 一句话现状

Studio 的正式仓库、项目身份门禁、8 项目注册表、Resident Worker、自动开发 Worker、Office 204 发布流水线均已存在；当前主干和生产版本一致。自然语言任务窗口的极简对话改造仍在独立分支中，尚未合并到主干，下一窗口应优先完成其代码审查、真实任务闭环验证和受控发布。

## 2. 唯一正式仓库

- 本地根目录：`/Users/mac/Documents/anksen-agent-studio`
- GitHub：`https://github.com/ivanzhao299/anksen-agent-studio.git`
- 项目标识：`anksen-agent-studio`
- 主分支：`main`
- 当前本地、远端、生产 SHA：`e4da5e9dac78937d14bb913fedb313105a94b910`
- 生产入口：`https://studio.cnjinhu.com/login`
- Office 204 服务器：`123.57.220.65`（只能通过仓库内受控发布流程部署，不在文档中记录密钥）

历史目录 `/Users/mac/Documents/jinhu-smart-park/anksen-agent-studio` 不是 Studio 正式根目录。即使终端或新任务误落入该路径，也必须切换到上述正式根目录，并通过项目身份检查后才能操作。

## 3. 新窗口第一组命令

```bash
cd /Users/mac/Documents/anksen-agent-studio
git fetch origin --prune
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
pnpm repository:identity:check
pnpm project-lifecycle:check
pnpm console:service:status
pnpm autonomous-development-worker:service:status
pnpm mac-resident-worker:service:status
```

进入开发前必须满足：

1. Git 根目录、标准化 `origin`、项目 ID 与根包名同时匹配。
2. `repository:identity:check` 返回 `PASS`。
3. `project-lifecycle:check` 返回 `READY` 且 `violations=[]`。
4. 主工作区无未知脏改动；发现脏改动时先识别归属，不得覆盖或清理。
5. 开发必须使用新的 `codex/*` 分支和独立 worktree，不得直接在主工作区改代码。

## 4. 2026-08-29 实时核验快照

### 仓库与生产

- 主工作区干净：`main...origin/main`
- 本地 `HEAD`：`e4da5e9dac78937d14bb913fedb313105a94b910`
- `origin/main`：`e4da5e9dac78937d14bb913fedb313105a94b910`
- 204 部署日志确认 SHA：`e4da5e9dac78937d14bb913fedb313105a94b910`
- 公网登录页返回 HTTP 200。

### 运行进程

- Console：Node.js 24，PID `71303`，监听 `127.0.0.1:4317`。
- Autonomous Development Worker Supervisor：PID `59626`。
- Autonomous Development Worker：PID `59661`。
- Mac Resident Worker：launchd 标签 `com.anksen.agent-studio.mac-resident-worker`，PID `59703`。
- 本地 PostgreSQL fixture：`127.0.0.1:55439`。

PID 会变化，只能作为本次快照。新窗口必须重新检查 launchd、进程命令行、监听端口、真实 heartbeat/registration，不能相信旧 PID 或单独一份状态文件。

### 8 个已注册项目

权威注册表：`runtime/global/attached-project-workspace.json`

1. `anksen-agent-studio` → `/Users/mac/Documents/anksen-agent-studio`
2. `phoenix-erp-v3` → `/Users/mac/Documents/phoenix-erp-v3`
3. `jinhu-smart-park` → `/Users/mac/Documents/jinhu-smart-park`
4. `quant-discipline-system` → `/Users/mac/Documents/quant-discipline-system`
5. `smart-control` → `/Users/mac/Documents/smart-control`
6. `cnjinhu-official-website` → `/Users/mac/Documents/cnjinhu-official-website`
7. `eggslao-site` → `/Users/mac/Documents/eggslao-site`
8. `jinhu-erp-finance` → `/Users/mac/Documents/jinhu-erp-finance`

本次检查结果为 `projectCount=8`、`status=READY`、`violations=[]`。这只证明生命周期门禁当前通过，不等于所有项目业务任务都经过了端到端验收。

## 5. 刚完成的 Node.js runtime 治理

以下 Workflow 已将旧 Action 升级为使用 Node.js 24 runtime 的版本：

- `.github/workflows/deploy-office-204.yml`
- `.github/workflows/deploy-kingturf-erp-office-204.yml`
- `.github/workflows/growth-platform-ci.yml`

版本为 `actions/checkout@v7`、`actions/setup-node@v7`、`pnpm/action-setup@v6`。PR #39 已合并，CI 和 204 发布均通过，GitHub Check annotations 为 0，不再产生 Node.js 20 runtime 弃用提示。

## 6. 尚未完成和不可误报的事项

### P0：自然对话任务窗口尚未合并

- worktree：`/Users/mac/Documents/anksen-agent-studio-conversation`
- 分支：`codex/studio-conversational-agent`
- 提交：`0953ac2 feat(console): add minimal project launcher`
- 相对当前主干变更：4 个文件，新增 115 行、删除 128 行。

该分支实现了一个更极简的项目任务入口，但尚未证明以下完整链路：

`自然语言输入 → 项目识别 → 计划反馈 → 独立 worktree → Worker 执行 → 测试 → 提交/PR → 门禁 → 合并 → 部署 → 用户可读结果`

下一窗口不得直接宣称“已经可以全自动开发”。应先 rebase/merge 最新 `origin/main`，逐项审查变更，并用 Smart Park 的低风险只读或文档类任务做真实验收。

### P0：Console 服务仍有手动兜底

当前 Console 进程监听正常，但它是手动兜底进程；此前 launchd Console 服务存在 `EX_CONFIG` 退出问题。主干已合并部分 readiness 修复，但仍需新窗口重新执行：

```bash
pnpm console:service:status
launchctl list | rg -i 'anksen|studio|resident'
ps aux | rg '[a]nksen|[r]esident-worker|[c]onsole-server'
lsof -nP -iTCP -sTCP:LISTEN | rg '4317|anksen|node'
```

目标是让正式 launchd 服务能够冷启动、重启和异常自愈，而不是长期依赖手动进程。

### P1：遗留 worktree 需要审计后治理

当前除主工作区外还能看到：

- `anksen-agent-studio-conversation`
- `actions-node24`
- `console-service-readiness`
- `runner-autonomy-closure`（detached）

不得为了“看起来干净”直接删除。先检查每个 worktree 的脏状态、提交是否已合并、是否有受保护任务或人工成果；只有确认可回收后才执行移除。

## 7. 推荐的下一阶段顺序

1. **刷新事实**：fetch、三端 SHA、身份门禁、生命周期门禁、launchd/进程/端口/heartbeat。
2. **审查自然对话分支**：同步主干，检查项目选择、提示词、任务状态回传和异常反馈是否真实接入 Kernel/Worker，而非只有前端展示。
3. **执行受控验收**：让 Studio 自己针对 `jinhu-smart-park` 生成下一步计划，并先执行一个低风险任务；主操作者只观察和验收，不代替 Studio 写实现。
4. **证明隔离**：确认任务在独立 `codex/*` worktree 中运行，能识别脏工作区和远端差异，不覆盖人工或其他 Agent 改动。
5. **证明交互闭环**：页面默认只展示计划、必要过程、阻断和结果；代码级日志折叠到详情；失败必须给出可操作原因，不能无反馈卡住。
6. **证明工程闭环**：测试、提交、PR、Review、门禁、合并、生产发布和验收证据都要关联同一个任务 ID。
7. **修复 Console 常驻方式**：消除 launchd `EX_CONFIG`，完成停止手动兜底后的冷启动验证。
8. **受控发布**：只在检查通过后合并，通过 `Deploy Studio to Office 204` 发布，并验证本地 SHA = 远端合并 SHA = 生产 SHA。

## 8. 发布方式

生产发布只允许使用：

- Workflow：`.github/workflows/deploy-office-204.yml`
- GitHub Actions 名称：`Deploy Studio to Office 204`
- 说明：`docs/release/GITHUB_ACTIONS_OFFICE_DEPLOYMENT.md`

发布完成必须保留以下证据：

- 合并 PR 与 merge SHA。
- CI/check run 全部通过且无关键 annotations。
- 部署日志中的 `Deployment complete: commit=<SHA>`。
- `https://studio.cnjinhu.com/login`、OIDC、OAuth Resource、MCP Ready 均通过。
- 本地主干、`origin/main`、生产提交三端一致。

不要把“Workflow 绿色”“文件上传成功”单独当作生产完成。

## 9. 安全边界

- 不记录或输出 SSH 私钥、密码、Token、Base64 环境密钥。
- 不绕过 `STUDIO_REPOSITORY_IDENTITY_BLOCKED`、生命周期门禁、变更路径门禁或人工审批门禁。
- 不直接覆盖脏工作区，不强删归属不明的 worktree。
- 不把 Phoenix ERP、Smart Park 或其他项目的身份、密钥、Runner、消息路由混用。
- 生产修改只能走仓库内受控 Workflow；数据库迁移和破坏性操作必须单独评估。

## 10. 新窗口建议首条指令

可将下面内容原样发给新工作窗口：

> 请先进入 `/Users/mac/Documents/anksen-agent-studio`，完整阅读 `AGENTS.md` 和 `docs/handoff/CURRENT_WORK_WINDOW_HANDOFF.md`。先只读执行仓库身份、主干同步、8 项目生命周期、Console/Worker/Resident Worker、launchd、监听端口和真实 heartbeat 核验。不要修改业务代码，不要清理任何 worktree。确认事实后，优先审查并继续 `codex/studio-conversational-agent`，用 Studio 自身对 Jinhu Smart Park 执行一个低风险任务，验证自然语言反馈、项目路由、独立 worktree、测试、提交和结果回传的完整闭环。通过全部门禁后再提交、合并并使用受控 Office 204 Workflow 发布，最后报告本地、远端、生产三端 SHA 和用户可见验收结果。

