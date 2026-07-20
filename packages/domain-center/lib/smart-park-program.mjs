const task = (taskKey, title, domainId, phase, description, { priority = "P1", riskLevel = "MEDIUM", dependsOn = [] } = {}) => ({
  taskKey,
  title,
  description,
  priority,
  riskLevel,
  maxAttempts: 1,
  requiredCapabilities: ["smart_park_development"],
  metadata: {
    applicationId: "smart-park-erp",
    domainId,
    phase,
    executionRuntime: "CODEX",
    activationGateRequired: true,
    controlledStubCompletionForbidden: true,
    repository: "jinhu-smart-park"
  },
  dependsOn
});

export const smartParkProgramTasks = Object.freeze([
  task("SP-000", "建立全域现状基线与验收矩阵", "program-governance", "FOUNDATION", "逐域核对页面、API、数据表、权限、测试和生产证据；文档声明不得计为完成。", { priority: "P0", riskLevel: "LOW" }),
  task("SP-010", "收口组织、权限、主数据与 SaaS 治理底座", "platform-governance", "FOUNDATION", "统一组织、用户、角色、数据权限、字段策略、字典、编码、租户、模块授权、文件和审计。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-000"] }),
  task("SP-020", "建立智慧园区统一业务与数据契约", "program-governance", "FOUNDATION", "确定跨域实体、事件、状态、附件、幂等和审计契约，消除兼容页与重复模型。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-010"] }),

  task("SP-100", "建设企业战略执行闭环", "strategy-execution", "CORE_ERP", "实现战略地图、年度目标、指标、重点任务、责任分解、进度复盘和经营会议闭环。", { priority: "P0", dependsOn: ["SP-020"] }),
  task("SP-110", "建设人力资源管理闭环", "human-resources", "CORE_ERP", "实现组织岗位、员工档案、招聘入转调离、绩效、人才盘点与合规审计。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-020"] }),
  task("SP-120", "完善财务管理闭环", "finance-management", "CORE_ERP", "统一预算、应收、收款、核销、发票、减免、退款、能源账单和经营分析，保留金融写入保护。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-020"] }),
  task("SP-130", "完善资产空间与企业主数据", "asset-space", "CORE_OPERATIONS", "完善园区、楼栋、楼层、房源、企业、空间关系、状态板、质量检查和跨域 360 视图。", { priority: "P0", dependsOn: ["SP-020"] }),
  task("SP-140", "完善招商 CRM、合同与租赁生命周期", "investment-leasing", "CORE_OPERATIONS", "贯通线索、公海、漏斗、报价、合同、变更、退租、房源占用和到期预警。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-120", "SP-130"] }),
  task("SP-150", "完善租户服务、工单、SLA 与流程协同", "tenant-service-workflow", "CORE_OPERATIONS", "贯通租户报事、流程收件箱、指派、处理、附件、逾期、评价和统计。", { priority: "P0", dependsOn: ["SP-110", "SP-130"] }),
  task("SP-160", "完善安全、巡检、隐患、应急与作业许可", "safety-management", "CORE_OPERATIONS", "形成巡检计划到任务、隐患整改、应急预案与事件、作业许可的生产闭环。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-110", "SP-130", "SP-150"] }),
  task("SP-170", "完善工程项目全生命周期", "engineering-management", "CORE_OPERATIONS", "贯通工程项目、计划、日报、巡检、整改、验收、附件、权限和移动终端。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-110", "SP-120", "SP-130", "SP-150"] }),

  task("SP-180", "完善 IoT 设备接入与规则联动", "iot-platform", "INTELLIGENT_OPERATIONS", "完善网关、设备、协议、指标、告警、规则、场景、指令和跨域动作执行。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-020", "SP-130", "SP-150"] }),
  task("SP-190", "完善能耗监测、分摊与账单", "energy-management", "INTELLIGENT_OPERATIONS", "贯通计量表、读数、告警、账期、账单、红冲、公共能耗分摊与财务入账。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-120", "SP-130", "SP-180"] }),
  task("SP-200", "完善视频安防与事件证据链", "video-security", "INTELLIGENT_OPERATIONS", "完善平台配置、摄像头、预览、告警、截图、事件证据和安全联动。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-130", "SP-160", "SP-180"] }),
  task("SP-210", "完善机器人运营与任务闭环", "robot-operations", "INTELLIGENT_OPERATIONS", "完善机器人接入、状态、任务、轨迹、异常、清洁运营以及工单和 IoT 联动。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-130", "SP-150", "SP-180"] }),
  task("SP-220", "完善 BIM 数字孪生运营界面", "digital-twin", "INTELLIGENT_OPERATIONS", "把空间、设备、能耗、视频、机器人、告警和工单叠加到统一数字孪生场景。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-130", "SP-180", "SP-190", "SP-200", "SP-210"] }),
  task("SP-230", "完善 AI 园区运营助手", "ai-operations", "INTELLIGENT_OPERATIONS", "基于授权业务数据提供查询、分析、建议和受控动作，不绕过 RBAC、审批与审计。", { priority: "P1", riskLevel: "HIGH", dependsOn: ["SP-100", "SP-110", "SP-120", "SP-150", "SP-160", "SP-170", "SP-180", "SP-190"] }),
  task("SP-240", "建设董事长与经营驾驶舱", "executive-cockpit", "MANAGEMENT", "聚合战略、组织、财务、招商、资产、服务、安全、工程、能耗和设备指标，统一指标口径与钻取。", { priority: "P0", dependsOn: ["SP-100", "SP-110", "SP-120", "SP-140", "SP-150", "SP-160", "SP-170", "SP-190"] }),
  task("SP-250", "完成全域集成回归与角色验收", "program-governance", "ACCEPTANCE", "验证菜单、路由、权限、数据范围、状态机、幂等、审计、跨域链路、移动端和降级策略。", { priority: "P0", riskLevel: "HIGH", dependsOn: ["SP-140", "SP-160", "SP-170", "SP-200", "SP-210", "SP-220", "SP-230", "SP-240"] }),
  task("SP-260", "完成生产准备与分阶段发布", "program-governance", "RELEASE", "完成迁移演练、备份恢复、性能安全检查、UAT、发布门禁、回滚方案和运营交接。", { priority: "P0", riskLevel: "CRITICAL", dependsOn: ["SP-250"] })
]);

export function compileSmartParkProgram({ goalId = "smart-park-completion", title = "全面完善智慧园区 ERP" } = {}) {
  const tasks = smartParkProgramTasks.map(({ dependsOn: _dependsOn, ...item }) => ({
    ...item,
    description: `${item.description}\nProgram Goal: ${title}`,
    metadata: { ...item.metadata, programGoalId: goalId }
  }));
  const dependencies = smartParkProgramTasks.flatMap((item) => item.dependsOn.map((dependsOnTaskKey) => ({
    taskKey: item.taskKey,
    dependsOnTaskKey,
    dependencyType: "SUCCESS_REQUIRED",
    requiredStatus: "SUCCEEDED"
  })));
  return {
    schemaVersion: 1,
    programId: goalId,
    title,
    applicationId: "smart-park-erp",
    runtimePolicy: {
      requiredRuntime: "CODEX",
      controlledStubCompletionForbidden: true,
      activationGateRequired: true,
      allowPush: false,
      allowMerge: false,
      allowDeploy: false
    },
    tasks,
    dependencies,
    phases: ["FOUNDATION", "CORE_ERP", "CORE_OPERATIONS", "INTELLIGENT_OPERATIONS", "MANAGEMENT", "ACCEPTANCE", "RELEASE"]
  };
}
