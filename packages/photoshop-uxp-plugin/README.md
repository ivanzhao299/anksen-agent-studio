# ANKSEN Studio Photoshop UXP Plugin

受 Agent Studio 治理的 Photoshop 设计执行端。当前模板生成 `640 × 1440 mm` 的金湖科创产业园竖版展板，保留可编辑文字图层，并支持 PSD、PNG、JPG 输出。

十二联画生产版使用 `scripts/jinhu-series-production.jsx`。脚本读取 `design-assets/jinhu-12-panel-series/photoshop-production-manifest.json`，逐页生成真实文字图层、品牌锁定组、智能对象主视觉、整体色调层、150ppi CMYK PSD、印刷PDF和3840px高PNG预览。它是受控的本地 Photoshop 生产执行器，不新增 Planner、Scheduler、Runtime 或队列。

## 安全边界

- 插件不是 Planner、Scheduler、Worker、Queue 或 State Machine。
- Studio 仍然是唯一任务、审批和状态来源。
- 插件仅执行任务协议中的白名单操作。
- 修改 Photoshop 文档前必须在插件面板中人工确认。
- 真实 Studio 网络接入和 Runtime 默认关闭。
- 不读取凭证值；联网模式只传递现有 Credential Reference 标识。
- 不部署、不发布、不修改生产环境。

## 本地开发

```bash
pnpm --filter @anksen-agent-studio/photoshop-uxp-plugin test
pnpm --filter @anksen-agent-studio/photoshop-uxp-plugin build
```

构建结果位于 `dist/`。

1. 从 Adobe Creative Cloud 安装 Photoshop 2024 或更高版本。
2. 安装 Adobe UXP Developer Tool。
3. 在 Photoshop“首选项 > 增效工具”中启用“开发人员模式”，然后重启 Photoshop 和 UXP Developer Tool。若未启用，Photoshop 日志只会给出误导性的 `Plugin rejected ... due to invalid object`。
4. 在 UXP Developer Tool 中选择 `Add Plugin`。
5. 选择 `dist/manifest.json`。
6. 启动 Photoshop，点击 `Load`。
7. 在 Photoshop 的“增效工具”菜单打开 `ANKSEN Studio`。
8. 点击“载入内置示例”，检查内容后勾选人工确认。
9. 点击“生成可编辑 PSD”。
10. 调整后点击“导出 PNG”，由文件选择器明确选择保存位置。

Photoshop 27.9 对刚创建文档调用 `suspendHistory` 时可能抛出无结构错误。执行器会在该能力不可用时继续保持 `executeAsModal` 写入边界；Logo 缩放必须使用模块级 `constants.AnchorPosition`，不能使用 `app.constants`。

## 真实产物验收

```bash
pnpm --dir packages/photoshop-uxp-plugin verify:artifacts -- \
  /Users/mac/Documents/jinhu-science-innovation-park.psd \
  /Users/mac/Documents/jinhu-science-innovation-park-preview.png
```

脚本校验 PSD 的 `8BPS` 签名、文件非空、PNG 签名，以及固定模板在 150 ppi 下的 `3780 × 8504 px` 尺寸。Photoshop 内还应确认以下可编辑图层：`00_BACKGROUND_蓝白品牌渐变`、`01_LOGO_金湖科创产业园`、`02_COPY_可编辑文字` 和各命名文字层。

## 打包

一条命令生成并自检可安装 CCX：

```bash
pnpm --filter @anksen-agent-studio/photoshop-uxp-plugin package:ccx
```

产物为 `release/com.anksen.studio.photoshop_PS.ccx`。脚本遵循 UXP Developer Tool 2.2.1 的 Manifest 严格校验项和 CCX 容器格式，并运行完整性检查。也可运行 `package:prepare` 后，在 UXP Developer Tool 中对 `dist/manifest.json` 使用 `Package`。不要手工把任意 ZIP 改名为 `.ccx`。

## 无Developer Tool的执行器验收

Photoshop 23.5及以上可以从“文件 > 脚本 > 浏览”运行UXP `.psjs` 脚本。选择 `scripts/e2e-photoshop.psjs`，再依次选择Logo、PSD保存位置和PNG保存位置。该脚本调用与插件面板相同的任务校验、布局和Photoshop执行器；它不能替代面板加载与CCX打包验收。

十二联画的实际生产可从 Photoshop 运行 `scripts/jinhu-series-production.jsx`。输出固定写入 `/Users/mac/Documents/Jinhu-Science-Innovation-Park-12-Panel-Final`，包含 `PSD/`、`PDF/`、`PREVIEW_4K/` 和 `production-log.txt`。正式送印前仍需使用印厂提供的ICC配置文件完成一次软打样；当前脚本优先使用 Coated FOGRA39，若本机没有该配置文件则使用 Photoshop 当前工作CMYK。

## 任务示例

参见 `examples/jinhu-poster-job.example.json` 和 `schemas/photoshop-design-job.schema.json`。

## Studio 接入

`src/studio-client.cjs`定义了HTTPS客户端边界。正式启用前必须：

1. 以 `manifest.connected.example.json` 创建单独的联网构建，并把占位域名替换为批准的 Studio HTTPS 域名；本地默认Manifest不申请网络权限。
2. 在现有 Runtime Adapter Marketplace 中启用 `photoshop-uxp`。
3. 通过现有 Governance Center proposal 与 Runtime Activation Gate。
4. 确认 Photoshop 节点健康、用户会话和输出目录权限。
5. 保持 `max_parallel_tasks = 1`，避免多个任务争用 Photoshop 模态状态。
