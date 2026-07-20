const field = (key, label, type = "text", options = {}) => Object.freeze({ key, label, type, required: false, ...options });

const definition = (value) => Object.freeze({
  initialStatus: "DRAFT",
  agentReviewStatus: "WAITING_APPROVAL",
  editableStatuses: Object.freeze(value.editableStatuses ?? ["DRAFT"]),
  fields: Object.freeze(value.fields ?? []),
  transitions: Object.freeze(value.transitions),
  ...value
});

const definitions = Object.freeze({
  "enterprise-strategy-platform": Object.freeze({
    objective: definition({
      label: "战略目标",
      workflowDomainId: "strategy-execution",
      fields: [
        field("period", "战略周期", "text", { required: true, placeholder: "2027-2029" }),
        field("perspective", "战略主题", "select", { required: true, options: ["增长", "运营", "客户", "组织能力"] }),
        field("targetValue", "目标值", "number", { required: true }),
        field("unit", "计量单位", "text", { required: true }),
        field("responsibleCenter", "责任中心", "text", { required: true })
      ],
      transitions: { DRAFT: ["ACTIVE"], ACTIVE: ["AT_RISK", "WAITING_REVIEW", "COMPLETED"], AT_RISK: ["ACTIVE", "WAITING_REVIEW"], WAITING_REVIEW: ["ACTIVE", "COMPLETED"] },
      agentReviewStatus: "WAITING_REVIEW",
      workflowGoal: (record) => `分析战略目标“${record.title}”，建立指标、责任分解和复盘建议。`
    }),
    kpi: definition({
      label: "关键指标",
      workflowDomainId: "strategy-execution",
      fields: [field("period", "考核周期", "text", { required: true }), field("baseline", "基准值", "number", { required: true }), field("targetValue", "目标值", "number", { required: true }), field("actualValue", "当前值", "number", { required: true }), field("direction", "指标方向", "select", { required: true, options: ["越高越好", "越低越好"] }), field("unit", "单位", "text", { required: true }), field("ownerDepartment", "责任部门", "text", { required: true }), field("actualAsOf", "数据截止日", "date", { required: true }), field("actualEvidenceRef", "实际值证据编号", "text", { required: true })],
      transitions: { DRAFT: ["ACTIVE"], ACTIVE: ["AT_RISK", "WAITING_REVIEW", "COMPLETED"], AT_RISK: ["ACTIVE", "WAITING_REVIEW"], WAITING_REVIEW: ["ACTIVE", "COMPLETED"] },
      agentReviewStatus: "WAITING_REVIEW",
      workflowGoal: (record) => `分析关键指标“${record.title}”的目标差距、趋势和纠偏行动。`
    }),
    initiative: definition({
      label: "战略举措", workflowDomainId: "strategy-execution",
      fields: [field("objectiveCode", "关联目标", "text", { required: true }), field("ownerCenter", "责任中心", "text", { required: true }), field("startDate", "开始日期", "date", { required: true }), field("dueDate", "完成日期", "date", { required: true }), field("milestone", "关键里程碑", "textarea", { required: true }), field("progressPercent", "当前进度(%)", "number", { required: true, min: 0, max: 100 }), field("progressAsOf", "进度截止日", "date", { required: true }), field("progressEvidenceRef", "进度证据编号", "text", { required: true })],
      transitions: { DRAFT: ["ACTIVE"], ACTIVE: ["AT_RISK", "WAITING_REVIEW", "COMPLETED"], AT_RISK: ["ACTIVE", "WAITING_REVIEW"], WAITING_REVIEW: ["ACTIVE", "COMPLETED"] }, agentReviewStatus: "WAITING_REVIEW",
      workflowGoal: (record) => `分析战略举措“${record.title}”的责任、里程碑、依赖和执行风险。`
    }),
    strategy_review: definition({
      label: "经营复盘", workflowDomainId: "strategy-execution",
      fields: [field("period", "复盘周期", "text", { required: true }), field("scope", "复盘范围", "text", { required: true }), field("reviewDate", "复盘日期", "date", { required: true }), field("evidenceCutoffDate", "证据截止日", "date", { required: true }), field("actualResult", "实际结果", "textarea", { required: true }), field("varianceReason", "偏差原因", "textarea", { required: true })],
      transitions: { DRAFT: ["ANALYZING"], ANALYZING: ["WAITING_REVIEW", "BLOCKED"], WAITING_REVIEW: ["COMPLETED", "ANALYZING"] }, agentReviewStatus: "WAITING_REVIEW",
      workflowGoal: (record) => `对经营复盘“${record.title}”分析目标偏差、原因、经验和后续纠偏动作。`
    }),
    corrective_action: definition({
      label: "纠偏动作", workflowDomainId: "strategy-execution",
      fields: [field("actionCode", "动作编号", "text", { required: true }), field("ownerCenter", "责任中心", "text", { required: true }), field("dueDate", "完成期限", "date", { required: true }), field("actionDescription", "纠偏措施", "textarea", { required: true }), field("expectedImpact", "预期影响", "textarea", { required: true }), field("evidenceRequirement", "验收证据要求", "textarea", { required: true })],
      transitions: { DRAFT: ["ACTIVE"], ACTIVE: ["AT_RISK", "WAITING_REVIEW", "COMPLETED"], AT_RISK: ["ACTIVE", "WAITING_REVIEW"], WAITING_REVIEW: ["ACTIVE", "COMPLETED"] }, agentReviewStatus: "WAITING_REVIEW",
      workflowGoal: (record) => `检查纠偏动作“${record.title}”的责任、期限、预期影响和验收证据，不自动修改经营指标。`
    })
  }),
  "human-resources-platform": Object.freeze({
    recruitment_case: definition({
      label: "招聘需求",
      workflowDomainId: "human-resources",
      fields: [field("department", "用人部门", "text", { required: true }), field("positionName", "招聘岗位", "text", { required: true }), field("headcount", "招聘人数", "number", { required: true, min: 1 }), field("targetDate", "期望到岗日", "date", { required: true }), field("employmentType", "用工类型", "select", { required: true, options: ["全职", "兼职", "实习", "外包"] }), field("reason", "招聘原因", "textarea", { required: true })],
      transitions: { DRAFT: ["OPEN"], OPEN: ["SCREENING", "CANCELLED"], SCREENING: ["INTERVIEWING", "BLOCKED"], INTERVIEWING: ["OFFER", "BLOCKED"], OFFER: ["WAITING_APPROVAL", "CANCELLED"], WAITING_APPROVAL: ["COMPLETED", "OFFER"] },
      workflowGoal: (record) => `审核招聘需求“${record.title}”，生成岗位画像、筛选标准、面试流程和合规检查。`
    }),
    onboarding_case: definition({
      label: "入职流程",
      workflowDomainId: "human-resources",
      fields: [field("employeeName", "员工姓名", "text", { required: true }), field("candidateRef", "候选人引用编号", "text", { required: true }), field("department", "所属部门", "text", { required: true }), field("positionName", "岗位", "text", { required: true }), field("employmentType", "用工类型", "select", { required: true, options: ["全职", "兼职", "实习", "外包"] }), field("startDate", "入职日期", "date", { required: true }), field("manager", "直属经理", "text", { required: true }), field("identityVerificationRef", "身份核验记录编号", "text", { required: true }), field("contractDocumentRef", "受控合同文件编号", "text", { required: true }), field("equipmentRequestRef", "设备申请编号", "text", { required: true }), field("accessProfileRef", "最小权限模板编号", "text", { required: true })],
      transitions: { DRAFT: ["PREPARING"], PREPARING: ["WAITING_APPROVAL", "BLOCKED"], WAITING_APPROVAL: ["READY", "PREPARING"], READY: ["COMPLETED"] },
      workflowGoal: (record) => `检查“${record.title}”入职准备事项、权限最小化和首周任务安排。`
    }),
    candidate_application: definition({
      label: "候选申请", workflowDomainId: "human-resources",
      fields: [field("candidateRef", "候选人引用编号", "text", { required: true }), field("positionName", "申请岗位", "text", { required: true }), field("source", "候选来源", "select", { required: true, options: ["官网", "招聘平台", "内推", "猎头", "校招", "其他"] }), field("consentStatus", "个人信息授权", "select", { required: true, options: ["已授权", "待确认", "已撤回"] }), field("privacyNoticeVersion", "隐私告知版本", "text", { required: true }), field("humanSelectionDecisionRef", "人工选择决定编号", "text", { required: true })],
      transitions: { DRAFT: ["SCREENING"], SCREENING: ["INTERVIEWING", "REJECTED"], INTERVIEWING: ["WAITING_APPROVAL", "REJECTED"], WAITING_APPROVAL: ["SELECTED", "INTERVIEWING"], SELECTED: ["ARCHIVED"], REJECTED: ["ARCHIVED"] },
      workflowGoal: (record) => `检查候选申请“${record.title}”的个人信息授权、人工评审证据和流程完整性，不执行自动录用决策。`
    }),
    employment_offer: definition({
      label: "录用通知", workflowDomainId: "human-resources",
      fields: [field("candidateRef", "候选人引用编号", "text", { required: true }), field("department", "录用部门", "text", { required: true }), field("positionName", "录用岗位", "text", { required: true }), field("employmentType", "用工类型", "select", { required: true, options: ["全职", "兼职", "实习", "外包"] }), field("proposedStartDate", "拟入职日期", "date", { required: true }), field("offerDocumentRef", "受控录用文件编号", "text", { required: true })],
      transitions: { DRAFT: ["REVIEWING"], REVIEWING: ["WAITING_APPROVAL", "DRAFT"], WAITING_APPROVAL: ["APPROVED", "REVIEWING"], APPROVED: ["ACCEPTED", "DECLINED"], ACCEPTED: ["ONBOARDING_STARTED"] },
      workflowGoal: (record) => `检查录用通知“${record.title}”的岗位、用工类型、入职日期和受控文件，不自动发送或接受录用。`
    }),
    employee: definition({
      label: "员工", workflowDomainId: "human-resources",
      fields: [field("employeeNo", "员工编号", "text", { required: true }), field("department", "部门", "text", { required: true }), field("positionName", "岗位", "text", { required: true }), field("hireDate", "入职日期", "date", { required: true }), field("employmentType", "用工类型", "select", { required: true, options: ["全职", "兼职", "实习", "外包"] })],
      transitions: { DRAFT: ["WAITING_APPROVAL"], WAITING_APPROVAL: ["ACTIVE", "DRAFT"], ACTIVE: ["ON_LEAVE", "TERMINATED"], ON_LEAVE: ["ACTIVE", "TERMINATED"] },
      workflowGoal: (record) => `检查员工记录“${record.title}”的组织归属、岗位、用工类型和入职资料完整性。`
    }),
    position: definition({
      label: "岗位", workflowDomainId: "human-resources",
      fields: [field("positionCode", "岗位编码", "text", { required: true }), field("positionName", "岗位名称", "text", { required: true }), field("department", "所属部门", "text", { required: true }), field("jobFamily", "职族", "text", { required: true }), field("grade", "职级", "text", { required: true }), field("headcount", "编制人数", "number", { required: true, min: 0 })],
      transitions: { DRAFT: ["REVIEWING"], REVIEWING: ["WAITING_APPROVAL", "DRAFT"], WAITING_APPROVAL: ["ACTIVE", "DRAFT"], ACTIVE: ["INACTIVE"] },
      workflowGoal: (record) => `分析岗位“${record.title}”的职责、能力要求、职级和编制合理性。`
    })
  }),
  "finance-platform": Object.freeze({
    expense: definition({
      label: "费用单",
      workflowDomainId: "finance-management",
      fields: [field("expenseDate", "费用日期", "date", { required: true }), field("department", "费用部门", "text", { required: true }), field("category", "费用类别", "select", { required: true, options: ["差旅", "采购", "招待", "办公", "其他"] }), field("amount", "含税金额", "number", { required: true, min: 0.01 }), field("currency", "币种", "select", { required: true, options: ["CNY", "USD", "EUR"] }), field("budgetCode", "预算科目", "text", { required: true }), field("description", "费用说明", "textarea", { required: true })],
      transitions: { DRAFT: ["SUBMITTED"], SUBMITTED: ["UNDER_REVIEW", "REJECTED"], UNDER_REVIEW: ["WAITING_APPROVAL", "REJECTED", "BLOCKED"], WAITING_APPROVAL: ["APPROVED", "REJECTED"], APPROVED: ["PAID"], REJECTED: ["DRAFT"] },
      workflowGoal: (record) => `审核费用单“${record.title}”，核对预算科目、金额合理性并形成审批建议。`
    }),
    budget: definition({
      label: "预算",
      workflowDomainId: "finance-management",
      fields: [field("fiscalYear", "预算年度", "number", { required: true }), field("department", "责任部门", "text", { required: true }), field("budgetCode", "预算科目", "text", { required: true }), field("amount", "预算金额", "number", { required: true, min: 0 }), field("currency", "币种", "select", { required: true, options: ["CNY", "USD", "EUR"] })],
      transitions: { DRAFT: ["SUBMITTED"], SUBMITTED: ["WAITING_APPROVAL", "REJECTED"], WAITING_APPROVAL: ["APPROVED", "REJECTED"], APPROVED: ["ACTIVE"], ACTIVE: ["COMPLETED"] },
      workflowGoal: (record) => `分析预算“${record.title}”的历史基准、资源配置和风险，形成审批建议。`
    }),
    receivable: definition({
      label: "应收", workflowDomainId: "finance-management",
      fields: [field("customerName", "客户", "text", { required: true }), field("invoiceNo", "发票/账单号", "text", { required: true }), field("amount", "应收金额", "number", { required: true, min: 0.01 }), field("currency", "币种", "select", { required: true, options: ["CNY", "USD", "EUR"] }), field("dueDate", "到期日", "date", { required: true })],
      transitions: { DRAFT: ["OPEN"], OPEN: ["WAITING_APPROVAL", "OVERDUE", "SETTLED"], OVERDUE: ["WAITING_APPROVAL", "SETTLED"], WAITING_APPROVAL: ["OPEN", "ESCALATED"], ESCALATED: ["SETTLED", "WRITTEN_OFF"] },
      workflowGoal: (record) => `分析应收“${record.title}”的账龄、逾期风险、回款计划和异常处置建议。`
    }),
    payable: definition({
      label: "应付", workflowDomainId: "finance-management",
      fields: [field("supplierName", "供应商", "text", { required: true }), field("invoiceNo", "发票号", "text", { required: true }), field("amount", "应付金额", "number", { required: true, min: 0.01 }), field("currency", "币种", "select", { required: true, options: ["CNY", "USD", "EUR"] }), field("dueDate", "付款到期日", "date", { required: true })],
      transitions: { DRAFT: ["MATCHING"], MATCHING: ["WAITING_APPROVAL", "BLOCKED"], WAITING_APPROVAL: ["APPROVED", "MATCHING"], APPROVED: ["PAID"] },
      workflowGoal: (record) => `审核应付“${record.title}”的合同、订单、收货与发票匹配及付款风险。`
    })
  }),
  "ai-growth-sales-platform": Object.freeze({
    lead: definition({
      label: "销售线索", workflowDomainId: "lead-intelligence",
      fields: [field("source", "线索来源", "select", { required: true, options: ["官网", "内容平台", "活动", "转介绍", "人工录入"] }), field("contactName", "联系人", "text", { required: true }), field("company", "客户企业", "text"), field("contactChannel", "联系方式", "text", { required: true }), field("consentStatus", "联系授权", "select", { required: true, options: ["已授权", "待确认", "已拒绝"] }), field("interest", "关注产品", "text", { required: true })],
      transitions: { DRAFT: ["NEW"], NEW: ["QUALIFYING", "DISQUALIFIED"], QUALIFYING: ["WAITING_APPROVAL", "NURTURING", "DISQUALIFIED"], WAITING_APPROVAL: ["QUALIFIED", "NURTURING"], QUALIFIED: ["CONVERTED"], NURTURING: ["QUALIFYING", "DISQUALIFIED"] },
      workflowGoal: (record) => `对线索“${record.title}”执行去重、授权检查、画像补全和评分，形成跟进建议。`
    }),
    product: definition({
      label: "产品", workflowDomainId: "product-offer-center",
      fields: [field("productCode", "产品编码", "text", { required: true }), field("category", "产品分类", "text", { required: true }), field("targetAudience", "目标客户", "text", { required: true }), field("price", "参考价格", "number", { required: true, min: 0 }), field("evidence", "事实依据", "textarea", { required: true })],
      transitions: { DRAFT: ["REVIEWING"], REVIEWING: ["WAITING_APPROVAL", "DRAFT"], WAITING_APPROVAL: ["ACTIVE", "DRAFT"], ACTIVE: ["ARCHIVED"] },
      workflowGoal: (record) => `基于产品“${record.title}”的真实资料提炼受众、卖点、证据边界和营销素材 Brief。`
    }),
    campaign: definition({
      label: "营销活动", workflowDomainId: "content-generation",
      fields: [field("productCode", "关联产品", "text", { required: true }), field("channel", "主要渠道", "select", { required: true, options: ["官网", "微信", "抖音", "视频号", "小红书", "线下活动"] }), field("startDate", "开始日期", "date", { required: true }), field("endDate", "结束日期", "date", { required: true }), field("budget", "活动预算", "number", { required: true, min: 0 }), field("conversionGoal", "转化目标", "text", { required: true })],
      transitions: { DRAFT: ["PLANNING"], PLANNING: ["WAITING_APPROVAL", "BLOCKED"], WAITING_APPROVAL: ["SCHEDULED", "PLANNING"], SCHEDULED: ["RUNNING", "CANCELLED"], RUNNING: ["COMPLETED", "PAUSED"], PAUSED: ["RUNNING", "CANCELLED"] },
      workflowGoal: (record) => `为营销活动“${record.title}”生成内容策略、渠道素材计划、合规检查和转化衡量方案。`
    }),
    content_asset: definition({
      label: "内容资产", workflowDomainId: "content-generation",
      fields: [field("productCode", "产品编码", "text", { required: true }), field("assetType", "资产类型", "select", { required: true, options: ["产品文案", "图片", "短视频", "长视频", "落地页"] }), field("channel", "适用渠道", "select", { required: true, options: ["官网", "微信", "抖音", "视频号", "小红书", "线下活动"] }), field("language", "语言", "select", { required: true, options: ["zh-CN", "en-US"] }), field("claimEvidenceRef", "产品主张证据编号", "text", { required: true }), field("rightsClearanceRef", "版权与肖像授权编号", "text", { required: true }), field("contentHash", "定稿内容哈希", "text", { required: true })],
      transitions: { DRAFT: ["GENERATING"], GENERATING: ["REVIEWING", "BLOCKED"], REVIEWING: ["WAITING_APPROVAL", "GENERATING"], WAITING_APPROVAL: ["APPROVED", "REVIEWING"], APPROVED: ["ARCHIVED"] },
      workflowGoal: (record) => `检查内容资产“${record.title}”的产品事实、渠道规格、版权授权和定稿版本，不自动发布。`
    }),
    channel_account: definition({
      label: "渠道账号", workflowDomainId: "channel-account-governance",
      fields: [field("platform", "渠道平台", "select", { required: true, options: ["官网", "微信", "抖音", "视频号", "小红书"] }), field("accountRef", "账号引用编号", "text", { required: true }), field("ownerOrganization", "账号所属主体", "text", { required: true }), field("credentialReferenceId", "凭据引用编号", "text", { required: true, referenceOnly: true }), field("authorizationExpiresAt", "授权到期日", "date", { required: true }), field("publishingScope", "允许发布范围", "textarea", { required: true })],
      transitions: { DRAFT: ["VERIFYING"], VERIFYING: ["WAITING_APPROVAL", "BLOCKED"], WAITING_APPROVAL: ["ACTIVE", "VERIFYING"], ACTIVE: ["SUSPENDED", "EXPIRED"], SUSPENDED: ["VERIFYING"] },
      workflowGoal: (record) => `校验渠道账号“${record.title}”的主体、Credential Reference、授权期限和发布范围，不读取凭据值。`
    }),
    publish_plan: definition({
      label: "发布计划", workflowDomainId: "publishing-distribution",
      fields: [field("campaignRef", "Campaign 编号", "text", { required: true }), field("productCode", "产品编码", "text", { required: true }), field("channel", "发布渠道", "select", { required: true, options: ["官网", "微信", "抖音", "视频号", "小红书", "线下活动"] }), field("accountRef", "渠道账号引用", "text", { required: true }), field("scheduledAt", "计划发布时间", "date", { required: true }), field("expectedAssetCount", "计划资产数", "number", { required: true, min: 1 }), field("publishMode", "发布模式", "select", { required: true, options: ["仅人工发布", "人工确认后自动发布"] })],
      transitions: { DRAFT: ["PLANNING"], PLANNING: ["WAITING_APPROVAL", "BLOCKED"], WAITING_APPROVAL: ["APPROVED", "PLANNING"], APPROVED: ["SCHEDULED", "CANCELLED"], SCHEDULED: ["COMPLETED", "CANCELLED"] },
      workflowGoal: (record) => `检查发布计划“${record.title}”的 Campaign、产品事实、内容资产、渠道账号与审批边界，不执行发布。`
    }),
    customer: definition({
      label: "客户", workflowDomainId: "customer-engagement",
      fields: [field("customerType", "客户类型", "select", { required: true, options: ["企业", "个人"] }), field("industry", "行业", "text"), field("owner", "客户经理", "text", { required: true }), field("contactPreference", "联系偏好", "select", { required: true, options: ["电话", "微信", "邮件", "仅人工联系"] }), field("consentStatus", "联系授权", "select", { required: true, options: ["已授权", "待确认", "已拒绝"] })],
      transitions: { DRAFT: ["ACTIVE"], ACTIVE: ["WAITING_APPROVAL", "DORMANT"], WAITING_APPROVAL: ["ACTIVE", "ESCALATED"], ESCALATED: ["ACTIVE"], DORMANT: ["ACTIVE", "ARCHIVED"] },
      workflowGoal: (record) => `分析客户“${record.title}”的需求、联系授权和服务历史，生成受控答复与下一步建议。`
    }),
    opportunity: definition({
      label: "商机", workflowDomainId: "sales-conversion",
      fields: [field("customerName", "客户", "text", { required: true }), field("productCode", "意向产品", "text", { required: true }), field("estimatedAmount", "预计金额", "number", { required: true, min: 0 }), field("probability", "赢单概率(%)", "number", { required: true, min: 0, max: 100 }), field("expectedCloseDate", "预计成交日", "date", { required: true }), field("owner", "销售负责人", "text", { required: true })],
      transitions: { DRAFT: ["DISCOVERY"], DISCOVERY: ["PROPOSAL", "LOST"], PROPOSAL: ["WAITING_APPROVAL", "DISCOVERY", "LOST"], WAITING_APPROVAL: ["NEGOTIATION", "PROPOSAL"], NEGOTIATION: ["WON", "LOST"], WON: ["HANDED_OFF"] },
      workflowGoal: (record) => `分析商机“${record.title}”的需求匹配、赢单概率、报价风险和成交行动计划。`
    })
  }),
  "intelligent-manufacturing-erp": Object.freeze({
    work_order: definition({
      label: "生产工单", workflowDomainId: "production-planning",
      fields: [field("productCode", "产品编码", "text", { required: true }), field("quantity", "计划数量", "number", { required: true, min: 1 }), field("unit", "单位", "text", { required: true }), field("dueDate", "计划完工日", "date", { required: true }), field("plant", "生产工厂", "text", { required: true }), field("priority", "优先级", "select", { required: true, options: ["普通", "紧急", "关键"] })],
      transitions: { DRAFT: ["PLANNED"], PLANNED: ["MATERIAL_CHECK", "CANCELLED"], MATERIAL_CHECK: ["WAITING_APPROVAL", "SHORTAGE", "READY"], SHORTAGE: ["MATERIAL_CHECK", "BLOCKED"], WAITING_APPROVAL: ["READY", "PLANNED"], READY: ["RELEASED"], RELEASED: ["IN_PRODUCTION"], IN_PRODUCTION: ["COMPLETED", "BLOCKED"] },
      workflowGoal: (record) => `检查生产工单“${record.title}”的产能、物料齐套、交期和排程风险，形成放行建议。`
    }),
    material: definition({
      label: "物料", workflowDomainId: "manufacturing-master-data",
      fields: [field("materialCode", "物料编码", "text", { required: true }), field("materialType", "物料类型", "select", { required: true, options: ["原材料", "半成品", "成品", "辅料"] }), field("unit", "基本单位", "text", { required: true }), field("leadTimeDays", "提前期(天)", "number", { required: true, min: 0 }), field("lotControlled", "批次管理", "select", { required: true, options: ["是", "否"] })],
      transitions: { DRAFT: ["REVIEWING"], REVIEWING: ["WAITING_APPROVAL", "DRAFT"], WAITING_APPROVAL: ["ACTIVE", "DRAFT"], ACTIVE: ["INACTIVE"] },
      workflowGoal: (record) => `校验物料“${record.title}”的编码、单位、提前期、批次策略和主数据完整性。`
    }),
    bom: definition({
      label: "BOM", workflowDomainId: "product-engineering-bom",
      fields: [field("productCode", "产品编码", "text", { required: true }), field("revision", "版本", "text", { required: true }), field("plant", "适用工厂", "text", { required: true }), field("effectiveDate", "生效日期", "date", { required: true }), field("componentCount", "组件数量", "number", { required: true, min: 1 }), field("componentRequirements", "组件需求（物料编码:单台用量）", "textarea", { required: true })],
      transitions: { DRAFT: ["ENGINEERING_REVIEW"], ENGINEERING_REVIEW: ["WAITING_APPROVAL", "DRAFT"], WAITING_APPROVAL: ["RELEASED", "DRAFT"], RELEASED: ["OBSOLETE"] },
      workflowGoal: (record) => `校验 BOM“${record.title}”的结构、版本、替代料和生效边界，形成工程放行建议。`
    }),
    routing_sop: definition({
      label: "工艺路线与 SOP", workflowDomainId: "process-routing-sop",
      fields: [field("productCode", "产品编码", "text", { required: true }), field("revision", "版本", "text", { required: true }), field("plant", "适用工厂", "text", { required: true }), field("effectiveDate", "生效日期", "date", { required: true }), field("operationCount", "工序数量", "number", { required: true, min: 1 }), field("controlledDocumentRef", "受控作业指导书编号", "text", { required: true })],
      transitions: { DRAFT: ["PROCESS_REVIEW"], PROCESS_REVIEW: ["WAITING_APPROVAL", "DRAFT"], WAITING_APPROVAL: ["RELEASED", "DRAFT"], RELEASED: ["OBSOLETE"] },
      workflowGoal: (record) => `校验工艺路线与 SOP“${record.title}”的工序、版本、生效边界和受控作业指导书。`
    }),
    inventory: definition({
      label: "库存", workflowDomainId: "wms-logistics",
      fields: [field("materialCode", "物料编码", "text", { required: true }), field("warehouse", "仓库", "text", { required: true }), field("location", "库位", "text", { required: true }), field("batch", "批次", "text"), field("quantity", "账面数量", "number", { required: true, min: 0 }), field("unit", "单位", "text", { required: true })],
      transitions: { DRAFT: ["COUNTING"], COUNTING: ["WAITING_APPROVAL", "MATCHED"], WAITING_APPROVAL: ["ADJUSTED", "COUNTING"], MATCHED: ["COMPLETED"], ADJUSTED: ["COMPLETED"] },
      workflowGoal: (record) => `分析库存记录“${record.title}”的批次、库位、账实差异和补货风险。`
    }),
    quality_case: definition({
      label: "质量事件", workflowDomainId: "quality-management",
      fields: [field("productCode", "产品/物料", "text", { required: true }), field("batch", "批次", "text", { required: true }), field("severity", "严重度", "select", { required: true, options: ["一般", "重大", "关键"] }), field("detectedAt", "发现日期", "date", { required: true }), field("defect", "缺陷描述", "textarea", { required: true })],
      transitions: { DRAFT: ["OPEN"], OPEN: ["CONTAINMENT", "BLOCKED"], CONTAINMENT: ["ROOT_CAUSE"], ROOT_CAUSE: ["WAITING_APPROVAL", "CONTAINMENT"], WAITING_APPROVAL: ["CAPA", "ROOT_CAUSE"], CAPA: ["VERIFICATION"], VERIFICATION: ["COMPLETED", "CAPA"] },
      workflowGoal: (record) => `分析质量事件“${record.title}”的遏制措施、根因、CAPA 和批次影响范围。`
    })
  }),
  "smart-park-platform": Object.freeze({
    service_order: definition({
      label: "园区工单", workflowDomainId: "tenant-service-workflow",
      editableStatuses: ["DRAFT", "OPEN", "DISPATCHED", "IN_PROGRESS"],
      fields: [field("enterpriseName", "服务企业", "text", { required: true }), field("serviceType", "服务类型", "select", { required: true, options: ["报修", "企业服务", "投诉", "安全", "其他"] }), field("location", "发生位置", "text", { required: true }), field("requestedAt", "受理时间", "datetime-local", { required: true }), field("slaHours", "SLA(小时)", "number", { required: true, min: 1 }), field("priority", "优先级", "select", { required: true, options: ["一般", "紧急", "关键"] }), field("assignedTeam", "责任班组", "text", { required: true }), field("description", "问题描述", "textarea", { required: true }), field("resolutionSummary", "处理结果", "textarea"), field("completionEvidenceRef", "完工证据编号", "text"), field("resolvedAt", "完成时间", "datetime-local")],
      transitions: { DRAFT: ["OPEN"], OPEN: ["DISPATCHED", "CANCELLED"], DISPATCHED: ["IN_PROGRESS", "BLOCKED"], IN_PROGRESS: ["WAITING_APPROVAL", "BLOCKED"], WAITING_APPROVAL: ["RESOLVED", "IN_PROGRESS"], RESOLVED: ["COMPLETED", "REOPENED"], REOPENED: ["DISPATCHED"] },
      workflowGoal: (record) => `分析园区工单“${record.title}”的优先级、SLA、责任班组和处理方案。`
    }),
    enterprise: definition({
      label: "入园企业", workflowDomainId: "investment-leasing",
      fields: [field("creditCode", "统一社会信用代码", "text", { required: true }), field("industry", "所属行业", "text", { required: true }), field("contactName", "联系人", "text", { required: true }), field("contactPhone", "联系电话", "text", { required: true }), field("requestedArea", "需求面积(㎡)", "number", { required: true, min: 0 })],
      transitions: { DRAFT: ["PROSPECT"], PROSPECT: ["QUALIFYING", "DISQUALIFIED"], QUALIFYING: ["WAITING_APPROVAL", "PROSPECT"], WAITING_APPROVAL: ["ADMITTED", "QUALIFYING"], ADMITTED: ["ACTIVE"], ACTIVE: ["EXITED"] },
      workflowGoal: (record) => `分析入园企业“${record.title}”的产业匹配、空间需求、准入资料和招商推进建议。`
    }),
    space: definition({
      label: "园区空间", workflowDomainId: "asset-space",
      fields: [field("building", "楼栋", "text", { required: true }), field("floor", "楼层", "text", { required: true }), field("room", "房间", "text", { required: true }), field("area", "面积(㎡)", "number", { required: true, min: 0 }), field("usage", "用途", "select", { required: true, options: ["办公", "厂房", "仓储", "商业", "配套"] })],
      transitions: { DRAFT: ["AVAILABLE"], AVAILABLE: ["WAITING_APPROVAL", "MAINTENANCE"], WAITING_APPROVAL: ["RESERVED", "AVAILABLE"], RESERVED: ["OCCUPIED", "AVAILABLE"], OCCUPIED: ["AVAILABLE", "MAINTENANCE"], MAINTENANCE: ["AVAILABLE"] },
      workflowGoal: (record) => `分析园区空间“${record.title}”的用途匹配、可租状态、面积和维护风险。`
    }),
    lease_contract: definition({
      label: "租赁合同", workflowDomainId: "investment-leasing",
      fields: [field("enterpriseName", "承租企业", "text", { required: true }), field("spaceCode", "空间编号", "text", { required: true }), field("startDate", "起租日期", "date", { required: true }), field("endDate", "到期日期", "date", { required: true }), field("monthlyRent", "月租金", "number", { required: true, min: 0 }), field("deposit", "押金", "number", { required: true, min: 0 })],
      transitions: { DRAFT: ["REVIEWING"], REVIEWING: ["WAITING_APPROVAL", "DRAFT"], WAITING_APPROVAL: ["SIGNED", "DRAFT"], SIGNED: ["ACTIVE"], ACTIVE: ["EXPIRING", "TERMINATED"], EXPIRING: ["RENEWED", "TERMINATED"], RENEWED: ["ACTIVE"] },
      workflowGoal: (record) => `审核租赁合同“${record.title}”的租期、租金、押金、空间占用和到期风险。`
    }),
    meter: definition({
      label: "能源表计", workflowDomainId: "energy-management",
      fields: [field("meterCode", "表计编号", "text", { required: true }), field("energyType", "能源类型", "select", { required: true, options: ["电", "水", "燃气", "热力"] }), field("location", "安装位置", "text", { required: true }), field("tenant", "计费对象", "text", { required: true }), field("multiplier", "计量倍率", "number", { required: true, min: 0.001 })],
      transitions: { DRAFT: ["VERIFYING"], VERIFYING: ["WAITING_APPROVAL", "FAULT"], WAITING_APPROVAL: ["ACTIVE", "VERIFYING"], ACTIVE: ["FAULT", "INACTIVE"], FAULT: ["VERIFYING", "INACTIVE"] },
      workflowGoal: (record) => `检查能源表计“${record.title}”的计费对象、倍率、读数质量和异常风险。`
    })
  })
});

const fallback = (objectType) => definition({
  label: objectType,
  fields: [field("description", "业务说明", "textarea")],
  transitions: { DRAFT: ["OPEN"], OPEN: ["IN_PROGRESS", "WAITING_APPROVAL", "COMPLETED"], IN_PROGRESS: ["WAITING_APPROVAL", "BLOCKED", "COMPLETED"], WAITING_APPROVAL: ["IN_PROGRESS", "COMPLETED"], BLOCKED: ["IN_PROGRESS", "CANCELLED"] },
  workflowGoal: (record) => `处理业务事项“${record.title}”并形成可审核结果。`
});

export function getBusinessObjectDefinition(applicationId, objectType) {
  return definitions[applicationId]?.[objectType] ?? fallback(objectType);
}

export function validateBusinessObjectFields(applicationId, objectType, input = {}) {
  const schema = getBusinessObjectDefinition(applicationId, objectType);
  const fields = {};
  for (const item of schema.fields) {
    let value = input[item.key];
    if (typeof value === "string") value = value.trim();
    if (item.required && (value === undefined || value === null || value === "")) throw Object.assign(new Error(`BUSINESS_FIELD_REQUIRED:${item.key}`), { code: "BUSINESS_FIELD_REQUIRED", field: item.key });
    if (value === undefined || value === null || value === "") continue;
    if (item.type === "number") {
      value = Number(value);
      if (!Number.isFinite(value) || (item.min !== undefined && value < item.min) || (item.max !== undefined && value > item.max)) throw Object.assign(new Error(`BUSINESS_FIELD_INVALID:${item.key}`), { code: "BUSINESS_FIELD_INVALID", field: item.key });
    }
    if (item.options && !item.options.includes(value)) throw Object.assign(new Error(`BUSINESS_FIELD_INVALID:${item.key}`), { code: "BUSINESS_FIELD_INVALID", field: item.key });
    if (item.referenceOnly && (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/.test(value) || /(?:^sk-|bearer|password\s*=|token\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i.test(value))) throw Object.assign(new Error(`BUSINESS_CREDENTIAL_REFERENCE_INVALID:${item.key}`), { code: "BUSINESS_CREDENTIAL_REFERENCE_INVALID", field: item.key });
    fields[item.key] = value;
  }
  return fields;
}

export function availableBusinessTransitions(applicationId, objectType, status) {
  return [...(getBusinessObjectDefinition(applicationId, objectType).transitions[status] ?? [])];
}

export function businessRecordEditable(applicationId, objectType, status) {
  return getBusinessObjectDefinition(applicationId, objectType).editableStatuses.includes(status);
}

export function businessWorkflowGoal(applicationId, record) {
  return getBusinessObjectDefinition(applicationId, record.objectType).workflowGoal(record);
}
