# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

企业设计师、印前制作人员和受授权的 Studio 操作员。他们在已登录的桌面 Photoshop 会话中接收设计任务，检查文档和图层，确认高风险操作，并交付可编辑源文件与预览文件。

## Product Purpose

ANKSEN Studio for Photoshop 是 Studio 控制平面的受控设计执行端。AI 负责创意、文案、任务分解和修改建议，Photoshop 负责按明确尺寸、分辨率、色彩空间和图层结构完成生产级复现、检查和导出。

## Positioning

插件只接受版本化任务协议、能力注册表和白名单 Operation DSL，并在 Photoshop 写入前要求人工确认。V3 用文档内 Photoshop Command Graph 动态组合原子能力：创意与组合来自 Studio，插件负责把意图转换成可审计、可回滚、可复现的 Photoshop 操作，而不是让模型直接执行任意 BatchPlay 或脚本。

## Operating Context

- Adobe Photoshop 24.4 或更高版本与 UXP Manifest v5。
- Studio 是唯一 Goal、Planner、Task Graph、Scheduler、审批、事件和任务状态来源。
- Photoshop 必须处于交互式用户会话；同一节点最多执行一个受控任务。
- 默认构建仅使用 UXP 文件选择器，不申请网络权限。
- 联网构建必须使用单独插件 ID、批准的 HTTPS 域名和现有 Credential Reference。

## Capabilities and Constraints

- 导入并校验 Studio 批准的设计任务。
- 检查当前文档、文档规格和语义化图层树。
- 预览并执行 33 项白名单能力，覆盖文档、图层、文字、智能对象、选择区、路径、蒙版、调整层、滤镜、混合模式和导出。
- 新建图层可通过 `nodeOutput` 被后续命令引用，同一能力集合可组合成海报、展板、画册、包装或品牌视觉，不绑定固定模板。
- 在执行前展示风险、影响范围和回滚提示，支持用户取消。
- 生成结构化预检、操作结果、导出清单和校验信息。
- 永不接收任意 JavaScript 或任意 BatchPlay JSON。
- 永不读取凭证值、执行 Shell、遍历无关目录、自动覆盖原文件或自动部署。
- 不创建第二套 Planner、Scheduler、Worker、Runtime、Goal、Task、Queue 或 State Machine。
- Photoshop Command Graph 只在一个既有 Studio Task 内确定命令顺序；不负责调度、持久化、重试或任务状态。

## Brand Commitments

- 产品名称：ANKSEN Studio for Photoshop。
- 核心语义：受控、可信、清晰、生产级。
- 品牌蓝只用于主要动作、当前选择和信息状态，不作为装饰性光效。
- 操作界面继承 Photoshop 深色工作环境，不使用营销页式动效和展示字体。

## Evidence on Hand

- `src/photoshop-executor.cjs` 已在 Photoshop 2026 v27.9 完成真实文档创建、图层写入、PSD 保存和 PNG 导出。
- V3 24 节点能力图已在 Photoshop 2026 v27.9 完成真实验收；独立 PSD 解析确认 7 个语义图层、2 个智能对象、2 个非破坏蒙版、曲线调整层、3 个真实文字层和半径 28px 的高斯智能滤镜。
- `scripts/jinhu-series-production.jsx` 已生成十二套 CMYK PSD、印刷 PDF 和 4K 预览。
- `docs/release/PHOTOSHOP_UXP_PLUGIN_MVP.md` 记录了真实主机验收结果。
- `design-assets/jinhu-12-panel-series` 提供已审查的连续展板参考资产。

## Product Principles

1. 创意由 AI 产生，生产结果由 Photoshop 精确复现。
2. 每一次写入都可解释、可预览、可审计并由用户确认。
3. 保留真实文字、智能对象、蒙版、调整层和语义化图层结构。
4. 原文件不覆盖，高风险操作不静默执行。
5. 不声称支持未经真实 Photoshop 验证的能力。

## Accessibility & Inclusion

插件必须支持键盘操作、清晰焦点、非颜色单一表达、可读的中文字号和符合宿主深色环境的对比度。状态、错误和阻塞原因必须使用文字说明。
