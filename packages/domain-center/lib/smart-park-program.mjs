const task = (taskKey, title, domainId, phase, description, { priority = "P1", riskLevel = "MEDIUM", dependsOn = [] } = {}) => ({
  taskKey, title, description, priority, riskLevel, maxAttempts: 1,
  requiredCapabilities: ["smart_park_development"],
  metadata: {
    applicationId: "smart-park-platform", domainId, phase,
    executionRuntime: "CODEX", activationGateRequired: true,
    controlledStubCompletionForbidden: true, repository: "jinhu-smart-park"
  },
  dependsOn
});

export const smartParkProgramTasks = Object.freeze([
  task("SP-000", "建立智慧园区现状基线与验收矩阵", "program-governance", "FOUNDATION", "逐域核对页面、API、数据表、权限、测试和运行证据；集团战略、人力、财务不计入园区缺失能力。", { priority: "P0", riskLevel: "LOW" }),
  task("SP-010", "收口园区治理、权限与主数据边界", "platform-governance", "FOUNDATION", "明确园区组织视图、用户授权、数据权限、字典、编码、租户、文件和审计边界，不复制集团 HR 主数据。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-000"] }),
  task("SP-020", "建立园区统一业务、数据与事件契约", "program-governance", "FOUNDATION", "确定园区跨域实体、事件、状态、附件、幂等和审计契约，消除兼容页与重复模型。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-010"] }),
  task("SP-030", "建立集团战略 KPI 集成契约", "group-strategy-integration", "GROUP_INTEGRATION", "定义园区经营指标、目标下达、实际值回传和钻取引用；战略目标仍由集团战略平台拥有。", { priority: "P0", dependsOn: ["SP-020"] }),
  task("SP-040", "建立集团人力组织人员集成契约", "group-hr-integration", "GROUP_INTEGRATION", "定义组织、人员、岗位、任职和身份同步边界；员工生命周期仍由集团人力平台拥有。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-020"] }),
  task("SP-050", "建立集团财务结算凭证集成契约", "group-finance-integration", "GROUP_INTEGRATION", "定义园区应收来源、收款结果、结算凭证、对账和差错回执；总账与集团核算仍由集团财务平台拥有。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-020"] }),
  task("SP-130", "完善资产空间与入驻企业主数据", "asset-space", "CORE_OPERATIONS", "完善园区、楼栋、楼层、房源、入驻企业、空间关系、状态板、质量检查和跨域 360 视图。", { priority: "P0", dependsOn: ["SP-020"] }),
  task("SP-140", "完善招商 CRM、合同与租赁生命周期", "investment-leasing", "CORE_OPERATIONS", "贯通线索、公海、漏斗、报价、合同、变更、退租、房源占用和到期预警。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-040", "SP-130"] }),
  task("SP-145", "完善园区应收、收款、发票与结算", "park-settlement-billing", "CORE_OPERATIONS", "完善租赁和服务应收、收款、核销、发票、减免、退款及对账，并通过受控接口向集团财务传递凭证。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-050", "SP-140"] }),
  task("SP-150", "完善企业服务、工单、SLA 与流程协同", "tenant-service-workflow", "CORE_OPERATIONS", "贯通企业报事、流程收件箱、指派、处理、附件、逾期、评价和统计。", { priority: "P0", dependsOn: ["SP-040", "SP-130"] }),
  task("SP-160", "完善园区安全、巡检、隐患与应急", "safety-management", "CORE_OPERATIONS", "形成巡检计划到任务、隐患整改、应急预案与事件、作业许可的生产闭环。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-040", "SP-130", "SP-150"] }),
  task("SP-170", "完善园区工程项目全生命周期", "engineering-management", "CORE_OPERATIONS", "贯通工程项目、计划、日报、巡检、整改、验收、附件、权限和移动终端。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-040", "SP-130", "SP-145", "SP-150"] }),
  task("SP-180", "完善园区 IoT 设备接入与规则联动", "iot-platform", "INTELLIGENT_OPERATIONS", "完善网关、设备、协议、指标、告警、规则、场景、指令和跨域动作执行。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-020", "SP-130", "SP-150"] }),
  task("SP-190", "完善能耗监测、分摊与园区账单", "energy-management", "INTELLIGENT_OPERATIONS", "贯通计量表、读数、告警、账期、账单、红冲、公共能耗分摊和集团财务凭证接口。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-050", "SP-130", "SP-145", "SP-180"] }),
  task("SP-200", "完善视频安防与事件证据链", "video-security", "INTELLIGENT_OPERATIONS", "完善平台配置、摄像头、预览、告警、截图、事件证据和安全联动。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-130", "SP-160", "SP-180"] }),
  task("SP-210", "完善机器人运营与任务闭环", "robot-operations", "INTELLIGENT_OPERATIONS", "完善机器人接入、状态、任务、轨迹、异常、清洁运营以及工单和 IoT 联动。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-130", "SP-150", "SP-180"] }),
  task("SP-220", "完善 BIM 数字孪生运营界面", "digital-twin", "INTELLIGENT_OPERATIONS", "把空间、设备、能耗、视频、机器人、告警和工单叠加到统一数字孪生场景。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-130", "SP-180", "SP-190", "SP-200", "SP-210"] }),
  task("SP-230", "完善 AI 园区运营助手", "ai-park-operations", "INTELLIGENT_OPERATIONS", "基于园区授权数据提供查询、分析、建议和受控动作，不绕过 RBAC、审批与审计。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-030", "SP-040", "SP-050", "SP-140", "SP-145", "SP-150", "SP-160", "SP-170", "SP-180", "SP-190"] }),
  task("SP-240", "建设园区经营驾驶舱", "park-cockpit", "MANAGEMENT", "聚合园区资产、招商、服务、安全、工程、能耗和设备指标，并向集团战略平台提供业务板块指标。", { priority: "P0", dependsOn: ["SP-030", "SP-140", "SP-145", "SP-150", "SP-160", "SP-170", "SP-190"] }),
  task("SP-250", "完成园区全域与集团接口验收", "program-governance", "ACCEPTANCE", "验证菜单、权限、数据范围、状态机、幂等、审计、园区跨域链路、集团接口、移动端和降级策略。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-030", "SP-040", "SP-050", "SP-140", "SP-145", "SP-160", "SP-170", "SP-200", "SP-210", "SP-220", "SP-230", "SP-240"] }),
  task("SP-260", "完成生产准备与分阶段发布", "program-governance", "RELEASE", "完成迁移演练、备份恢复、性能安全检查、UAT、发布门禁、回滚方案和运营交接。", { priority: "P0", riskLevel: "CRITICAL", dependsOn: ["SP-250"] })
]);

export function compileSmartParkProgram({ goalId = "smart-park-completion-v2", title = "全面完善智慧园区业务平台" } = {}) {
  const tasks = smartParkProgramTasks.map(({ dependsOn: _dependsOn, ...item }) => ({ ...item, description: `${item.description}\nProgram Goal: ${title}`, metadata: { ...item.metadata, programGoalId: goalId } }));
  const dependencies = smartParkProgramTasks.flatMap((item) => item.dependsOn.map((dependsOnTaskKey) => ({ taskKey: item.taskKey, dependsOnTaskKey, dependencyType: "SUCCESS_REQUIRED", requiredStatus: "SUCCEEDED" })));
  return {
    schemaVersion: 2, programId: goalId, title, applicationId: "smart-park-platform",
    runtimePolicy: { requiredRuntime: "CODEX", controlledStubCompletionForbidden: true, activationGateRequired: true, allowPush: false, allowMerge: false, allowDeploy: false },
    tasks, dependencies,
    phases: ["FOUNDATION", "GROUP_INTEGRATION", "CORE_OPERATIONS", "INTELLIGENT_OPERATIONS", "MANAGEMENT", "ACCEPTANCE", "RELEASE"]
  };
}
