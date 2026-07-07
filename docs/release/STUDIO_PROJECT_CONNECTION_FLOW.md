# Studio Project Connection Flow

## 目标

让 ANKSEN Agent Studio 可以用统一入口接入不同项目，而不是把项目绑定逻辑散落在手工脚本里。

本轮提供三种接入方式：

1. GitHub / Git 仓库地址
2. 本地项目目录
3. 链接地址 / Zip 占位项目

接入后会生成：

- `examples/<project-id>/project.config.example.json`
- `runtime/projects/<project-id>/binding.json`
- `runtime/projects/<project-id>/project-state.json`
- `runtime/projects/<project-id>/architecture.json`
- `runtime/projects/<project-id>/agent-studio-status.json`
- `runtime/projects/<project-id>/handoff-summary.md`
- `runtime/global/attached-project-workspace.json`

这些文件只描述连接器、绑定关系和运行记忆，不会写业务仓库代码，不会部署，不会读取真实凭证。

## CLI 用法

### 1. 接入 GitHub / Git 仓库

```bash
node packages/orchestrator-core/bin/studio.mjs project connect \
  --project-id phoenix-erp \
  --project-name "Phoenix ERP" \
  --source-type git_url \
  --url https://github.com/ivanzhao299/phoenix-erp-v3.git \
  --default-branch main \
  --package-manager pnpm \
  --dry-run
```

如果需要真正写入连接器与运行记忆：

```bash
node packages/orchestrator-core/bin/studio.mjs project connect \
  --project-id phoenix-erp \
  --project-name "Phoenix ERP" \
  --source-type git_url \
  --url https://github.com/ivanzhao299/phoenix-erp-v3.git \
  --default-branch main \
  --package-manager pnpm \
  --apply
```

说明：

- 若未提供 `--local-path`，Studio 会默认尝试使用 `../attached-projects/<project-id>` 作为本地挂接目录。
- `--apply` 时会先尝试 `git clone`，然后再补齐 binding 与 runtime memory。

### 2. 接入本地项目目录

```bash
node packages/orchestrator-core/bin/studio.mjs project connect \
  --project-id phoenix-erp \
  --project-name "Phoenix ERP" \
  --source-type local_path \
  --local-path /absolute/path/to/phoenix-erp-v3 \
  --package-manager pnpm \
  --apply
```

适用于：

- 本地已有仓库
- 不希望 Studio 自动 clone
- 只想做绑定与工作区切换

### 3. 接入链接地址 / Zip 占位项目

```bash
node packages/orchestrator-core/bin/studio.mjs project connect \
  --project-id supplier-portal \
  --project-name "Supplier Portal" \
  --source-type zip_placeholder \
  --url https://example.com/supplier-portal.zip \
  --description "等待正式仓库或交付包" \
  --dry-run
```

适用于：

- 只有交付链接，还没有本地仓库
- 先登记项目，再等待后续正式接入

## Console 接入方式

在 Console 的“项目”页新增了“接入新项目”区块，可直接填写：

- 项目 ID
- 项目名称
- 接入方式
- 本地路径
- 地址 / 仓库 URL
- 默认分支
- 包管理器
- 项目类型
- 说明

然后执行：

- `生成连接草稿`
- `写入并接入工作区`

对应底层动作：

- `project-connect-dry-run`
- `project-connect-apply`

这两个动作都经过 Access Center 和 Governance 边界：

- `dry-run` 只生成计划
- `apply` 只写 Studio 自己的连接器和运行记忆
- 不会直接写被接入项目的业务代码

同时，Console 已把“当前项目”做成显式上下文：

- 左侧项目列表点击后会切换到对应 `?project=<project-id>` 页面
- 顶部导航会自动保留当前项目 query
- 项目页与任务页会默认使用当前项目作为动作上下文

这样接入多个仓库后，不需要每次重新手填项目范围。

## 推荐流程

1. 先执行 `dry-run`
2. 确认 `project_id`、`source_type` 和本地路径推断是否正确
3. 再执行 `apply`
4. 接入后运行：

```bash
node packages/orchestrator-core/bin/studio.mjs context project --project <project-id>
node packages/orchestrator-core/bin/studio.mjs project inspect --config examples/<project-id>/project.config.example.json --dry-run
```

## 当前边界

- 不部署
- 不做 production operation
- 不读取 / 不保存真实凭证
- 不修改 `jinhu-smart-park`
- 不自动写挂接项目代码

下一步再把“接入项目”继续接到 proposal review、dispatch plan 和 worker queue trace。
