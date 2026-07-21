# Pilot-001 · Enterprise Business Pilot

## 结论

Studio 现有业务对象、Autonomous Kernel、Scheduler、Resident Business Runner 和专业规则 Runner 现在可以消费受治理的权威来源数据。试点不建立第二套 ERP 数据模型，不调用真实 Codex，不连接生产业务数据库。

## 执行链

`隔离来源 → Business Data Connector → Sync Batch → 现有 Business Application Record → Domain Workflow → Autonomous Kernel → Scheduler → Resident Runner → CONTROLLED_STUB → Professional Outcome → Cockpit / My Work`

五条验收链分别覆盖：

- 财务：费用审核与预算控制建议；
- HR：入职行政准备与人工决策证据检查；
- 制造：生产工单、BOM、SOP 与库存证据检查；
- 智慧园区：服务工单 SLA 与完工证据检查；
- 增长销售：产品、内容、渠道账号与发布就绪检查。

专业结果允许 `PASS`、`REVIEW_REQUIRED` 或 `BLOCKED`。证据不足时必须阻塞，不能用任务执行成功冒充业务结论。

## 数据治理

- Connector 绑定 Organization、Workspace、业务应用和允许写入的对象类型；
- API、SQL、Webhook 与文件来源只保存 Credential Reference；
- 每次同步保存幂等键、观察时间、来源游标、证据哈希与载荷哈希；
- 同一来源记录只允许更新自身映射的业务对象，旧观察时间不能覆盖新数据；
- 批次在写入前完整校验，任一记录无效则整批失败，不产生部分业务记录；
- UI 与 API 不返回 Credential Reference 的真实标识，也不保存 Secret 值；
- 所有专业执行继续使用现有 Task、Attempt、Lease、Fencing 和 Morning Report。

## 操作入口

- 页面：`/outcomes` 的“权威业务数据连接器”；
- API：`GET/POST /api/business/data-connectors`；
- API：`GET /api/business/data-connectors/:id/batches`；
- API：`POST /api/business/data-connectors/:id/ingest`；
- 隔离验收：`pnpm enterprise-business:pilot`。

`enterprise-business:pilot` 必须使用隔离 PostgreSQL。CLI 会拒绝缺少 PostgreSQL 的环境；生产业务数据库、真实 Codex、发布、付款、录用、生产放行和园区现场调度均不在该命令授权范围内。

## 调度可靠性修复

试点发现历史 `BLOCKED` 任务可能占满 Scheduler 扫描窗口并饿死新任务。Scheduler 现在优先处理 `READY`、`PENDING`，且只重新检查依赖已全部成功的 `BLOCKED` 任务。不可恢复的历史阻塞不会持续占用扫描窗口。

## 下一步真实接入

1. 为每个业务系统建立只读服务账号和 Credential Reference；
2. 完成字段映射、数据责任人和数据保留期限审批；
3. 先以只读增量同步运行至少一个业务周期；
4. 对账通过后才允许业务负责人批准专业工作流；
5. 真实外部写回、付款、录用、发布和设备控制继续保持关闭，分别建立独立 Activation Gate。
