const field = (key, label, type = "text", options = {}) => Object.freeze({ key, label, type, required: false, ...options });

const definition = (value) => Object.freeze({
  initialStatus: "DRAFT",
  agentReviewStatus: "WAITING_APPROVAL",
  fields: Object.freeze(value.fields ?? []),
  transitions: Object.freeze(value.transitions),
  ...value
});

const definitions = Object.freeze({
  "enterprise-strategy-platform": Object.freeze({
    objective: definition({
      label: "战略目标",
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
      fields: [field("period", "考核周期", "text", { required: true }), field("baseline", "基准值", "number", { required: true }), field("targetValue", "目标值", "number", { required: true }), field("actualValue", "当前值", "number"), field("unit", "单位", "text", { required: true }), field("ownerDepartment", "责任部门", "text", { required: true })],
      transitions: { DRAFT: ["ACTIVE"], ACTIVE: ["AT_RISK", "WAITING_REVIEW", "COMPLETED"], AT_RISK: ["ACTIVE", "WAITING_REVIEW"], WAITING_REVIEW: ["ACTIVE", "COMPLETED"] },
      agentReviewStatus: "WAITING_REVIEW",
      workflowGoal: (record) => `分析关键指标“${record.title}”的目标差距、趋势和纠偏行动。`
    })
  }),
  "human-resources-platform": Object.freeze({
    recruitment_case: definition({
      label: "招聘需求",
      fields: [field("department", "用人部门", "text", { required: true }), field("positionName", "招聘岗位", "text", { required: true }), field("headcount", "招聘人数", "number", { required: true, min: 1 }), field("targetDate", "期望到岗日", "date", { required: true }), field("employmentType", "用工类型", "select", { required: true, options: ["全职", "兼职", "实习", "外包"] }), field("reason", "招聘原因", "textarea", { required: true })],
      transitions: { DRAFT: ["OPEN"], OPEN: ["SCREENING", "CANCELLED"], SCREENING: ["INTERVIEWING", "BLOCKED"], INTERVIEWING: ["OFFER", "BLOCKED"], OFFER: ["WAITING_APPROVAL", "CANCELLED"], WAITING_APPROVAL: ["COMPLETED", "OFFER"] },
      workflowGoal: (record) => `审核招聘需求“${record.title}”，生成岗位画像、筛选标准、面试流程和合规检查。`
    }),
    onboarding_case: definition({
      label: "入职流程",
      fields: [field("employeeName", "员工姓名", "text", { required: true }), field("department", "所属部门", "text", { required: true }), field("positionName", "岗位", "text", { required: true }), field("startDate", "入职日期", "date", { required: true }), field("manager", "直属经理", "text", { required: true })],
      transitions: { DRAFT: ["PREPARING"], PREPARING: ["WAITING_APPROVAL", "BLOCKED"], WAITING_APPROVAL: ["READY", "PREPARING"], READY: ["COMPLETED"] },
      workflowGoal: (record) => `检查“${record.title}”入职准备事项、权限最小化和首周任务安排。`
    })
  }),
  "finance-platform": Object.freeze({
    expense: definition({
      label: "费用单",
      fields: [field("expenseDate", "费用日期", "date", { required: true }), field("department", "费用部门", "text", { required: true }), field("category", "费用类别", "select", { required: true, options: ["差旅", "采购", "招待", "办公", "其他"] }), field("amount", "含税金额", "number", { required: true, min: 0.01 }), field("currency", "币种", "select", { required: true, options: ["CNY", "USD", "EUR"] }), field("budgetCode", "预算科目", "text", { required: true }), field("description", "费用说明", "textarea", { required: true })],
      transitions: { DRAFT: ["SUBMITTED"], SUBMITTED: ["UNDER_REVIEW", "REJECTED"], UNDER_REVIEW: ["WAITING_APPROVAL", "REJECTED", "BLOCKED"], WAITING_APPROVAL: ["APPROVED", "REJECTED"], APPROVED: ["PAID"], REJECTED: ["DRAFT"] },
      workflowGoal: (record) => `审核费用单“${record.title}”，核对预算科目、金额合理性并形成审批建议。`
    }),
    budget: definition({
      label: "预算",
      fields: [field("fiscalYear", "预算年度", "number", { required: true }), field("department", "责任部门", "text", { required: true }), field("budgetCode", "预算科目", "text", { required: true }), field("amount", "预算金额", "number", { required: true, min: 0 }), field("currency", "币种", "select", { required: true, options: ["CNY", "USD", "EUR"] })],
      transitions: { DRAFT: ["SUBMITTED"], SUBMITTED: ["WAITING_APPROVAL", "REJECTED"], WAITING_APPROVAL: ["APPROVED", "REJECTED"], APPROVED: ["ACTIVE"], ACTIVE: ["COMPLETED"] },
      workflowGoal: (record) => `分析预算“${record.title}”的历史基准、资源配置和风险，形成审批建议。`
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
      if (!Number.isFinite(value) || (item.min !== undefined && value < item.min)) throw Object.assign(new Error(`BUSINESS_FIELD_INVALID:${item.key}`), { code: "BUSINESS_FIELD_INVALID", field: item.key });
    }
    if (item.options && !item.options.includes(value)) throw Object.assign(new Error(`BUSINESS_FIELD_INVALID:${item.key}`), { code: "BUSINESS_FIELD_INVALID", field: item.key });
    fields[item.key] = value;
  }
  return fields;
}

export function availableBusinessTransitions(applicationId, objectType, status) {
  return [...(getBusinessObjectDefinition(applicationId, objectType).transitions[status] ?? [])];
}

export function businessWorkflowGoal(applicationId, record) {
  return getBusinessObjectDefinition(applicationId, record.objectType).workflowGoal(record);
}
