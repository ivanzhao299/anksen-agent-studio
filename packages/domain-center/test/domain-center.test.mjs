import test from "node:test";
import assert from "node:assert/strict";
import { SmokeKernelFixture } from "../../orchestrator-core/lib/night-shift-smoke.mjs";
import {
  compileDomainWorkflow,
  domainCenterSummary,
  DomainWorkflowService,
  getStudioApplication,
  getStudioDomain,
  loadDomainRuntimeRegistry,
  resolveDomainCapability,
  routeStudioDomain,
  studioApplications,
  studioDomains
} from "../lib/domain-center.mjs";
import { renderConsolePage } from "../../../apps/console/web/render.mjs";
import { consoleWebRoutes } from "../../../apps/console/web/routes.mjs";
import { validateGraph } from "../../orchestrator-core/lib/autonomous-kernel/domain.mjs";
import { compileSmartParkProgram } from "../lib/smart-park-program.mjs";
import { compileAiGrowthSalesProgram } from "../lib/ai-growth-sales-program.mjs";
import { compileManufacturingErpProgram } from "../lib/manufacturing-erp-program.mjs";
import { smartParkDomainChecks } from "../lib/smart-park-audit.mjs";

const registry = await loadDomainRuntimeRegistry();

test("catalog separates group platforms from the Smart Park business platform", () => {
  assert.deepEqual(studioApplications.map((item) => item.id), ["software-factory", "video-factory", "enterprise-strategy-platform", "human-resources-platform", "finance-platform", "ai-growth-sales-platform", "intelligent-manufacturing-erp", "smart-park-platform"]);
  assert.equal(getStudioApplication("smart-park-platform").domainIds.length, 13);
  assert.ok(!getStudioApplication("smart-park-platform").domainIds.includes("finance-management"));
  assert.equal(getStudioApplication("ai-growth-sales-platform").domainIds.length, 10);
  assert.equal(getStudioApplication("intelligent-manufacturing-erp").domainIds.length, 14);
  assert.equal(studioDomains.length, 42);
  assert.equal(getStudioDomain("strategy-execution").applicationId, "enterprise-strategy-platform");
  assert.equal(getStudioDomain("human-resources").applicationId, "human-resources-platform");
  assert.equal(getStudioDomain("finance-management").applicationId, "finance-platform");
  assert.ok(getStudioDomain("strategy-execution").skillPack.includes("strategy_kpi_modeling"));
  assert.ok(getStudioDomain("human-resources").skillPack.includes("organization_design"));
  assert.ok(getStudioDomain("finance-management").skillPack.includes("budget_accounting_model"));
  assert.equal(domainCenterSummary().sourceOfTruth, "business-application-registry");
  assert.ok(studioDomains.every((domain) => !("agentId" in domain)), "business domains must not be Agent lanes");
});

test("explicit business domain selection wins and unknown domains fail closed", () => {
  const route = routeStudioDomain("生成人员报告", { explicitDomainId: "human-resources" });
  assert.equal(route.applicationId, "human-resources-platform");
  assert.equal(route.domainId, "human-resources");
  assert.throws(() => routeStudioDomain("goal", { explicitDomainId: "unknown" }), (error) => error.code === "DOMAIN_NOT_FOUND");
});

test("goal routing distinguishes finance, HR, strategy, software, and video", () => {
  assert.equal(routeStudioDomain("编制年度财务预算").domainId, "finance-management");
  assert.equal(routeStudioDomain("制定员工绩效方案").domainId, "human-resources");
  assert.equal(routeStudioDomain("拆解年度战略目标和 KPI").domainId, "strategy-execution");
  assert.equal(routeStudioDomain("修复软件接口并测试").domainId, "software-engineering");
  assert.equal(routeStudioDomain("剪辑产品视频并生成字幕").domainId, "video-production");
  assert.equal(routeStudioDomain("生成园区能耗账单").domainId, "energy-management");
  assert.equal(routeStudioDomain("自动生成产品文案并形成短视频矩阵").domainId, "video-matrix");
  assert.equal(routeStudioDomain("获取客户信息并进行线索评分").domainId, "lead-intelligence");
  assert.equal(routeStudioDomain("客户成交后转入交易系统").domainId, "transaction-handoff");
  assert.equal(routeStudioDomain("根据 BOM 和库存运行 MRP").domainId, "mrp-procurement");
  assert.equal(routeStudioDomain("完善 WMS 库位批次和盘点").domainId, "wms-logistics");
});

test("software workflow binds stages to real skills, agents, runtimes, and workers", () => {
  const workflow = compileDomainWorkflow("优化仪表盘页面并完成测试", registry, { goalId: "ui-goal", explicitDomainId: "software-engineering" });
  assert.equal(workflow.application.id, "software-factory");
  assert.equal(workflow.domain.id, "software-engineering");
  assert.equal(workflow.status, "READY");
  assert.deepEqual(workflow.assignments.map((item) => item.agentId), ["agent-5", "agent-4", "agent-2", "agent-1"]);
  assert.ok(workflow.assignments.every((item) => item.skillType && item.runtimeId && item.workerKey));
  assert.equal(workflow.tasks.length, 4);
  assert.equal(workflow.dependencies.length, 3);
  assert.ok(workflow.tasks.every((item) => item.metadata.applicationId === "software-factory" && item.metadata.businessSkillId));
});

test("missing professional Runner blocks the business workflow honestly", () => {
  const finance = getStudioDomain("finance-management");
  const capability = resolveDomainCapability(finance, registry);
  assert.equal(capability.status, "BLOCKED");
  assert.ok(capability.blockedReasons.includes("NO_ONLINE_CAPACITY:spreadsheet_analysis"));
  const workflow = compileDomainWorkflow("编制财务预算", registry, { goalId: "finance-goal", explicitDomainId: "finance-management" });
  assert.equal(workflow.status, "BLOCKED");
  assert.ok(workflow.blockedReasons.includes("NO_WORKER_FOR_SKILL:spreadsheet_analysis"));
});

test("workflow submits the business graph through the existing Kernel port", async () => {
  const kernel = new SmokeKernelFixture();
  const goal = { id: "ui-goal", title: "优化仪表盘页面并完成测试" };
  kernel.createGoal(goal);
  const result = await new DomainWorkflowService({ kernel, registry }).compileAndSubmit(goal.title, { goalId: goal.id, explicitDomainId: "software-engineering" });
  assert.ok(result.submission.id);
  assert.equal(kernel.goalTasks(goal.id).length, 4);
  assert.ok(kernel.goalTasks(goal.id).every((task) => task.metadata.applicationId && task.metadata.domainId && task.metadata.agentId && task.metadata.skillType && task.metadata.workerKey));
});

test("Console renders eight platforms and forty-two business domains, not Agent lanes", async () => {
  assert.ok(consoleWebRoutes.some((route) => route.id === "domains" && route.path === "/domains"));
  const html = await renderConsolePage("/domains", { authenticated: true, capabilities: ["*"], project_allowlist: ["*"] });
  assert.match(html, /应用与业务领域/);
  assert.match(html, /智慧园区业务平台/);
  assert.match(html, /集团战略执行平台/);
  assert.match(html, /AI 增长与销售平台/);
  assert.match(html, /智能制造 ERP 平台/);
  assert.match(html, /战略执行/);
  assert.match(html, /人力资源/);
  assert.match(html, /财务管理/);
  assert.equal((html.match(/class="application-suite"/g) ?? []).length, 8);
  assert.equal((html.match(/class="domain-card"/g) ?? []).length, 42);
  assert.doesNotMatch(html, /真实 Agent Lane|责任 Agent|应用范围与 Agent 分工/);
});

test("Smart Park completion program is a valid gated long-running DAG", () => {
  const program = compileSmartParkProgram();
  assert.equal(program.tasks.length, 21);
  assert.ok(program.dependencies.length > 30);
  assert.equal(validateGraph({ tasks: program.tasks.map((item) => ({ ...item, key: item.taskKey })), dependencies: program.dependencies }).valid, true);
  assert.ok(program.tasks.every((item) => item.requiredCapabilities.includes("smart_park_development")));
  assert.ok(program.tasks.every((item) => item.metadata.executionRuntime === "CODEX" && item.metadata.controlledStubCompletionForbidden));
  assert.equal(program.tasks.at(-1).taskKey, "SP-260");
  assert.equal(program.applicationId, "smart-park-platform");
  assert.ok(!program.tasks.some((item) => ["strategy-execution", "human-resources", "finance-management"].includes(item.metadata.domainId)));
  assert.ok(program.tasks.some((item) => item.taskKey === "SP-050" && item.metadata.domainId === "group-finance-integration"));
  assert.equal(program.runtimePolicy.allowDeploy, false);
});

test("AI Growth and Sales program is an approval-gated end-to-end DAG", () => {
  const program = compileAiGrowthSalesProgram();
  assert.equal(program.tasks.length, 12);
  assert.equal(validateGraph({ tasks: program.tasks.map((item) => ({ ...item, key: item.taskKey })), dependencies: program.dependencies }).valid, true);
  assert.ok(program.tasks.every((item) => item.metadata.applicationId === "ai-growth-sales-platform"));
  assert.ok(program.tasks.every((item) => item.metadata.activationGateRequired && item.metadata.controlledStubCompletionForbidden));
  assert.equal(program.runtimePolicy.externalActionsRequireApproval, true);
  assert.equal(program.runtimePolicy.allowCredentialValues, false);
  assert.equal(program.tasks.at(-1).taskKey, "GS-110");
});

test("Manufacturing ERP program is a gated order-to-delivery DAG", () => {
  const program = compileManufacturingErpProgram();
  assert.equal(program.tasks.length, 16);
  assert.equal(validateGraph({ tasks: program.tasks.map((item) => ({ ...item, key: item.taskKey })), dependencies: program.dependencies }).valid, true);
  assert.ok(program.tasks.every((item) => item.metadata.applicationId === "intelligent-manufacturing-erp"));
  assert.ok(program.tasks.every((item) => item.metadata.activationGateRequired && item.metadata.controlledStubCompletionForbidden));
  assert.equal(program.tasks.at(-1).taskKey, "ME-150");
});

test("SP-000 audit treats group platforms as integration boundaries", () => {
  assert.equal(smartParkDomainChecks.length, 17);
  assert.equal(new Set(smartParkDomainChecks.map((item) => item.id)).size, 17);
  assert.equal(smartParkDomainChecks.find((item) => item.id === "group-strategy-integration").status, "UPSTREAM_PLATFORM_BOUNDARY");
  assert.equal(smartParkDomainChecks.find((item) => item.id === "group-hr-integration").status, "UPSTREAM_PLATFORM_BOUNDARY");
  assert.equal(smartParkDomainChecks.find((item) => item.id === "group-finance-integration").status, "UPSTREAM_PLATFORM_BOUNDARY");
  assert.equal(smartParkDomainChecks.find((item) => item.id === "park-settlement-billing").status, "IMPLEMENTED_BASELINE");
  assert.ok(smartParkDomainChecks.every((item) => (item.required?.length ?? 0) + (item.absent?.length ?? 0) > 0));
});
