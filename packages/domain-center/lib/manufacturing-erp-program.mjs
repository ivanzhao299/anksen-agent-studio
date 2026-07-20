const task = (taskKey, title, domainId, description, { dependsOn = [], riskLevel = "HIGH" } = {}) => ({
  taskKey, title, description, priority: "P0", riskLevel, maxAttempts: 1,
  requiredCapabilities: ["manufacturing_erp_development"],
  metadata: { applicationId: "intelligent-manufacturing-erp", domainId, executionRuntime: "CODEX", activationGateRequired: true, controlledStubCompletionForbidden: true },
  dependsOn
});

export const manufacturingErpProgramTasks = Object.freeze([
  task("ME-000", "建立制造 ERP 边界、内控与验收基线", "program-governance", "定义公司、工厂、产品、订单、库存、生产、质量、成本和跨平台集成边界。", { riskLevel: "MEDIUM" }),
  task("ME-010", "建设制造主数据与编码版本", "manufacturing-master-data", "建立物料、产品、单位、批次、工厂、车间、产线、工作中心、仓库和库位主数据。", { dependsOn: ["ME-000"] }),
  task("ME-020", "建设产品工程、BOM 与工程变更", "product-engineering-bom", "建立 EBOM、MBOM、替代料、损耗、版本、生效日期、签审和工程变更。", { dependsOn: ["ME-010"] }),
  task("ME-030", "建设工艺路线、工序与 SOP", "process-routing-sop", "建立工艺路线、标准工时、参数、工装、检验点、作业指导书和受控版本。", { dependsOn: ["ME-020"] }),
  task("ME-040", "建设工业客户 CRM 与销售订单", "manufacturing-sales-crm", "接收增长销售平台线索并管理询价、报价、样品、合同、订单、交期承诺和变更。", { dependsOn: ["ME-010"] }),
  task("ME-050", "建设 S&OP、需求预测与主计划", "sales-operations-planning", "平衡预测、订单、产能、库存和供应约束，形成滚动产销计划和主生产计划。", { dependsOn: ["ME-020", "ME-040"] }),
  task("ME-060", "建设 MRP、采购与供应商协同", "mrp-procurement", "运行净需求并形成采购申请、采购订单、到货计划、供应商协同和绩效。", { dependsOn: ["ME-020", "ME-050"] }),
  task("ME-070", "建设生产计划、有限排程与齐套", "production-planning", "建立生产订单、产能日历、有限排程、齐套检查、派工和计划变更。", { dependsOn: ["ME-030", "ME-050", "ME-060"] }),
  task("ME-080", "建设 WMS 收发存与内部物流", "wms-logistics", "贯通收货、质检待定、上架、库位、批次、序列号、发料、退料、完工入库、拣配、盘点和发运。", { dependsOn: ["ME-060"], riskLevel: "CRITICAL" }),
  task("ME-090", "建设 MES 车间执行与报工", "mes-shop-floor", "贯通派工、开工、领料、报工、产出、不良、停机、在制品、完工和班组绩效。", { dependsOn: ["ME-030", "ME-070", "ME-080"], riskLevel: "CRITICAL" }),
  task("ME-100", "建设 QMS 全过程质量闭环", "quality-management", "覆盖来料、过程、成品检验，不合格、偏差、CAPA、放行和质量证据。", { dependsOn: ["ME-030", "ME-080", "ME-090"], riskLevel: "CRITICAL" }),
  task("ME-110", "建设设备、点检、保养与维修", "equipment-maintenance", "管理设备台账、点检、预防保养、故障维修、备件、OEE 和停机损失。", { dependsOn: ["ME-010", "ME-090"] }),
  task("ME-120", "建设制造成本与集团财务接口", "manufacturing-costing", "核算材料、人工、制造费用、在制品、完工和差异，并形成受控集团财务凭证。", { dependsOn: ["ME-080", "ME-090", "ME-100"], riskLevel: "CRITICAL" }),
  task("ME-130", "建设订单、批次与序列号全链追溯", "manufacturing-traceability-cockpit", "从供应批次贯通生产用料、工艺参数、质量结果、成品、客户订单和售后召回。", { dependsOn: ["ME-080", "ME-090", "ME-100", "ME-120"] }),
  task("ME-140", "建设制造经营驾驶舱", "manufacturing-traceability-cockpit", "展示订单交付、计划达成、产能、OEE、质量、库存周转、采购交付和制造成本。", { dependsOn: ["ME-050", "ME-070", "ME-100", "ME-110", "ME-120", "ME-130"] }),
  task("ME-150", "完成端到端验收与分阶段发布", "program-governance", "验证订单到交付、BOM 变更、批次追溯、库存并发、质量放行、成本结转、权限、审计和恢复。", { dependsOn: ["ME-130", "ME-140"], riskLevel: "CRITICAL" })
]);

export function compileManufacturingErpProgram({ goalId = "intelligent-manufacturing-erp-v1", title = "打造智能制造 ERP 平台" } = {}) {
  const tasks = manufacturingErpProgramTasks.map(({ dependsOn: _dependsOn, ...item }) => ({ ...item, description: `${item.description}\nProgram Goal: ${title}`, metadata: { ...item.metadata, programGoalId: goalId } }));
  const dependencies = manufacturingErpProgramTasks.flatMap((item) => item.dependsOn.map((dependsOnTaskKey) => ({ taskKey: item.taskKey, dependsOnTaskKey, dependencyType: "SUCCESS_REQUIRED", requiredStatus: "SUCCEEDED" })));
  return { schemaVersion: 1, programId: goalId, title, applicationId: "intelligent-manufacturing-erp", runtimePolicy: { requiredRuntime: "CODEX", controlledStubCompletionForbidden: true, activationGateRequired: true, productionIntegrationRequiresApproval: true }, tasks, dependencies };
}
