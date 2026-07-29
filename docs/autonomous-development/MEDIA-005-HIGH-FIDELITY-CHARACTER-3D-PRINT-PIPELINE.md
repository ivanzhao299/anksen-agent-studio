# MEDIA-005 High-Fidelity Character 3D Print Pipeline

## 目标

本流水线用于把已锁定的角色视觉资产转化为可复用、可动画、可制造的
高保真三维主资产。它不把任一 AI 供应商输出直接视为最终模型，而是使用
“多供应商候选生成、量化筛选、DCC 精修、打印验证”的闭环。

机器可读定义：

`runtime/global/high-fidelity-character-3d-pipeline.json`

当前试点资产：

`huihui-printable-v3`

## 不变原则

1. 正面锁定图是身份与比例权威。
2. 侧面、背面和斜视图用于约束隐藏几何，但 AI 补出的视图不是度量扫描。
3. 本地 Visual Hull 只用于轮廓、水密和重投影验证，不是最终角色。
4. 文字、品牌标识和精确符号不能依赖生成模型猜测，必须在 DCC 阶段重建。
5. 先验收几何，后购买纹理；纹理不能修复错误比例。
6. 所有外部 API 密钥只通过 Credential Reference 在执行边界解析，禁止落盘。
7. 所有付费请求必须同时具有显式 `--apply` 和 `--cost-approved`。

## 标准流程

```text
Reference Lock
  -> Eight-view + masks + relative depth
  -> Local visual-hull scaffold
  -> Meshy-6 geometry candidate
  -> Tripo v3.1 geometry candidate
  -> Automated eight-view QA
  -> Candidate selection
  -> Semantic region classification
  -> Feature-preserving Blender/ZBrush DCC closure
  -> Material/PBR generation
  -> Printability QA
  -> Test print
  -> GLB/3MF/STL master assets
```

## 第一轮 Meshy-6 策略

第一轮只购买几何，不购买纹理：

- `ai_model: meshy-6`
- `should_texture: false`
- `enable_pbr: false`
- `should_remesh: false`
- `image_enhancement: false`
- 输入视角：正、右、背、左
- 输出优先：GLB、OBJ、STL

这样能先判断胖短身体、短肢体、鞋、帽檐、手套和脸屏是否被正确重建。
只有候选几何通过身份、比例和打印性闸门，才进入纹理与 PBR 阶段。

## 竞标与评分

Meshy-6 是当前工作站上最快可执行的第一候选。Tripo v3.1 作为第二候选，
需要新增 Provider Adapter 后采用相同四视图和几何优先策略。具备受治理的
NVIDIA Worker 后，再把 Hunyuan3D 2.1 加入第三候选。

自动评分至少包括：

- 八视图轮廓重投影；
- 身高、体宽、头身比、肢体长度和鞋体积比例；
- 对称性与隐藏面合理性；
- 自相交、破面和非流形；
- 水密性、最小壁厚与最小特征；
- 正面身份和品牌位置一致性。

自动候选门槛分为两层。供应商竞标的目标阈值仍然较高；由于隐藏视角由
AI 补全而非度量扫描，当前 DCC 预打样门槛采用归一化轮廓比较，不能替代
人工身份检查：

| 检查 | 阈值 |
| --- | --- |
| DCC 正面 Silhouette IoU | `>= 0.76` |
| DCC 八视图平均 Silhouette IoU | `>= 0.72` |
| DCC 单视图最低 Silhouette IoU | `>= 0.58` |
| 最终身份目标（正面） | `>= 0.96`，需度量参考或人工确认 |
| 关键点误差 | `<= 画幅 2%` |
| 最小壁厚 | `1.6 mm` |
| 最小可打印特征 | `0.8 mm` |

## 已打通能力

当前 `huihui-printable-v3` 已完成一条真实 Meshy-6 + 本地 DCC 流程：

- Meshy 任务：`019fa760-0e83-7276-adf2-4389bc09e9b8`
- 供应商候选：`runtime/artifacts/media/huihui-printable-v3/meshy-plan/provider-candidate.glb`
- 当前精修候选：`runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced`
- 基础网格：482,238 顶点、964,480 三角面、单连通体、水密、方向一致
- 曲面处理：删除 7 个游离微组件，执行体素连续重建、源硬边保护和语义区域整平
- 成品尺寸：`159.70 x 111.35 x 180.00 mm`
- 轮廓：正面 IoU `0.8686`，八视图平均 `0.7821`，最低 `0.6030`
- 有机曲面：P95 `6.9052°`、P99 `13.0953°`、大于 `10°` 比例
  `2.1539%`，原型连续性 `PASS`
- 硬边区域：P90 `23.1766°`、大于 `10°` 比例 `28.9777%`，硬边保留
  `PASS`
- DCC：保留源模型；以 BVH 曲面投射重建脸屏和帽牌；胸前旧浮雕局部消除后，
  使用无中心极点的同心四边面贴片重建胸牌，避免中心放射折线和悬浮
- 输出：可逆 `.blend`、`.glb`、基础 `.stl`、装配 `.stl`、彩色/白模转台和 QA 报告

当前仍是 `REFINED_PROTOTYPE`。源模型只有一个无材质语义的封闭网格，系统无法
仅凭二面角可靠判断“这是应保留的鞋底硬边”还是“这是应修复的身体折面”。因此
精细母模必须继续通过语义分区、局部重拓扑和人工视觉签核，不能靠继续提高全局
平滑强度完成。

精修命令：

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  refine-printable \
  --mesh runtime/artifacts/media/huihui-printable-v3/meshy-plan/provider-candidate.glb \
  --manifest runtime/workspaces/media/huihui-printable-v3/multiview-manifest.json \
  --asset-id huihui-printable-v3 \
  --target-height-mm 180 \
  --surface-method voxel \
  --surface-profile feature-preserving \
  --feature-angle-degrees 60 \
  --feature-protection-rings 1 \
  --surface-subdivision-level 2 \
  --output runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced
```

状态检查：

```bash
pnpm media:printable:status -- \
  --package runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced/printable-asset-package.json

pnpm modeling3d:surface-quality -- \
  --mesh runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced/huihui-printable-v3-base.stl \
  --source-mesh runtime/artifacts/media/huihui-printable-v3/meshy-plan/provider-candidate.glb \
  --feature-angle-degrees 60 \
  --output runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced/surface-quality-feature-aware-report.json
```

Skill Router 已增加 `character_3d_print_refinement`，正式 Runner 操作为
`REFINE_PRINTABLE`。输入网格仅允许来自 `runtime/artifacts/media`，多视角清单
仅允许来自 `runtime/workspaces/media`，输出仅允许写入媒体产物目录。

## 当前发布边界

当前状态是 `READY_FOR_VISUAL_AND_PHYSICAL_PROOF`，不是最终制造发布：

1. 自动几何、尺寸、连通、水密和八视图轮廓检查已通过；
2. 仍需视觉所有者确认脸、帽牌、徽章和整体比例；
3. 仍需切片器检查最小壁厚、自相交、支撑和悬垂；
4. 先打印 60 mm 样件，再决定 180 mm 正式件；
5. 只有实物证明为 `PASS` 后，状态检查才能进入 `READY_FOR_RELEASE_REVIEW`。

三项发布证据使用
`packages/digital-human-pipeline/examples/printable-release-evidence.example.json`
记录。视觉签核、切片检查和 60 mm 实物证明必须同时为 `PASS`；仅提供一个
物理证明文件不能绕过另外两项闸门。

## Credential Reference

Meshy 使用：

- Reference ID：`meshy-api-key-ref`
- macOS Keychain service：`com.anksen.agent-studio.meshy-api`
- macOS Keychain account：`meshy-api-key`

安全绑定命令：

```bash
security add-generic-password -U \
  -a meshy-api-key \
  -s com.anksen.agent-studio.meshy-api \
  -w
```

终端提示 `password data for new item:` 时，粘贴 Meshy API Key；终端不会回显。
再次输入相同内容完成确认。不要把 API Key 发到聊天、提交到 Git 或写进 `.env`。

只检查引用是否存在：

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  meshy-credential-status
```

该命令不读取或输出密钥明文。

## 恢复命令

```bash
node packages/orchestrator-core/bin/studio.mjs context summary
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs reconstruction-providers
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs meshy-credential-status
```

当前 Meshy 计划：

`runtime/artifacts/media/huihui-printable-v3/meshy-plan/ai-3d-reconstruction-plan.json`

现有供应商候选已保存，不需要为了 DCC 重跑而再次提交付费任务。只有人工
认为当前候选的身份或隐藏几何不可接受时，才重新进入供应商竞标。

独立的领域契约、曲面诊断和复用方式见
`docs/autonomous-development/MEDIA-006-3D-MODELING-DOMAIN.md`。
