# MEDIA-006 独立 3D 建模领域能力

## 目标

把高保真角色建模、曲面修复、打印检查和发布证据从视频工作流中抽离，
形成可被角色资产、文创产品、数字场景和 3D 打印任务复用的领域能力。

该能力不创建第二套 Planner、Scheduler、Worker、Runtime、Queue 或状态机。
它通过现有 Skill Router 委派
`character_3d_print_refinement / REFINE_PRINTABLE`，继续复用受治理的 Blender
本地适配器。

## 领域边界

工作流按以下阶段提供稳定契约：

1. `REFERENCE_INGEST`
2. `MULTIVIEW_IDENTITY_LOCK`
3. `PROVIDER_RECONSTRUCTION`
4. `SEMANTIC_REGION_CLASSIFICATION`
5. `CURVED_SURFACE_REFINEMENT`
6. `DETAIL_SURFACE_CONFORMANCE`
7. `TOPOLOGY_AND_PRINT_QA`
8. `VISUAL_SLICER_PHYSICAL_RELEASE_EVIDENCE`

输入是引用资产、供应商候选网格和目标制造尺寸。输出是可逆 Blender 源文件、
GLB、基础 STL、装配 STL、转台、轮廓报告、打印性报告和发布证据状态。
供应商网格永远只是候选，不允许直接标记为发布资产。

## 曲面修复方法

Meshy 候选的主要问题不是材质，而是一个网格同时混合了应平滑的有机壳体、
应保留的硬边、应分离的关节和应重建的品牌浮雕。全局平滑会把真实结构一起
磨圆；单纯保护所有高二面角又会保留原始折面。当前闭环采用：

- 删除低于面数阈值的游离微组件；
- 体素连续性重建，把主体收敛为一个连通水密体；
- 从供应商源网格提取高置信硬边样本，并映射到重建后的顶点保护区；
- 只对躯干和头盔有机壳体做区域曲率整平；
- 对旧胸前浮雕使用局部 `REBUILD` 掩码，不把错误浮雕继续当硬边保护；
- 用 BVH 射线把脸屏、头盔铭牌和胸章投射到局部曲面；
- 胸章使用小中央多边形加同心四边面环，消除三角扇中心极点和放射折线；
- 裁掉无有效投影的面，并保留向内的打印重叠；
- smooth shading 只用于展示，不作为曲面质量证据。

曾尝试的 Laplacian volume-preserve 在该封闭体素网格上输出与输入哈希一致，
没有形成实际位移，因此已改用可测量的邻域整平。这个诊断避免了“界面看似开了
平滑，几何实际没变”的假修复。

## v21 候选结果

候选目录：

`runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced`

自动检查结果：

- 流水线状态：`READY_FOR_VISUAL_AND_PHYSICAL_PROOF`
- 几何：`PASS_WITH_CONDITIONS`
- 轮廓：`PASS`
- 主体连通数：1
- 删除游离组件：7
- 顶点：482238
- 三角面：964480
- 水密：是
- 绕向一致：是
- 体积有效：是
- 边界边：0
- 非流形边：0
- 退化面：0
- 目标高度：180 mm
- 正面 IoU：0.868616
- 八视角平均 IoU：0.782131
- 最低视角 IoU：0.603016
- 曲面等级：`REFINED_PROTOTYPE`
- 原型曲面连续性：`PASS`
- 精细资产曲率：`HOLD`
- 硬边保留：`PASS`
- 语义分件：`HOLD`
- 有机区域二面角 P95：`6.905244°`
- 有机区域二面角 P99：`13.095311°`
- 有机区域大于 10° 的相邻面比例：`2.1539%`
- 硬边区域二面角 P90：`23.176606°`
- 硬边区域大于 10° 的相邻面比例：`28.9777%`

该结果证明曲面和拓扑闭环已经跑通，但不等于可直接投入最终生产。

## 发布闸门

下列证据缺一不可：

1. 视觉所有者确认角色比例、表情和品牌细节；
2. 切片器验证最小壁厚；
3. 切片器或专业工具验证自相交；
4. 支撑与悬垂预览；
5. 60 mm 实物样件；
6. 实物通过后才允许 180 mm 最终打印。

在这些证据完成前，领域评估必须返回 `HOLD`，不得虚报 `PASS`。

## 使用

```bash
pnpm modeling3d:validate
pnpm modeling3d:plan
pnpm modeling3d:surface-quality -- \
  --mesh runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced/huihui-printable-v3-base.stl \
  --source-mesh runtime/artifacts/media/huihui-printable-v3/meshy-plan/provider-candidate.glb \
  --feature-angle-degrees 60 \
  --output runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced/surface-quality-feature-aware-report.json
pnpm media:printable:status -- \
  --package runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced/printable-asset-package.json
```

领域契约位于
`packages/3d-modeling-domain/schemas/modeling-workflow.schema.json`，默认示例位于
`packages/3d-modeling-domain/examples/character-print-modeling.example.json`。

## 曲面质量闸门

`surface-quality` 不读取渲染法线，而是直接检查 STL 几何。提供供应商源网格后，
它先把源网格高置信硬边映射到候选模型，再分别执行：

- 有机连续性门槛：只检查远离真实硬边的壳体区域；
- 硬边保留门槛：确认帽檐、脸屏边界、耳罩和鞋底没有被磨平；
- 语义分件门槛：确认头、身、关节、名牌和材质边界有明确组合关系；
- 精细资产门槛：用于阻止仍存在可见折面或曲率跳变的模型晋级为母模。

v21 的有机区域通过原型连续性，硬边区域也通过保留门槛。这证明“分别测量”
比全局二面角阈值更符合角色模型实际。但精细资产门槛仍未通过，且供应商网格
仍是一个无语义材料分区的整体，语义分件必须保持 `HOLD`。

## 几何优先的权威自动化链条

角色母版不再由像素深度、单体生成网格或全局体素重建直接产生。参考图片负责
约束尺寸、比例和轮廓，程序几何与语义装配负责拓扑。唯一权威顺序如下：

1. 锁定正、侧、背和斜视参考、比例尺、材质表与品牌矢量；
2. 从多视图提取身高占比、最大宽深、关键轮廓点和部件连接点，不直接生成母网格；
3. 建立语义零件清单和局部坐标系：
   - 身体：椭球或超椭球；
   - 面罩：保留边界的圆角棱柱；
   - 头盔：穹顶、帽檐、顶筋和铭牌组合；
   - 耳罩：同轴圆柱组合；
   - 上下臂、腿：胶囊体或锥台；
   - 手套、鞋：可控组合几何；
   - 文字与标志：矢量挤出或程序浮雕；
4. 每个零件独立校准正、侧、背轮廓，分别声明
   `SMOOTH_ORGANIC / CONTROLLED_FILLET / PRESERVE`；
5. 使用受控重叠、榫卯或明确装配间隙连接零件，保留命名、材料和局部坐标；
6. 先输出 `SEMANTIC_PART_ASSEMBLY` 母版，禁止全局体素结果成为权威母版；
7. Meshy 文生 3D、单图或多图 3D 只作为隐藏视角、造型建议和视觉比较候选；
8. 同时运行轮廓、比例、硬边、语义分件、连接干涉、水密和最小特征闸门；
9. 视觉所有者确认后，才生成受控精确布尔制造副本；原始语义装配母版永久保留；
10. 制造副本进入切片器、60 mm 样件和 180 mm 正式件，实物结果回写参数。

对应机器契约：

- `packages/3d-modeling-domain/schemas/parametric-character-workflow.schema.json`
- `packages/3d-modeling-domain/examples/huihui-parametric-character.example.json`

可复现构建：

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  build-parametric-printable \
  --spec packages/3d-modeling-domain/examples/huihui-parametric-character.example.json \
  --output runtime/artifacts/media/huihui-printable-v3/parametric-v1-geometry-first \
  --weld-method assembly-only
```

该命令默认只生成语义装配母版。`voxel-preview` 仅可用于快速检查打印占位，
不得覆盖语义母版，也不得作为精细资产通过依据。

Blender 程序几何、KDTree、BVH 和 OpenSubdiv 足以生成可控的
`GEOMETRY_FIRST` 语义母版。Voxel Remesh 只保留为非权威打印预览。要稳定
得到精细母模，仍需要多视图参数标定和局部语义重拓扑：

- 开源自动路线：Blender QuadriFlow/手工修正 + crease；
- 更高自动化：Quad Remesher（商业授权）；
- 最高母模质量：ZBrush ZRemesher、Polygroups 和局部雕刻（商业授权且需要
  人工终审）。

Open3D 或 PyMeshLab 可以补充几何分析，但不能从单一无材质网格可靠推断
“哪个折角是设计、哪个折角是错误”。增加工具不能替代语义区域和人工终审。

## 后续增强

- 增加曲率与面密度热力图，将异常位置映射到语义区域；
- 对打印件执行自动最小壁厚和自相交分析；
- 建立手套、鞋底、脸屏、铭牌等语义区域掩码，避免只依赖高度范围；
- 支持分件榫卯、公差、排气孔和树脂空心化策略；
- 把视觉评审、切片器评审和实物样件结果写入统一发布证据。
