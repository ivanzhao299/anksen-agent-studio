# 长任务：统一 AI 业务驾驶舱 MVP

## 目标

为集团八个独立平台建立统一前台视觉入口，以经营视角展示平台布局、长期目标、执行进展、阻塞状态和业务结果，并继续使用现有 Autonomous Kernel，不创建第二套任务或进度模型。

## 任务分解

| 任务 | 交付结果 | 状态 |
| --- | --- | --- |
| PC-001 | 确认八个平台边界和统一驾驶舱信息架构 | 完成 |
| PC-002 | 增加 Kernel 平台进展聚合查询 | 完成 |
| PC-003 | 增加 Portfolio Dashboard API | 完成 |
| PC-004 | 建设首页八平台卡片、状态和进度视图 | 完成 |
| PC-005 | 建立业务结果真实性规则和空状态 | 完成 |
| PC-006 | 完成响应式样式、测试、构建和本地上线 | 完成 |

## 数据真实性

- 平台列表和业务域来自 `business-application-registry`。
- 长期目标及任务状态来自 PostgreSQL Autonomous Kernel 的 `ad_goal` 和 `ad_task`。
- 每个平台只展示最新的带 `applicationId` Goal。
- 完成进度只统计真实 `SUCCEEDED` Task。
- 没有业务数据连接器时显示 `AWAITING_SOURCE/业务结果待接入`，不生成模拟营收、客户、订单或生产指标。
- 技术执行状态与业务结果分开呈现，任务完成不能自动等同于业务增长或经营成功。

## 验收结果

- 首页展示 8 个独立平台。
- 页面运行时通过 `/api/portfolio/dashboard` 读取 Kernel 数据。
- Smart Park、AI Growth & Sales 和 Manufacturing ERP 的持久化计划可以显示真实任务总量和状态。
- 未启动的平台显示“尚未启动”。
- Kernel 不可用时页面保留平台结构并明确提示，不猜测数据。
- 桌面端采用四列平台矩阵，中等宽度两列，移动端单列。
- 定向测试、typecheck、build 和 `git diff --check` 通过。

## 下一步

业务结果层需要逐个平台接入可信数据源：增长销售接 CRM/渠道/交易，制造 ERP 接订单/MES/WMS/QMS，智慧园区接资产/招商/工单/IoT。接入前继续显示空状态。
