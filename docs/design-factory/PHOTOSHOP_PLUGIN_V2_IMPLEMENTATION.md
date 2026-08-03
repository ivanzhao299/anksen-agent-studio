# Photoshop Plugin V2 Implementation

## Objective

把现有单模板按钮面板升级为 Studio 治理下的 Photoshop 生产工作台。V2 不承担规划和调度，只负责检查当前 Photoshop 上下文、解释任务、预演白名单操作、执行人工确认的修改、完成预检并返回可追溯结果。

## Architecture boundary

```text
Studio Goal / Planner / Task Graph
  -> existing Scheduler and approval gates
  -> existing photoshop-uxp Runtime Adapter
  -> versioned Photoshop Job Contract
  -> UXP Workbench
  -> Operation DSL validator
  -> Photoshop DOM / guarded BatchPlay translators
  -> document inspection / review / export evidence
  -> existing Studio result and event boundary
```

禁止在插件中建立第二套任务状态机、队列、调度器或后台 Worker。插件只呈现 Studio 任务状态和当前交互执行状态。

## Implementation phases

### P0. Governance and capability loading

- 从最新已部署 `main` 开发。
- 保持 `photoshop-uxp` Adapter 默认禁用和 `max_parallel_tasks = 1`。
- 将 Taste Skill 与 Impeccable 作为固定提交、只读、不可信的设计能力资源注册到现有 Skill Router。
- Taste 仅用于展示型页面；Impeccable 用于插件和 Console 的 Operate 界面。

### P1. Job contract and Operation DSL

- 将任务协议升级为向后兼容的 schema v2。
- Agent 只能生成白名单 DSL，不能提交原始 BatchPlay。
- 每个操作包含 operationId、target、parameters、risk、idempotencyKey 和 expectedResult。V2 不接受单操作 timeout 字段：UXP 无法安全中断已经进入 Photoshop 主机的写入或保存调用，因此不能把事后计时冒充取消能力。
- 校验能力、风险、文件访问、写入审批和输出规格。

### P2. Document inspection

- 检查当前文档尺寸、分辨率、模式、配置文件和保存状态。
- 输出 Group、Pixel、Text、Shape、Smart Object、Adjustment 和 Mask 的统一 LayerNode。
- 明确 editable、supportedOperations、bounds、visibility、opacity 和文字摘要。

### P3. Production operations

- 文档：创建、检查、保存副本、导出、关闭。
- 图层：选择、重命名、显隐、移动、等比缩放、复制、建组。
- 内容：文字替换、文字颜色、智能对象置换、纯色层和非破坏性蒙版入口。
- 每次执行返回 before、after、duration、warning 和 rollbackHint。

### P4. Review and print preflight

- 检查尺寸、出血、安全区、分辨率、色彩模式、文字可编辑性、文字变形、图层命名、隐藏风险、输出格式和缺失资产。
- BLOCKER 阻止导出；HIGH 需要再次确认。
- 输出结构化 Review Report，不用虚构视觉评分代替真实检查。

### P5. Secure bridge

- 支持本地配对挑战、短期会话、请求签名、nonce、防重放、超时和取消。
- 默认 Manifest 无网络权限。
- 联网构建使用单独 ID 和明确 HTTPS 域名。
- 插件不持有 Studio Secret，不上传未授权文档。

### P6. UXP production workbench

- Overview：连接、任务、文档和阻塞状态。
- Layers：可搜索图层树和支持操作。
- Operations：预览影响、风险、审批和逐项结果。
- Review：预检问题、证据与修复建议。
- Export：保存副本、预览和交付清单。
- 完整覆盖 loading、empty、error、cancelled、blocked 和 completed 状态。

### P7. Result evidence and recovery

- 输出 artifact manifest、operation log、review report 和 checksum。
- 不覆盖原始文件；保存失败或用户取消时保持文档可编辑。
- 断线后可重新导入同一任务，使用 idempotencyKey 防止重复写入。

### P8. Acceptance

- Node 单元和安全测试。
- UXP 构建、CCX 打包和 Manifest 校验。
- Photoshop 实机：检查当前文档、执行至少三类白名单操作、保存 PSD 副本、导出 PNG、验证图层和操作报告。
- Studio Adapter 仍返回 `PROPOSAL_ONLY` 或 `READY_FOR_INTERACTIVE_CONFIRMATION`，不得出现自主执行状态。

## V2 acceptance result classes

- `VERIFIED_IN_PHOTOSHOP`：已在真实 Photoshop 主机执行并检查。
- `VERIFIED_OFFLINE`：协议、校验或纯数据能力已通过自动测试。
- `INTERFACE_ONLY`：接口已完成，但缺少真实主机或批准连接。
- `NOT_SUPPORTED`：当前版本明确不支持。

最终报告必须对每项能力使用以上分类，禁止把接口或 Mock 当作真实 Photoshop 结果。

## 2026-08-03 acceptance matrix

| Capability | Result | Evidence |
|---|---|---|
| UXP Manifest v5 load and reload | `VERIFIED_IN_PHOTOSHOP` | UXP Developer Tool 2.2.1 reports plugin `com.anksen.studio.photoshop` as `Loaded`; Photoshop 2026 v27.9 registers the plugin menu. |
| UXP workbench layout and accessibility | `VERIFIED_OFFLINE` | Static host rendering, roving keyboard semantics, layer-tree navigation, busy/error states, narrow-panel DOM checks and a scoped Impeccable detector run (`[]`). The static browser's `require is not defined` is expected outside UXP and was not treated as a plugin failure. |
| Versioned job contract and Operation DSL | `VERIFIED_OFFLINE` | Node tests cover whitelist, deterministic risk, idempotency, raw BatchPlay/script rejection, terminal output ordering and approval requirements. |
| Document inspection and technical preflight | `VERIFIED_OFFLINE` | Unit tests cover semantic layer trees, duplicate-name rejection, physical-to-pixel dimension derivation, requested-bleed blocking, editable capabilities, distorted-text blocking and report-bound HIGH confirmation whose hash includes complete evidence/fix metadata. |
| V2 operation execution and rollback | `VERIFIED_OFFLINE` | Executor tests cover `executeAsModal`, one history suspension, host cancellation, rollback and mandatory preflight before every output. Per-operation timeout is explicitly `NOT_SUPPORTED` and rejected fail-closed. V2 multi-operation execution has not been claimed as a live Studio round-trip. |
| Premium 640 × 1440 mm Photoshop production | `VERIFIED_IN_PHOTOSHOP` | Photoshop generated the final 3780 × 8504 CMYK PSD, 640 × 1440 mm PDF and 4K PNG in `/Users/mac/Documents/Jinhu-Science-Innovation-Park-Design-V2-Final`. |
| PSD and PNG binary acceptance | `VERIFIED_IN_PHOTOSHOP` | `verify-artifacts.mjs` passed PSD signature/dimensions and PNG signature/dimensions against the real outputs. |
| Print PDF render acceptance | `VERIFIED_IN_PHOTOSHOP` | Poppler reports one 1814.4 × 4081.92 pt page and the rendered page was visually compared with the final PNG. |
| CCX packaging | `VERIFIED_OFFLINE` | `package:ccx` produced and checked the Adobe UXP CCX container. |
| Studio secure bridge live connection | `INTERFACE_ONLY` | HMAC, payload hashing, expiry and persistent replay protection are tested; the default Manifest remains offline and no production Runtime was activated. |
| Autonomous Photoshop execution | `NOT_SUPPORTED` | Human confirmation remains mandatory; Adapter activation stops at interactive confirmation. |

## Final visual review

The first real Photoshop run exposed malformed Chinese caused by ExtendScript source encoding. That output was rejected and overwritten. The accepted run uses Unicode escapes for all visible Chinese copy, keeps text horizontal and vertical scale at 100%, uses no decorative horizontal rules, and keeps the smallest visible copy at 42 pt. The final artwork passed PNG and PDF visual comparison; printer-specific ICC soft proofing remains an external press requirement.
