import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const paths = {
  skills: resolve(repoRoot, "packages/skill-router/registry/skill-registry.json"),
  skillRules: resolve(repoRoot, "packages/skill-router/registry/skill-router-rules.json"),
  agents: resolve(repoRoot, "packages/orchestrator-core/schemas/agent-registry/agent-registry.example.json"),
  workers: resolve(repoRoot, "packages/worker-pool/examples/worker-registry.example.json")
};

const stage = (key, title, skillType, preferredAgentId, dependsOn = null, businessSkillId = null) =>
  Object.freeze({ key, title, businessSkillId: businessSkillId ?? key.toLowerCase(), skillType, preferredAgentId, dependsOn });

/**
 * Product applications are navigation and ownership boundaries. They are not
 * Agent lanes and do not own a second scheduler, worker pool, or data model.
 */
export const studioApplications = Object.freeze([
  {
    id: "software-factory",
    name: "软件工厂",
    nameEn: "Software Factory",
    icon: "DEV",
    summary: "面向软件规划、开发、验证和交付的自主研发应用。",
    evidence: "USER_RECORDED",
    domainIds: ["software-engineering"]
  },
  {
    id: "video-factory",
    name: "视频工厂",
    nameEn: "Video Factory",
    icon: "VID",
    summary: "面向素材分析、脚本、视觉制作、渲染和发布的媒体生产应用。",
    evidence: "USER_RECORDED",
    domainIds: ["video-production"]
  },
  {
    id: "smart-park-erp",
    name: "智慧园区 ERP",
    nameEn: "Smart Park ERP",
    icon: "ERP",
    summary: "统一承载园区经营管理；当前恢复战略执行、人力资源和财务管理三个已确认业务域。",
    evidence: "USER_CONFIRMED",
    domainIds: ["strategy-execution", "human-resources", "finance-management"]
  }
]);

/**
 * Business domains define professional workflows and skill requirements only.
 * Agent and Worker assignments are resolved later from the runtime registries.
 */
export const studioDomains = Object.freeze([
  {
    id: "software-engineering",
    applicationId: "software-factory",
    name: "软件研发",
    nameEn: "Software Engineering",
    icon: "CODE",
    summary: "将产品目标转化为设计、代码、测试和可审计交付结果。",
    skillPack: ["solution_planning", "software_delivery", "quality_validation", "delivery_reporting"],
    keywords: ["软件", "开发", "代码", "页面", "接口", "修复", "测试", "software", "code", "api"],
    workflow: Object.freeze([
      stage("PLAN", "分析需求与技术边界", "code_development", "agent-5", null, "solution_planning"),
      stage("BUILD", "实现软件变更", "code_development", "agent-4", "PLAN", "software_delivery"),
      stage("VALIDATE", "运行测试与安全校验", "validation_testing", "agent-2", "BUILD", "quality_validation"),
      stage("REPORT", "生成交付报告", "document_generation", "agent-1", "VALIDATE", "delivery_reporting")
    ])
  },
  {
    id: "video-production",
    applicationId: "video-factory",
    name: "视频生产",
    nameEn: "Video Production",
    icon: "MEDIA",
    summary: "编排脚本、视觉素材、剪辑渲染和多渠道交付；媒体专用 Runner 尚未接入。",
    skillPack: ["media_briefing", "script_storyboard", "visual_asset_generation", "media_delivery_reporting"],
    keywords: ["视频", "素材", "剪辑", "配音", "字幕", "封面", "video", "media", "subtitle"],
    workflow: Object.freeze([
      stage("PLAN", "分析素材与成片目标", "document_generation", "agent-1", null, "media_briefing"),
      stage("SCRIPT", "生成脚本与镜头表", "document_generation", "agent-1", "PLAN", "script_storyboard"),
      stage("VISUAL", "生成视觉与封面资产", "image_generation", "agent-4", "SCRIPT", "visual_asset_generation"),
      stage("REPORT", "生成媒体交付报告", "document_generation", "agent-1", "VISUAL", "media_delivery_reporting")
    ])
  },
  {
    id: "strategy-execution",
    applicationId: "smart-park-erp",
    name: "战略执行",
    nameEn: "Strategy Execution",
    icon: "STR",
    summary: "从战略目标到年度重点、指标、责任与执行复盘的管理闭环。",
    skillPack: ["strategic_goal_design", "strategy_kpi_modeling", "initiative_cascade", "strategy_review"],
    keywords: ["战略", "年度目标", "经营目标", "okr", "kpi", "执行复盘", "strategy"],
    workflow: Object.freeze([
      stage("PLAN", "澄清战略目标与约束", "document_generation", "agent-1", null, "strategic_goal_design"),
      stage("METRICS", "建立指标与目标值", "spreadsheet_analysis", "agent-2", "PLAN", "strategy_kpi_modeling"),
      stage("CASCADE", "拆解责任与行动计划", "document_generation", "agent-1", "METRICS", "initiative_cascade"),
      stage("REPORT", "生成战略执行报告", "document_generation", "agent-1", "CASCADE", "strategy_review")
    ])
  },
  {
    id: "human-resources",
    applicationId: "smart-park-erp",
    name: "人力资源",
    nameEn: "Human Resources",
    icon: "HR",
    summary: "围绕组织、岗位、人才、绩效与员工服务形成可持续工作流。",
    skillPack: ["workforce_goal_analysis", "organization_design", "hr_policy_validation", "people_operations_reporting"],
    keywords: ["人力", "组织", "岗位", "招聘", "员工", "绩效", "薪酬", "人才", "hr"],
    workflow: Object.freeze([
      stage("PLAN", "识别人力资源目标与合规边界", "document_generation", "agent-1", null, "workforce_goal_analysis"),
      stage("DESIGN", "设计组织与人才流程", "document_generation", "agent-1", "PLAN", "organization_design"),
      stage("VALIDATE", "校验规则、权限与结果", "validation_testing", "agent-2", "DESIGN", "hr_policy_validation"),
      stage("REPORT", "生成人力资源执行报告", "document_generation", "agent-1", "VALIDATE", "people_operations_reporting")
    ])
  },
  {
    id: "finance-management",
    applicationId: "smart-park-erp",
    name: "财务管理",
    nameEn: "Finance Management",
    icon: "FIN",
    summary: "覆盖预算、核算、资金、应收应付、经营分析与财务风控。",
    skillPack: ["finance_scope_control", "budget_accounting_model", "financial_control_validation", "management_reporting"],
    keywords: ["财务", "预算", "核算", "资金", "应收", "应付", "发票", "报销", "经营分析", "finance"],
    workflow: Object.freeze([
      stage("PLAN", "确认财务目标与数据边界", "document_generation", "agent-1", null, "finance_scope_control"),
      stage("MODEL", "建立财务分析与核算模型", "spreadsheet_analysis", "agent-2", "PLAN", "budget_accounting_model"),
      stage("VALIDATE", "执行财务校验与风控检查", "validation_testing", "agent-2", "MODEL", "financial_control_validation"),
      stage("REPORT", "生成财务管理报告", "document_generation", "agent-1", "VALIDATE", "management_reporting")
    ])
  }
]);

const normalize = (value) => String(value ?? "").toLowerCase();
const matches = (text, keywords) => (keywords ?? []).filter((keyword) => normalize(text).includes(normalize(keyword)));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export function getStudioApplication(id) {
  return studioApplications.find((application) => application.id === id) ?? null;
}

export function getStudioDomain(id) {
  return studioDomains.find((domain) => domain.id === id) ?? null;
}

export function routeStudioDomain(goal, { explicitDomainId = null } = {}) {
  if (explicitDomainId) {
    const explicit = getStudioDomain(explicitDomainId);
    if (!explicit) throw Object.assign(new Error("DOMAIN_NOT_FOUND"), { code: "DOMAIN_NOT_FOUND" });
    return { applicationId: explicit.applicationId, domainId: explicit.id, confidence: 1, source: "EXPLICIT", alternatives: [] };
  }
  const scored = studioDomains
    .map((domain) => ({ applicationId: domain.applicationId, domainId: domain.id, score: matches(goal, domain.keywords).length }))
    .sort((a, b) => b.score - a.score || a.domainId.localeCompare(b.domainId));
  if (scored[0].score === 0) {
    return { applicationId: "software-factory", domainId: "software-engineering", confidence: 0.35, source: "FALLBACK", alternatives: [] };
  }
  const best = scored[0];
  const total = scored.reduce((sum, item) => sum + item.score, 0);
  return {
    applicationId: best.applicationId,
    domainId: best.domainId,
    confidence: Number(Math.min(0.98, 0.55 + best.score / Math.max(total, 1) * 0.4).toFixed(2)),
    source: "KEYWORD",
    alternatives: scored.slice(1, 4).filter((item) => item.score > 0)
  };
}

export async function loadDomainRuntimeRegistry() {
  const [skillRegistry, skillRules, agentRegistry, workerRegistry] = await Promise.all([
    readJson(paths.skills), readJson(paths.skillRules), readJson(paths.agents), readJson(paths.workers)
  ]);
  return { skillRegistry, skillRules, agentRegistry, workerRegistry, paths };
}

export function routeSkill(text, registry) {
  const skills = new Map((registry.skillRegistry.skills ?? []).map((skill) => [skill.skill_type, skill]));
  const scored = (registry.skillRules.rules ?? [])
    .map((rule) => {
      const keywords = matches(text, rule.keywords);
      return { rule, skill: skills.get(rule.skill_type), keywords, score: keywords.length * 10 + (keywords.length ? Number(rule.confidence_boost ?? 0) : 0) };
    })
    .filter((item) => item.skill)
    .sort((a, b) => b.score - a.score || String(a.rule.rule_id).localeCompare(String(b.rule.rule_id)));
  const selected = scored.find((item) => item.score > 0);
  const fallbackType = registry.skillRules.routing_policy?.fallback_skill_type ?? "code_development";
  const fallback = skills.get(fallbackType);
  const final = selected ?? { rule: { skill_type: fallbackType, selected_agent: "agent-5", runtime: "codex-cli" }, skill: fallback, keywords: [], score: 0 };
  return {
    skillType: final.rule.skill_type,
    skillId: final.skill?.skill_id ?? final.rule.skill_type,
    agentId: final.rule.selected_agent ?? final.skill?.default_agent ?? "agent-5",
    runtimeId: final.rule.runtime ?? final.skill?.default_runtime ?? "codex-cli",
    riskLevel: final.skill?.risk_level ?? "MEDIUM",
    validationCommands: final.skill?.validation_commands ?? [],
    confidence: selected ? Math.min(0.95, 0.55 + final.score / 100) : 0.35,
    matchedKeywords: final.keywords
  };
}

function agentForSkill(registry, preferredAgentId, skillType) {
  const agents = registry.agentRegistry.agents ?? [];
  const preferred = agents.find((agent) => agent.agent_id === preferredAgentId && agent.status === "ACTIVE" && (agent.supported_skills ?? []).includes(skillType));
  return preferred ?? agents
    .filter((agent) => agent.status === "ACTIVE" && (agent.supported_skills ?? []).includes(skillType))
    .sort((a, b) => Number(a.priority ?? 99) - Number(b.priority ?? 99))[0] ?? null;
}

function workerForSkill(registry, skillType, runtimeId = null) {
  const available = (registry.workerRegistry.workers ?? []).filter((worker) => worker.status === "available" && (worker.supported_skills ?? []).includes(skillType));
  return available.find((worker) => !runtimeId || worker.runtime_id === runtimeId) ?? available[0] ?? null;
}

export function resolveDomainCapability(domain, registry) {
  const uniqueSkills = [...new Set(domain.workflow.map((item) => item.skillType))];
  const skills = uniqueSkills.map((skillType) => {
    const worker = workerForSkill(registry, skillType);
    const agents = (registry.agentRegistry.agents ?? []).filter((agent) => agent.status === "ACTIVE" && (agent.supported_skills ?? []).includes(skillType));
    return { skillType, ready: Boolean(worker && agents.length), workerKey: worker?.worker_id ?? null, runtimeId: worker?.runtime_id ?? null, agentIds: agents.map((agent) => agent.agent_id) };
  });
  const stages = domain.workflow.map((workflowStage) => {
    const capability = skills.find((item) => item.skillType === workflowStage.skillType);
    return { key: workflowStage.key, title: workflowStage.title, businessSkillId: workflowStage.businessSkillId, ...capability };
  });
  return { status: skills.every((item) => item.ready) ? "READY" : "BLOCKED", skills, stages, blockedReasons: skills.filter((item) => !item.ready).map((item) => `NO_ONLINE_CAPACITY:${item.skillType}`) };
}

export function compileDomainWorkflow(goal, registry, { explicitDomainId = null, goalId = "domain-goal" } = {}) {
  const domainRoute = routeStudioDomain(goal, { explicitDomainId });
  const domain = getStudioDomain(domainRoute.domainId);
  const application = getStudioApplication(domain.applicationId);
  const primarySkill = routeSkill(goal, registry);
  const assignments = domain.workflow.map((workflowStage) => {
    const agent = agentForSkill(registry, workflowStage.preferredAgentId, workflowStage.skillType);
    const skill = (registry.skillRegistry.skills ?? []).find((item) => item.skill_type === workflowStage.skillType);
    const worker = workerForSkill(registry, workflowStage.skillType, skill?.default_runtime ?? null);
    return {
      ...workflowStage,
      agentId: agent?.agent_id ?? null,
      preferredRuntimeId: skill?.default_runtime ?? null,
      runtimeId: worker?.runtime_id ?? skill?.default_runtime ?? null,
      workerKey: worker?.worker_id ?? null,
      workerMode: worker?.process_probe?.on_demand_ok ? "ON_DEMAND" : worker ? "REGISTERED" : "MISSING",
      status: agent && worker ? "READY" : "BLOCKED",
      blockedReasons: [...(!agent ? [`NO_AGENT_FOR_SKILL:${workflowStage.skillType}`] : []), ...(!worker ? [`NO_WORKER_FOR_SKILL:${workflowStage.skillType}`] : [])]
    };
  });
  const taskPrefix = goalId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const tasks = assignments.map((assignment) => ({
    taskKey: `${taskPrefix}_${assignment.key}`,
    title: assignment.title,
    description: `${assignment.title}: ${goal}`,
    priority: assignment.key === "BUILD" || assignment.key === "MODEL" ? "P1" : "P2",
    riskLevel: assignment.skillType === primarySkill.skillType ? primarySkill.riskLevel : "LOW",
    requiredCapabilities: [assignment.skillType],
    maxAttempts: 1,
    metadata: {
      applicationId: application.id,
      domainId: domain.id,
      workflowStage: assignment.key,
      businessSkillId: assignment.businessSkillId,
      skillType: assignment.skillType,
      agentId: assignment.agentId,
      preferredRuntimeId: assignment.preferredRuntimeId,
      runtimeId: assignment.runtimeId,
      workerKey: assignment.workerKey,
      workerMode: assignment.workerMode,
      assignmentStatus: assignment.status,
      blockedReasons: assignment.blockedReasons
    }
  }));
  const dependencies = assignments.filter((assignment) => assignment.dependsOn).map((assignment) => ({
    taskKey: `${taskPrefix}_${assignment.key}`,
    dependsOnTaskKey: `${taskPrefix}_${assignment.dependsOn}`,
    dependencyType: "SUCCESS_REQUIRED",
    requiredStatus: "SUCCEEDED"
  }));
  return {
    schemaVersion: 2,
    goalId,
    goal,
    domainRoute,
    application: { id: application.id, name: application.name },
    domain: { id: domain.id, name: domain.name, applicationId: domain.applicationId },
    primarySkill,
    assignments,
    tasks,
    dependencies,
    status: assignments.every((item) => item.status === "READY") ? "READY" : "BLOCKED",
    blockedReasons: assignments.flatMap((item) => item.blockedReasons),
    longRunning: true,
    persistentKernelRequired: true,
    onlineRunnerRequired: true
  };
}

export class DomainWorkflowService {
  constructor({ kernel, registry }) {
    if (!kernel?.submitPlan) throw Object.assign(new Error("KERNEL_REQUIRED"), { code: "KERNEL_REQUIRED" });
    this.kernel = kernel;
    this.registry = registry;
  }
  compile(goal, options) { return compileDomainWorkflow(goal, this.registry, options); }
  async compileAndSubmit(goal, options) {
    const workflow = this.compile(goal, options);
    if (workflow.status !== "READY") throw Object.assign(new Error(`WORKFLOW_BLOCKED:${workflow.blockedReasons.join(",")}`), { code: "WORKFLOW_BLOCKED", workflow });
    const submission = await this.kernel.submitPlan(workflow.goalId, {
      plannerVersion: `business-domain-workflow-v2-${workflow.domain.id}`,
      sourceArtifactRef: `application:${workflow.application.id}/domain:${workflow.domain.id}`,
      tasks: workflow.tasks,
      dependencies: workflow.dependencies
    });
    return { workflow, submission };
  }
}

export function domainCenterSummary() {
  return {
    schemaVersion: 3,
    applicationCount: studioApplications.length,
    domainCount: studioDomains.length,
    singleControlPlane: true,
    sourceOfTruth: "business-application-registry",
    applications: studioApplications.map((application) => ({
      ...application,
      domains: application.domainIds.map((domainId) => getStudioDomain(domainId))
    })),
    domains: studioDomains
  };
}
