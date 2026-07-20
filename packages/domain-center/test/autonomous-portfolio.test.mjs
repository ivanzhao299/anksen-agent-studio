import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadDomainRuntimeRegistry } from "../lib/domain-center.mjs";
import { AutonomousPortfolioService } from "../lib/autonomous-portfolio.mjs";
import { renderConsolePage } from "../../../apps/console/web/render.mjs";

async function setup({ dispatcher, now = new Date("2026-07-20T00:00:00.000Z") } = {}) {
  const repoRoot = await mkdtemp(join(tmpdir(), "studio-portfolio-"));
  const registry = await loadDomainRuntimeRegistry();
  let current = now;
  const service = new AutonomousPortfolioService({
    repoRoot,
    registry,
    dispatcher: dispatcher ?? (async ({ initiative }) => ({ status: "SUCCEEDED", report: { sessionId: initiative.id, goalId: initiative.id, totalTasks: initiative.taskEstimate, runtimeExecutionCount: initiative.taskEstimate } })),
    clock: () => current
  });
  return { service, advance(minutes) { current = new Date(current.getTime() + minutes * 60000); } };
}

test("composes a durable campaign from real domain skills and agent assignments", async () => {
  const { service } = await setup();
  const campaign = await service.create({ applicationId: "software-factory", projectId: "anksen-agent-studio", goal: "Improve Studio runtime", maxTasks: 20, maxTokenEstimate: 100000, maxRuntimeMinutes: 100 }, { userId: "owner" });
  assert.equal(campaign.status, "DRAFT");
  assert.equal(campaign.initiatives.length, 1);
  assert.deepEqual(campaign.initiatives[0].skillPack, ["solution_planning", "software_delivery", "quality_validation", "delivery_reporting"]);
  assert.equal(campaign.initiatives[0].agentAssignments.length, 4);
  assert.equal(campaign.usage.actualTokenUsage, null);
  assert.equal((await service.list())[0].createdBy, "owner");
});

test("activation and ticks dispatch once through the injected existing kernel bridge", async () => {
  let calls = 0;
  const { service } = await setup({ dispatcher: async ({ initiative }) => { calls += 1; return { status: "SUCCEEDED", report: { sessionId: "session-1", goalId: "goal-1", totalTasks: initiative.taskEstimate, runtimeExecutionCount: 4 } }; } });
  const draft = await service.create({ applicationId: "software-factory", goal: "Deliver one safe cycle", maxTasks: 20, maxTokenEstimate: 100000, maxRuntimeMinutes: 100 });
  await service.activate(draft.id, { userId: "approver" });
  await Promise.all([service.tick(draft.id), service.tick(draft.id)]);
  assert.equal(calls, 1);
  const completed = await service.tick(draft.id);
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.initiatives[0].kernel.sessionId, "session-1");
  assert.equal(completed.approvedBy, "approver");
});

test("budget gate blocks before dispatch without expanding limits", async () => {
  let calls = 0;
  const { service } = await setup({ dispatcher: async () => { calls += 1; return { status: "SUCCEEDED" }; } });
  const draft = await service.create({ applicationId: "software-factory", goal: "Stay bounded", maxTasks: 1, maxTokenEstimate: 100000, maxRuntimeMinutes: 100 });
  await service.activate(draft.id);
  const blocked = await service.tick(draft.id);
  assert.equal(blocked.status, "BUDGET_BLOCKED");
  assert.equal(calls, 0);
  assert.ok(blocked.initiatives[0].blockedReasons.includes("CAMPAIGN_BUDGET_EXCEEDED"));
});

test("recurring campaign persists the next cycle and resumes when due", async () => {
  const fixture = await setup();
  const draft = await fixture.service.create({ applicationId: "software-factory", goal: "Weekly improvement", scheduleMode: "RECURRING", intervalMinutes: 60, maxCycles: 2, maxTasks: 20, maxTokenEstimate: 100000, maxRuntimeMinutes: 100 });
  await fixture.service.activate(draft.id);
  await fixture.service.tick(draft.id);
  let waiting = await fixture.service.tick(draft.id);
  assert.equal(waiting.status, "WAITING_NEXT_CYCLE");
  fixture.advance(61);
  const resumed = await fixture.service.tick(draft.id);
  assert.equal(resumed.schedule.currentCycle, 1);
  assert.equal(resumed.initiatives.filter((item) => item.cycle === 1).length, 1);
});

test("Studio exposes the portfolio product route and authenticated lifecycle API", async () => {
  const html = await renderConsolePage("/portfolio", { authenticated: true, capabilities: ["*"], project_allowlist: ["*"] });
  const server = await readFile(new URL("../../../apps/console/web/server.mjs", import.meta.url), "utf8");
  const access = await readFile(new URL("../../access-center/lib/access-center-utils.mjs", import.meta.url), "utf8");
  assert.match(html, /集团长期任务编排/);
  assert.match(html, /Skill \/ Agent/);
  assert.match(html, /\/api\/portfolio\/campaigns/);
  assert.match(server, /AutonomousPortfolioService/);
  assert.match(server, /`portfolio-\$\{portfolioAction\[2\]\}`/);
  assert.match(access, /"portfolio-activate"/);
  assert.match(server, /runDaemon/);
});
