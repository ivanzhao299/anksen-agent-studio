const task = (taskKey, title, domainId, description, { dependsOn = [], riskLevel = "MEDIUM", priority = "P0" } = {}) => ({
  taskKey, title, description, priority, riskLevel, maxAttempts: 1,
  requiredCapabilities: ["ai_growth_sales_development"],
  metadata: { applicationId: "ai-growth-sales-platform", domainId, executionRuntime: "CODEX", activationGateRequired: true, controlledStubCompletionForbidden: true },
  dependsOn
});

export const aiGrowthSalesProgramTasks = Object.freeze([
  task("GS-000", "建立增长销售产品边界、合规和 KPI 基线", "program-governance", "确定产品、Campaign、客户、同意、渠道、商机、交易和售后边界，定义经营结果指标。", { riskLevel: "HIGH" }),
  task("GS-010", "建设 Product Profile 与 Campaign 内核", "product-offer-center", "建立多产品接入、事实证据、价格权益、受众、品牌规则、渠道范围、目标和版本模型。", { dependsOn: ["GS-000"] }),
  task("GS-020", "接通内容生成、视频工厂与资产库", "content-generation", "生成文案、脚本、图文和视频矩阵，并保持来源、版本、审核和跨渠道派生关系。", { dependsOn: ["GS-010"] }),
  task("GS-030", "建设渠道账号与凭据审批治理", "channel-account-governance", "建立账号申请、实名人工步骤、Credential Reference、权限、健康度、平台政策和动作审批。", { dependsOn: ["GS-000"], riskLevel: "CRITICAL" }),
  task("GS-040", "建设智能发布、排期与矩阵归因", "publishing-distribution", "按渠道规则完成审批、排期、发布、失败恢复、链接追踪和内容矩阵归因。", { dependsOn: ["GS-020", "GS-030"], riskLevel: "HIGH" }),
  task("GS-050", "建设合法线索获取、去重与评分", "lead-intelligence", "记录线索来源、客户同意、实体解析、去重、补全、评分、分群和数据保留策略。", { dependsOn: ["GS-040"], riskLevel: "CRITICAL" }),
  task("GS-060", "建设客户触达、智能应答与人工接管", "customer-engagement", "实现频控、安静时段、退订、需求识别、知识答复、预约和低置信度人工升级。", { dependsOn: ["GS-050"], riskLevel: "CRITICAL" }),
  task("GS-070", "建设 CRM 客户、商机、报价与转化", "sales-conversion", "形成客户、联系人、商机、活动、方案、报价、审批、预测和成交闭环。", { dependsOn: ["GS-060"], riskLevel: "HIGH" }),
  task("GS-080", "建设交易系统幂等交接与回流", "transaction-handoff", "将确认后的客户、商品、价格、合同和订单意向交接到外部交易系统并接收结果。", { dependsOn: ["GS-070"], riskLevel: "CRITICAL" }),
  task("GS-090", "建设售后机器人与客户成功闭环", "customer-success-service", "接通知识库、机器人客服、工单、售后、满意度、续费、增购和人工接管。", { dependsOn: ["GS-080"], riskLevel: "HIGH" }),
  task("GS-100", "建设增长销售经营驾驶舱", "growth-sales-cockpit", "聚合产品、内容、发布、账号、线索、会话、商机、交易、售后和 ROI，提供可钻取业务结果。", { dependsOn: ["GS-040", "GS-050", "GS-060", "GS-070", "GS-080"] }),
  task("GS-110", "完成端到端验收与分阶段发布", "program-governance", "完成权限、隐私、平台规则、频控、审批、幂等、失败恢复、人工接管和业务指标验收。", { dependsOn: ["GS-090", "GS-100"], riskLevel: "CRITICAL" })
]);

export function compileAiGrowthSalesProgram({ goalId = "ai-growth-sales-platform-v1", title = "打造 AI 增长与销售平台" } = {}) {
  const tasks = aiGrowthSalesProgramTasks.map(({ dependsOn: _dependsOn, ...item }) => ({ ...item, description: `${item.description}\nProgram Goal: ${title}`, metadata: { ...item.metadata, programGoalId: goalId } }));
  const dependencies = aiGrowthSalesProgramTasks.flatMap((item) => item.dependsOn.map((dependsOnTaskKey) => ({ taskKey: item.taskKey, dependsOnTaskKey, dependencyType: "SUCCESS_REQUIRED", requiredStatus: "SUCCEEDED" })));
  return { schemaVersion: 1, programId: goalId, title, applicationId: "ai-growth-sales-platform", runtimePolicy: { requiredRuntime: "CODEX", controlledStubCompletionForbidden: true, activationGateRequired: true, externalActionsRequireApproval: true, allowCredentialValues: false }, tasks, dependencies };
}
