# Photoshop 操控能力实情与下一步

## 结论

Photoshop 的连接、启动、脚本执行、文件创建和输出能力确实增强了，但“高级设计动作的可编排覆盖率”仍然不足。上一版 V3 不是最强 Photoshop 能力的完整体现：它实际采用的是 **Computer Use 打开脚本 + ExtendScript JSX 生成文档**，UXP 插件虽然加载成功，却没有承担该张作品的复杂合成。

因此不能把“PSD 已生成、图层可编辑、插件已加载”表述成“已经具备高级平面设计师的完整操控能力”。前者成立，后者尚未成立。

## 三种操作方式

### 1. UXP 插件 + Photoshop DOM / BatchPlay

适合长期固化、受控复用和与 Studio Job Contract 对接。当前 0.4.0 已支持：

- 检查文档与图层树；
- 选择、改名、显隐、移动、缩放、复制图层；
- 替换文字、设置文字颜色；
- 替换智能对象；
- 保存 PSD、导出 PNG/JPG；
- 预检、审批绑定、操作记录和交付 Manifest。

当前没有进入白名单 DSL 的高级动作：

- 新建并完整控制文字层的字体、字重、行距、字距和段落样式；
- 钢笔路径、矢量形状、图层蒙版、通道计算；
- 曲线、可选颜色、渐变映射等调整层与剪贴关系；
- Blend If、透视变形、变形网格、消失点；
- 智能滤镜参数、Camera Raw、局部锐化与降噪；
- 图层复合、版本快照和复杂 Logo 锁定组件。

所以当前 UXP 更像“可靠的生产控制台”，不是完整的高级设计执行器。

### 2. Photoshop 内部脚本：PSJS / ExtendScript JSX

这是当前创建复杂文档最直接的方式。V3 JSX 已能：

- 精确创建 640 × 1440 mm、150 ppi 文档；
- 创建语义图层组、参考线和真实文字层；
- 置入并缩放智能对象；
- 设置基础混合模式、色块覆盖和锐化；
- 转换色彩模式；
- 输出 PSD、PDF 与 PNG，并写生产日志。

但 V3 只是把一张接近完成的 AI 图作为整幅背景，再叠加文字和 Logo。它没有执行路径分区、蒙版合成、通道选区、局部调整层、透视修复或复杂光影重建。也就是说，脚本生产能力提高了，设计加工深度没有同步提高。

### 3. Computer Use 操作 Photoshop 界面

适合完成启动 Photoshop、打开菜单、调用脚本、查看实际画面、处理文件选择器和补充尚未自动化的命令。它能覆盖更多 UI 功能，但不适合依赖坐标完成大批精密排版；界面操作必须由视觉检查和内部脚本/BatchPlay 承担精确数值。

## “能力最强”的正确选择

能力最强的不是三选一，而是混合链路：

```text
设计 Brief / 内容矩阵
  -> 参数化 Composition Spec
  -> UXP Job Contract 与可恢复执行
  -> DOM + BatchPlay 高级动作
  -> JSX/PSJS 兼容与批量输出
  -> Computer Use 启动、检查和必要的人工界面动作
  -> 视觉审查后回写参数重跑
```

上一版只实现了这条链路中的“JSX 生成 + Computer Use 启动 + 文件检查”，没有实现高级动作 DSL 和设计参数回写，因此结果没有资格代表最终能力上限。

## 下一阶段必须补强的动作层

### P1：排版与品牌锁定

- `CREATE_TEXT_LAYER`
- `SET_TEXT_STYLE`
- `SET_PARAGRAPH_STYLE`
- `FIT_TEXT_WITHOUT_DISTORTION`
- `CREATE_LOGO_LOCKUP`
- `OPTICAL_ALIGN`
- `MEASURE_CLEAR_SPACE`

目标：字体选择、字号、行距、字距、长短句节奏和 Logo 安全区全部由结构化参数控制，而不是写死坐标。

### P2：真实合成

- `CREATE_VECTOR_SHAPE`
- `CREATE_PATH`
- `CREATE_LAYER_MASK`
- `CREATE_CHANNEL_SELECTION`
- `CLIP_ADJUSTMENT_LAYER`
- `SET_BLEND_IF`
- `APPLY_PERSPECTIVE_TRANSFORM`

目标：能够拆开人物、产品、空间、光线和背景，建立真实遮挡、景深和光影，而不是把 AI 图当整幅底图。

### P3：色彩、材质与滤镜

- `CREATE_CURVES`
- `CREATE_SELECTIVE_COLOR`
- `CREATE_GRADIENT_MAP`
- `APPLY_SMART_FILTER`
- `LOCAL_SHARPEN`
- `MATERIAL_TEXTURE_MASK`

目标：局部调色和材质统一可编辑、可回滚，滤镜只服务具体视觉意图。

### P4：审查回路

- 导出缩略图、实际观看尺寸和 100% 局部快照；
- 检查视觉重心、留白、Logo 安全区、标题节奏、OCR 正确性和边缘质量；
- 把问题映射回 Composition Spec 参数；
- 单变量修正后在 Photoshop 重跑，不靠手工碰运气。

## 下一张图的技术纪律

在展贸中心内容策略、首张文案和视觉情绪确定之前，不调用 Photoshop。进入 Photoshop 后，首张必须至少真实使用：透明/矢量 Logo 锁定、参数化文字样式、一个路径或蒙版关系、两组局部调整层和三尺度快照。否则仍然只是“把 AI 图放进 PSD”。
