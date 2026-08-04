---
name: ANKSEN Studio for Photoshop V3
description: 与 Photoshop 深色宿主一致的受控设计生产工作台
colors:
  surface-0: "var(--uxp-host-background-color, #242424)"
  surface-1: "#2d2d2d"
  surface-2: "#363636"
  surface-3: "#414141"
  log-surface: "#1e1e1e"
  line: "rgba(255, 255, 255, 0.13)"
  line-strong: "rgba(255, 255, 255, 0.22)"
  text: "#f1f1f1"
  text-muted: "#b7b7b7"
  text-faint: "#929292"
  log-text: "#d7d7d7"
  accent: "#2680eb"
  accent-hover: "#1473e6"
  focus: "#80bfff"
  info: "#9ecbff"
  success: "#6fcf97"
  warning: "#f2c94c"
  danger: "#ff7b72"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  body-compact:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "9px"
    fontWeight: 600
    lineHeight: 1.35
  mono:
    fontFamily: '"SFMono-Regular", Consolas, monospace'
    fontSize: "9px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  badge: "4px"
  control: "5px"
  container: "6px"
  full: "50%"
spacing:
  xs: "4px"
  sm: "7px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  empty: "22px"
components:
  button:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    height: "32px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
  button-compact:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
    height: "28px"
  badge:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.badge}"
    padding: "3px 6px"
---

# Design System: ANKSEN Studio for Photoshop V3

## Overview

**产品模式：Operate。创意北极星：“受控生产台”。** 这是嵌入 Photoshop 的高密度生产工具，不是营销页面。界面首先服务于快速扫描任务、图层、操作风险、预检与交付证据；品牌存在于精确的蓝色动作、清楚的状态语言和克制的层级中。

视觉原则是宿主一致、信息优先、风险可见、确认先于写入。深色中性色让 Photoshop 文档保持视觉主角；所有写入路径都要展示影响、阻塞原因与可撤销/输出提示。页面不引入第二套 Planner、Scheduler、Worker、Runtime、Goal、Task、Queue 或 State Machine。

**关键特征：** 紧凑桌面密度；色调分层而非卡片堆叠；蓝色仅用于主操作、当前选择和信息状态；风险同时用颜色与文字表达；静态、可审计、无营销式装饰。

## Colors

以 Photoshop 深灰为底，四级 surface 建立轻量层级；前景分为主文字、辅助文字和弱标签。`surface-0` 必须优先读取 `--uxp-host-background-color`，回退为 `#242424`。

- **品牌/动作蓝** `#2680eb`：主按钮、活动 Tab 下划线、产品标记；hover 使用 `#1473e6`。不要用作光晕、大面积背景或装饰。
- **状态色**：成功/只读 `#6fcf97`，警告/中风险 `#f2c94c`，阻塞/高风险 `#ff7b72`，信息/中风险 `#9ecbff`。每个状态必须带明确文字或标签，不得只靠颜色。
- **焦点蓝** `#80bfff`：仅用于 `2px` 可见焦点轮廓，`1px` offset。
- **中性色**：`surface-0` 至 `surface-3` 用于宿主、状态条、控件和徽章；`line` 用于常规分隔，`line-strong` 用于控件边框、确认区和空状态；执行日志使用 `#1e1e1e` / `#d7d7d7`。

## Typography

统一使用系统 UI 字体栈，中文回退到 Microsoft YaHei；不下载字体、不使用展示字体。字号刻意紧凑，但必须保持宿主面板内的清晰层级。

- **Headline**：14px/650/1.25，用于产品名；只允许极轻的 `-0.01em` 收紧。
- **Title**：13px/650/1.3，用于面板标题和任务摘要；技术分数是唯一 24px 的数据强调。
- **Body**：根字号 12px、行高 1.45；面板说明和交付项多用 10px，字段辅助文本和元数据用 9px。
- **Label**：8–10px、550–750，用于徽章、状态、风险和上下文标签；保持短句，不用全大写制造层级。
- **Mono**：9px/1.45，仅用于执行记录，使用 SFMono/Consolas 回退。

## Layout

工作台是纵向单列：应用头部 → 三项上下文条 → 五个等宽 Tab → 可滚动工作区 → 固定在内容流底部的执行记录。标准面板内边距为 14px，区块间距约 12–14px；列表以 1px 分隔线组织，不把每一行包成独立卡片。控件高度为 32px，紧凑控件 28px，列表行最小 34px，Tab 最小 38px。

响应式针对 Photoshop 可停靠面板，而非网页设备类型：

- **≥430px**：面板内边距增至 16px 18px，任务规格由两列升至四列，按钮保持内容宽度。
- **281–429px**：默认两列规格、三列上下文和可换行按钮。
- **230–280px**：隐藏非关键连接状态，头部顶部对齐；上下文条改为单列，按钮行变为全宽堆叠，Tab 字号降至 10px。
- **下限 230px**：长标题、文档名、操作说明与活动信息使用省略号；主要操作和风险标签不能被截断到无法辨识。

## Elevation & Depth

系统不使用阴影。深度完全由 `surface-0…3` 的色调阶梯、1px 分隔线、局部边框和覆盖层建立。忙碌态使用 `rgba(30,30,30,.88)` 全面板遮罩，明确阻止重复操作；除该阻塞态外，不用浮层模拟网页式卡片或弹窗。

## Shapes

形状小而克制：徽章和步骤编号 4px，按钮 5px，空状态与产品标记 6px；圆形只用于 6px 连接点和 22px 忙碌指示器。容器优先使用直边与分隔线，虚线圆角框仅表示空状态。不要扩大圆角或加入胶囊形装饰，以免偏离 Photoshop 的工具感。

## Components

- **Header 与 Context Bar**：28px 蓝色产品标记配两行名称；连接状态用圆点加“本地受控”文字。三个上下文单元始终展示任务、文档、预检的当前值。
- **Tabs**：五等分、透明底；hover 仅轻微提亮，活动项以主文字和底部 2px 蓝线表达。保留 `tablist` / `tab` / `tabpanel` 关系，并同步 `aria-selected`、`aria-controls` 与 `hidden`。
- **Buttons**：默认使用 `surface-2` 与强边框，hover 升至 `surface-3`；每个动作组至多一个蓝色主按钮。disabled 保留原形并降到 `.38` opacity。危险执行必须先经过显式确认，不把风险动作伪装成普通主按钮。
- **Badges 与状态**：V2、计数和风险徽章采用 4px 圆角与紧凑内距。风险背景保持中性，文字用语义色并写出风险等级。
- **Empty / Summary / Rows**：空状态使用虚线边框和短说明；有数据后切换为摘要、图层行、操作行、问题行或交付行。列表依靠顺序、对齐和分隔线，不依靠卡片阴影。
- **Approval**：复选框、确认文案和后果说明组成不可拆分的确认块；执行按钮在批准前保持 disabled。文件选择器只负责路径授权；预检含 HIGH 问题时还必须完成与任务、文档及报告哈希绑定的二次确认。
- **Activity / Busy**：活动区是可展开的原始执行记录，按钮维护 `aria-expanded` / `aria-controls`；忙碌遮罩使用 `aria-live="assertive"`、可读消息与旋转指示器。`prefers-reduced-motion` 下延长旋转周期，不增加其他动效。
- **Keyboard 与 a11y**：所有交互使用原生 button/input；键盘焦点必须保留 `2px #80bfff` 轮廓。Tab 应支持标准 Tab/方向键语义，状态更新使用合适的 live region。中文文案说明错误、阻塞与下一步；不可依赖颜色、图标、hover 或动画单独传意。

## Do's and Don'ts

### Do

- **Do** 继承 UXP/Photoshop 的宿主背景、系统字体、紧凑控件和键盘预期；新增界面优先复用现有 tokens 与组件状态。
- **Do** 让任务 → 图层 → 操作 → 检查 → 交付保持可预测的信息顺序，并在写入前展示影响、审批与回滚提示。
- **Do** 将 `design-taste-frontend`（taste）仅作为前端构图、层级和细节参考；将 `impeccable` 用于 UXP 界面设计、a11y 与一致性检查。
- **Do** 把技术预检结果标为辅助证据，并保留 Photoshop 内真实文档、图层、颜色、字体与导出验证。

### Don't

- **Don't** 使用渐变、发光、玻璃拟态、巨型标题、展示字体、营销式动效、悬浮卡片海洋或大面积品牌蓝。
- **Don't** 复制浏览器网页导航或移动 App 模式；这是可停靠的 Photoshop 面板，窄宽度下应重排而非缩成不可读画布。
- **Don't** 用纯颜色表达成功、风险、错误或禁用状态，也不要移除焦点轮廓、ARIA 关系和 reduced-motion 处理。
- **Don't** 将 taste 或 `impeccable` 当成印前审批工具；它们不替代设计总监视觉审查、Photoshop 真实主机验收、CMYK/ICC/分辨率/出血/安全区/字体授权/打样与印厂规范。
- **Don't** 让界面暗示插件可执行任意 BatchPlay、脚本、自动覆盖、自动部署或未在真实 Photoshop 中验证的能力。
