# Pilot-002 · Smart Park Read-only Work Order Source

## 当前结论

Smart Park 已确认存在正式只读接口 `GET /work-orders`，Studio 侧已完成生产级适配器、字段合同、数据责任人审批、增量游标与对账检查点。当前尚未配置 Smart Park 专用只读服务账号和 Credential Reference，因此真实来源状态必须保持 `NOT_READY`，不得将本地 HTTP 验收数据称为生产数据。

## 数据合同

来源字段只映射到现有 `smart-park-platform/service_order`：工单 ID、工单编号、标题、类型、状态、优先级、位置、受理时间、SLA、责任班组、处理结果和完成时间。报修人姓名、手机号、附件原值、访问 Token 不进入 Studio 数据库、日志、Task、Outbox 或报告。

来源状态映射遵守 Studio 的合法业务生命周期。完成证据只保存来源引用 `smart-park-work-order:<id>:finish`，不复制附件或声称已验证附件内容。

## 激活 Gate

同步前必须全部满足：

1. Connector 为 ACTIVE；
2. 来源类型不是 FIXTURE；
3. 数据库只保存 Credential Reference；
4. 数据责任人本人批准字段映射版本；
5. 受控凭据文件可解析；
6. 来源仅允许 HTTPS（本机验收可使用 loopback HTTP）；
7. 只执行 GET，禁止重定向；
8. 响应体、分页和超时在策略上限内。

## 命令

- `pnpm smart-park-source:readiness`：只检查数据库 Gate，不读取凭据值；
- `pnpm smart-park-source:sync`：Gate 通过后解析 Reference 并执行一次只读增量同步。

运行时需提供 `BUSINESS_SOURCE_CONNECTOR_ID`、Organization 和 Workspace。凭据文件位于受限目录，文件权限必须为 `0600`，内容仅在进程内解析，命令输出不返回 Token。

## 完成真实激活所需的人工事项

1. Smart Park 管理员创建仅具备 `workorder:read` 的专用服务身份；
2. 确认其 Tenant/Park 数据范围；
3. 运维将 HTTPS API Origin 和 Token 写入权限为 `0600` 的 Reference 文件；
4. 园区数据责任人在 Studio 批准 `smart-park-work-order-v1`；
5. 首次同步后核对来源数量、映射数量、拒绝数量与 reconciliation hash；
6. 对账通过后才允许专业 Runner 使用同步工单生成 Morning Report。
