# MEDIA-003 Digital Human Scene Render Pipeline

## 目标

Studio 现在有一条受治理的混合数字人通道。它不再把 Blender 视为所有短片的唯一解法，而是按交付目标选择：

1. Blender：需要真实 360 度资产、遮挡、精确相机和长期复用时使用。
2. Reference Lock：快速验证原角色身份、场景置入和口型。
3. AI 首尾帧：用相同角色与实景边界帧生成 5–15 秒连续动作镜头，降低短片制作成本。

## 资产分层

### Character Asset

每个角色由 `characters.json` 固化：

- 稳定 `assetId`
- 角色原型与显示名称
- 色彩和身体比例
- 参考图与身份约束
- 配音资产

Blender 产物包含一个层级控制 Rig、面部口型 Shape Keys、角色 GLB 和八角度转台。故事切换时复用同一个角色资产，不重新随机生成人物。

设定图提取器还会从批准的角色四宫格中分别生成灰灰、二宝、小拌和水塔爷爷的：

- 角色面板与主形象；
- 正视、侧视、背视；
- 表情参考；
- 可审计的 `character-asset-index.json` 和来源 SHA-256。

这些切片用于身份锁定和 AI 视频的 element reference。它们减少建模准备工作，但不能推断设定图没有展示的底部、内侧和遮挡结构。

### Scene Asset

`scene.json` 描述环境、尺寸、参考实景、视频时间点和重建资产。水泥二厂高保真测试使用原视频连续帧作为动态场景，并用 Depth Anything V2 生成深度证据。深度图用于约束镜头运动和后续空间重建，不再直接把单目深度网格当成成片背景，以避免遮挡边界撕裂。

### Story Performance

`story.json` 只描述：

- 时长、帧率与分辨率
- 镜头段落
- 出场角色
- 表演动作
- 台词、配音和开始时间

文案变化不会破坏角色资产。镜头、动作和口型在渲染时重新编排。

## 中文口型

本地 `pypinyin` 将中文台词拆为声母、韵母，再映射到 `AI / E / EE / O / U / MBP / FV / L / WQ` 口型。时间长度来自实际 WAV，生成可审计的 viseme JSON。

这是脚本驱动对齐，适合当前离线管线。生产级精细口型的下一层是接入声学强制对齐器或由语音服务返回音素时间戳；接口不变，只替换 viseme 生成器。

## 受治理执行

专业 Runner profile：

`media-digital-human-blender`

链路：

`Skill Router -> Professional Runner Gate -> Blender Adapter -> Artifact Manifest / Audit`

- 默认不激活。
- 网络策略为 `DENY`。
- 只能写 `runtime/artifacts/media`。
- CHECK 只验证资产。
- RENDER 必须持有已消费的 render approval。
- 不发布、不上传、不触碰业务项目。

## 命令

```bash
pnpm media:digital-human:doctor
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs validate \
  --project runtime/workspaces/media/cement-factory-digital-human-v7
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs render \
  --project runtime/workspaces/media/cement-factory-digital-human-v7 \
  --output runtime/artifacts/media/cement-factory-digital-human-v7
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs turntables \
  --project runtime/workspaces/media/cement-factory-digital-human-v7 \
  --output runtime/artifacts/media/cement-factory-digital-human-v7
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs render-reference-lock \
  --project runtime/workspaces/media/cement-factory-digital-human-v8 \
  --output runtime/artifacts/media/cement-factory-digital-human-v8-reference-lock
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs extract-reference-assets \
  --project runtime/workspaces/media/cement-factory-digital-human-v8 \
  --source "/absolute/path/to/04FB03AF-169F-4050-B084-A8FB0A654F2B 2.PNG"
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs prepare-ai-video \
  --project runtime/workspaces/media/cement-factory-digital-human-v8 \
  --provider kling-ai \
  --output runtime/artifacts/media/cement-factory-digital-human-v8-ai-video-plan
```

`turntables` 从 Blender master 读取角色，冻结中立姿态，隔离场景和其他角色，
根据角色包围盒自动构图并输出八个角度。它用于身份一致性 QA，也允许角色修改后
单独重建资产预览，不必重新渲染整段故事。

## 当前验证样片

水泥二厂 V7 样片验证了：

- 四个独立角色 GLB 和一个场景 GLB；
- 同一角色在八个角度保持同一几何和材质；
- 四段镜头内角色真实置入同一三维空间；
- 角色位移、肢体控制、相机位移和景别变化；
- 四段中文台词对应的可审计 viseme 轨道；
- H.264 视频与 AAC 中文语音合成；
- Blender master 可继续编辑、换场景和换故事。

当前角色是程序化低多边形代理，用于证明全链路和资产边界，不冒充最终工业级
雕刻模型。正式 IP 资产可直接替换角色几何和骨骼 Rig；生产级口型可将拼音对齐器
替换为声学强制对齐器，故事清单和 Studio 调度接口保持不变。

## 可替换边界

- 角色几何可替换为正式建模 GLB/Blend。
- 层级 Rig 可替换为骨骼 Rig。
- 程序化工厂可替换为扫描场景。
- 拼音时间轴可替换为声学音素时间轴。
- 本地 Eevee 可替换为 Cycles 或 GPU 渲染农场。

Planning、Governance、Queue 和 Worker 仍使用 Studio 现有能力；本模块只提供专业媒体 Runner，不引入第二套调度系统。

## 高保真问题与修复

第一次 3D 测试只按文字特征拼装几何，虽然具备 B2、安全帽、脸屏和胸标，却没有锁定原设定图的轮廓、工业结构和表情比例。场景的单目深度网格还在树木与建筑边缘产生撕裂。这两个问题说明“具备特征”不等于“角色身份一致”，“生成深度”也不等于“场景精确重建”。

V8 增加两个明确层级：

1. `reference-locked-2.5d`：从批准的设定图生成锁定前视资产，保留角色身份，使用局部网格形变、眨眼、口型、呼吸和进场运动完成五至八秒表演测试。
2. `production-3d`：必须补齐独立高清正视、侧视、背视和遮挡结构，再经过拓扑、UV、材质、骨骼、表情、口型和转台审批。单张集合设定图不能自动声明为精确 360 度模型。

场景的短片验证直接读取上传视频的连续帧，做保留结构的轻量风格统一。后续生产 3D 场景应使用摄影测量或人工重建，并通过相机标定、遮挡、尺度和地面接触验证。

## AI 首尾帧连续视频

`prepare-ai-video` 生成的不是成片，而是一份可进入 Studio Proposal / Governance 的 provider dispatch plan：

1. 从实景视频的两个时间点生成首帧和尾帧。
2. 在两帧中使用同一批准角色资产，并按道路透视缩放到画面高度的约 50%。
3. 按角色最后一个非透明脚底像素对齐道路基线，避免透明安全边距造成悬空。
4. 使用宽软阴影与脚掌紧密阴影两层局部 mask，并用道路纹理轻度遮蔽脚底边缘。
5. 采样人物所在局部场景的 LAB 色彩，将人物亮度和环境色有限度匹配。
6. 附加角色正视、侧视、背视参考，锁定 B2 安全帽、混凝土身体、面屏、手套、靴子和胸标。
7. 把 6 秒动作拆为呼吸眨眼、转头挥手、回正收势三个时间段。
8. 映射 provider 的 `image`、`image_tail`、prompt、negative prompt 和 element references。
9. 写入 `ai-video-dispatch-plan.json`，但不读取密钥、不调用外部模型。

外部生成属于 MEDIUM 风险且产生费用，必须同时具备：

- `external_vault_ref` 形式的 provider 凭证引用；
- 费用审批；
- provider submission audit。

因此当前状态为 `AWAITING_APPROVAL_AND_CREDENTIAL_REFERENCE`。该状态代表生成准备已经完成，不代表可灵已经被调用或已经产生视频。
