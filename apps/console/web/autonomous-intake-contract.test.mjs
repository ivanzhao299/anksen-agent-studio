import assert from "node:assert/strict";
import test from "node:test";
import { EnterpriseProgramPlanner } from "../../../packages/domain-center/lib/enterprise-program-planner.mjs";
import { loadDomainRuntimeRegistry } from "../../../packages/domain-center/lib/domain-center.mjs";
import { buildAutonomousIntakeContract, validateAutonomousIntakeContract } from "../../../packages/domain-center/lib/autonomous-intake-contract.mjs";
import { createActionPlan } from "./action-server.mjs";
import { renderConsolePage } from "./render.mjs";

test("enterprise intake routes one natural-language goal into multiple domain workstreams and a complete lifecycle", async () => {
  const registry = await loadDomainRuntimeRegistry();
  const programPlan = new EnterpriseProgramPlanner({ registry }).plan("先制定集团战略，再完善销售获客，最后补齐人力招聘和绩效流程");
  const contract = buildAutonomousIntakeContract({ goal: programPlan.goal, projectId: "anksen-agent-studio", programPlan });
  assert.deepEqual(contract.routing.workstreams.map(item => item.applicationId), [
    "enterprise-strategy-platform",
    "ai-growth-sales-platform",
    "human-resources-platform"
  ]);
  assert.equal(contract.routing.dependencyMode, "EXPLICIT_SEQUENCE");
  assert.deepEqual(contract.lifecycle.map(stage => stage.id), ["UNDERSTAND", "ROUTE", "PLAN", "EXECUTE", "VERIFY", "DELIVER", "RELEASE", "CLOSE_LOOP"]);
  assert.equal(validateAutonomousIntakeContract(contract).status, "PASS");
});

test("software requirements use the software factory fallback instead of losing the intent", async () => {
  const registry = await loadDomainRuntimeRegistry();
  const programPlan = new EnterpriseProgramPlanner({ registry }).plan("修复前端页面并自动测试和发布");
  const contract = buildAutonomousIntakeContract({ goal: programPlan.goal, projectId: "anksen-agent-studio", requestedRuntime: "auto", programPlan });
  assert.equal(contract.routing.status, "READY");
  assert.equal(contract.routing.workstreams[0].applicationId, "software-factory");
  assert.equal(contract.completionDefinition.requiresVerification, true);
  assert.equal(contract.completionDefinition.requiresReleaseDecision, true);
});

test("conversation action plans expose the autonomous intake contract to the workstation", async () => {
  const result = await createActionPlan({ action_id: "workspace-goal", goal: "制定销售增长计划", project_id: "anksen-agent-studio", agent: "auto" });
  assert.equal(result.plan.autonomous_intake.kind, "autonomous_intake_contract");
  assert.equal(result.plan.autonomous_intake.routing.workstreams[0].applicationId, "ai-growth-sales-platform");
  assert.equal(validateAutonomousIntakeContract(result.plan.autonomous_intake).status, "PASS");
});

test("graphic design is routed as an independent domain with Photoshop as one execution stage", async () => {
  const registry = await loadDomainRuntimeRegistry();
  const programPlan = new EnterpriseProgramPlanner({ registry }).plan("为新产品设计品牌海报并交付可编辑 Photoshop PSD 和印刷 PDF");
  assert.equal(programPlan.workstreams[0].applicationId, "graphic-design-studio");
  assert.deepEqual(programPlan.workstreams[0].domainIds, ["graphic-design"]);
  const contract = buildAutonomousIntakeContract({ goal: programPlan.goal, projectId: "anksen-agent-studio", programPlan });
  assert.equal(contract.routing.workstreams[0].applicationName, "平面设计工作室");
  const html = await renderConsolePage("/design", { authenticated: true, capabilities: ["*"], roles: [], user: { username: "owner" } });
  for (const value of ["平面设计工作室", "创意 Brief", "设计系统", "Photoshop 精修", "多格式交付", "74 个参考"]) assert.match(html, new RegExp(value));
});

test("root route is the persistent conversation workstation while cockpit remains independent", async () => {
  const auth = { authenticated: true, capabilities: ["*"], roles: [], user: { username: "owner" } };
  const workstation = await renderConsolePage("/", auth);
  for (const value of ["个人 AI 工作站", "conversation-stream", "action-goal", "action-project", "action-agent", "平面设计", "发送 ↑"]) assert.match(workstation, new RegExp(value));
  assert.doesNotMatch(workstation, /集团业务驾驶舱/);
  const cockpit = await renderConsolePage("/cockpit", auth);
  assert.match(cockpit, /集团业务驾驶舱/);
});
