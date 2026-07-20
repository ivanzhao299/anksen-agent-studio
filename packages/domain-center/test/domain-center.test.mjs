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
import { smartParkDomainChecks } from "../lib/smart-park-audit.mjs";

const registry = await loadDomainRuntimeRegistry();

test("catalog separates user-recorded applications from ERP business domains", () => {
  assert.deepEqual(studioApplications.map((item) => item.id), ["software-factory", "video-factory", "smart-park-erp"]);
  assert.deepEqual(getStudioApplication("smart-park-erp").domainIds, ["strategy-execution", "human-resources", "finance-management"]);
  assert.equal(studioDomains.length, 5);
  assert.equal(getStudioDomain("finance-management").applicationId, "smart-park-erp");
  assert.ok(getStudioDomain("strategy-execution").skillPack.includes("strategy_kpi_modeling"));
  assert.ok(getStudioDomain("human-resources").skillPack.includes("organization_design"));
  assert.ok(getStudioDomain("finance-management").skillPack.includes("budget_accounting_model"));
  assert.equal(domainCenterSummary().sourceOfTruth, "business-application-registry");
  assert.ok(studioDomains.every((domain) => !("agentId" in domain)), "business domains must not be Agent lanes");
});

test("explicit business domain selection wins and unknown domains fail closed", () => {
  const route = routeStudioDomain("生成人员报告", { explicitDomainId: "human-resources" });
  assert.equal(route.applicationId, "smart-park-erp");
  assert.equal(route.domainId, "human-resources");
  assert.throws(() => routeStudioDomain("goal", { explicitDomainId: "unknown" }), (error) => error.code === "DOMAIN_NOT_FOUND");
});

test("goal routing distinguishes finance, HR, strategy, software, and video", () => {
  assert.equal(routeStudioDomain("编制年度财务预算").domainId, "finance-management");
  assert.equal(routeStudioDomain("制定员工绩效方案").domainId, "human-resources");
  assert.equal(routeStudioDomain("拆解年度战略目标和 KPI").domainId, "strategy-execution");
  assert.equal(routeStudioDomain("修复软件接口并测试").domainId, "software-engineering");
  assert.equal(routeStudioDomain("剪辑产品视频并生成字幕").domainId, "video-production");
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

test("Console renders three applications and five business domains, not Agent lanes", async () => {
  assert.ok(consoleWebRoutes.some((route) => route.id === "domains" && route.path === "/domains"));
  const html = await renderConsolePage("/domains", { authenticated: true, capabilities: ["*"], project_allowlist: ["*"] });
  assert.match(html, /应用与业务领域/);
  assert.match(html, /智慧园区 ERP/);
  assert.match(html, /战略执行/);
  assert.match(html, /人力资源/);
  assert.match(html, /财务管理/);
  assert.equal((html.match(/class="application-suite"/g) ?? []).length, 3);
  assert.equal((html.match(/class="domain-card"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /真实 Agent Lane|责任 Agent|应用范围与 Agent 分工/);
});

test("Smart Park completion program is a valid gated long-running DAG", () => {
  const program = compileSmartParkProgram();
  assert.equal(program.tasks.length, 20);
  assert.ok(program.dependencies.length > 30);
  assert.equal(validateGraph({ tasks: program.tasks.map((item) => ({ ...item, key: item.taskKey })), dependencies: program.dependencies }).valid, true);
  assert.ok(program.tasks.every((item) => item.requiredCapabilities.includes("smart_park_development")));
  assert.ok(program.tasks.every((item) => item.metadata.executionRuntime === "CODEX" && item.metadata.controlledStubCompletionForbidden));
  assert.equal(program.tasks.at(-1).taskKey, "SP-260");
  assert.equal(program.runtimePolicy.allowDeploy, false);
});

test("SP-000 audit covers every restored Smart Park business domain explicitly", () => {
  assert.equal(smartParkDomainChecks.length, 16);
  assert.equal(new Set(smartParkDomainChecks.map((item) => item.id)).size, 16);
  assert.equal(smartParkDomainChecks.find((item) => item.id === "strategy-execution").status, "MISSING");
  assert.equal(smartParkDomainChecks.find((item) => item.id === "human-resources").status, "FOUNDATION_ONLY");
  assert.equal(smartParkDomainChecks.find((item) => item.id === "finance-management").status, "PARTIAL");
  assert.ok(smartParkDomainChecks.every((item) => (item.required?.length ?? 0) + (item.absent?.length ?? 0) > 0));
});
