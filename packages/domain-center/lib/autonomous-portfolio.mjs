import { randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, statSync, unlinkSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compileDomainWorkflow, getStudioApplication, getStudioDomain } from "./domain-center.mjs";

const terminal = new Set(["SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED"]);
const positiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw Object.assign(new Error("PORTFOLIO_LIMIT_INVALID"), { code: "PORTFOLIO_LIMIT_INVALID" });
  return parsed;
};
const safeId = (value) => String(value ?? "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "campaign";

export class AutonomousPortfolioService {
  constructor({ repoRoot, registry, dispatcher, clock = () => new Date(), storeDir = resolve(repoRoot, "runtime/autonomous-portfolio") } = {}) {
    if (!registry) throw Object.assign(new Error("REGISTRY_REQUIRED"), { code: "REGISTRY_REQUIRED" });
    if (typeof dispatcher !== "function") throw Object.assign(new Error("DISPATCHER_REQUIRED"), { code: "DISPATCHER_REQUIRED" });
    this.repoRoot = resolve(repoRoot);
    this.registry = registry;
    this.dispatcher = dispatcher;
    this.clock = clock;
    this.storeDir = storeDir;
  }

  path(id) { return join(this.storeDir, `${safeId(id)}.json`); }
  lockPath(id) { return join(this.storeDir, `${safeId(id)}.tick.lock`); }
  async save(campaign) { await mkdir(this.storeDir, { recursive: true }); await writeFile(this.path(campaign.id), `${JSON.stringify(campaign, null, 2)}\n`, "utf8"); return campaign; }
  async get(id) { if (!existsSync(this.path(id))) return null; return JSON.parse(await readFile(this.path(id), "utf8")); }
  async list() {
    if (!existsSync(this.storeDir)) return [];
    const names = (await readdir(this.storeDir)).filter((name) => name.endsWith(".json"));
    const campaigns = await Promise.all(names.map((name) => readFile(join(this.storeDir, name), "utf8").then(JSON.parse)));
    return campaigns.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  buildInitiatives(campaignId, cycle, application, domainIds, goal) {
    return domainIds.map((domainId, index) => {
      const domain = getStudioDomain(domainId);
      if (domain.applicationId !== application.id) throw Object.assign(new Error(`DOMAIN_APPLICATION_MISMATCH:${domainId}`), { code: "DOMAIN_APPLICATION_MISMATCH" });
      const workflow = compileDomainWorkflow(`${goal} · ${domain.name}`, this.registry, { explicitDomainId: domainId, goalId: `${campaignId}-${cycle}-${index}` });
      return {
        id: `${campaignId}-${cycle}-${safeId(domainId)}`,
        cycle,
        sequence: index + 1,
        applicationId: application.id,
        domainId,
        domainName: domain.name,
        title: `${goal} · ${domain.name}`,
        status: workflow.status === "READY" ? "PENDING" : "BLOCKED",
        skillPack: domain.skillPack,
        agentAssignments: workflow.assignments.map((item) => ({ stage: item.key, businessSkillId: item.businessSkillId, skillType: item.skillType, agentId: item.agentId, workerKey: item.workerKey, runtimeId: item.runtimeId, status: item.status })),
        taskEstimate: workflow.tasks.length,
        tokenEstimate: workflow.tasks.length * 5000,
        runtimeMinuteEstimate: workflow.tasks.length * 5,
        blockedReasons: workflow.blockedReasons,
        sessionKey: `portfolio-${campaignId}-${cycle}-${safeId(domainId)}`,
        report: null,
        error: null,
        createdAt: this.clock().toISOString(),
        startedAt: null,
        finishedAt: null
      };
    });
  }

  async create(input, actor = {}) {
    const goal = String(input.goal ?? "").trim();
    if (!goal) throw Object.assign(new Error("PORTFOLIO_GOAL_REQUIRED"), { code: "PORTFOLIO_GOAL_REQUIRED" });
    const application = getStudioApplication(String(input.applicationId ?? ""));
    const requestedDomains = Array.isArray(input.domainIds) && input.domainIds.length ? [...new Set(input.domainIds)] : application.domainIds;
    if (!requestedDomains.length || requestedDomains.length > 20) throw Object.assign(new Error("PORTFOLIO_DOMAIN_LIMIT"), { code: "PORTFOLIO_DOMAIN_LIMIT" });
    const id = `portfolio-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const scheduleMode = input.scheduleMode === "RECURRING" ? "RECURRING" : "ONCE";
    const maxCycles = scheduleMode === "RECURRING" ? positiveInt(input.maxCycles, 4, 52) : 1;
    const campaign = {
      schemaVersion: 1,
      id,
      status: "DRAFT",
      applicationId: application.id,
      applicationName: application.name,
      projectId: safeId(input.projectId || "anksen-agent-studio"),
      goal,
      domainIds: requestedDomains,
      schedule: { mode: scheduleMode, intervalMinutes: scheduleMode === "RECURRING" ? positiveInt(input.intervalMinutes, 1440, 525600) : null, maxCycles, currentCycle: 0, nextRunAt: new Date(input.startAt || this.clock()).toISOString() },
      budget: { maxTasks: positiveInt(input.maxTasks, Math.max(20, requestedDomains.length * 4), 1000), maxTokenEstimate: positiveInt(input.maxTokenEstimate, Math.max(100000, requestedDomains.length * 20000), 100000000), maxRuntimeMinutes: positiveInt(input.maxRuntimeMinutes, Math.max(120, requestedDomains.length * 20), 100000), maxCostUsd: Number(input.maxCostUsd ?? 20) },
      usage: { reservedTasks: 0, reservedTokenEstimate: 0, reservedRuntimeMinutes: 0, actualTasks: 0, actualRuntimeExecutions: 0, actualTokenUsage: null, actualCostUsd: null },
      initiatives: this.buildInitiatives(id, 0, application, requestedDomains, goal),
      createdBy: actor.userId ?? "unknown",
      approvedBy: null,
      createdAt: this.clock().toISOString(),
      updatedAt: this.clock().toISOString(),
      startedAt: null,
      finishedAt: null,
      lastTickAt: null,
      errors: []
    };
    if (!Number.isFinite(campaign.budget.maxCostUsd) || campaign.budget.maxCostUsd < 0) throw Object.assign(new Error("PORTFOLIO_COST_LIMIT_INVALID"), { code: "PORTFOLIO_COST_LIMIT_INVALID" });
    return this.save(campaign);
  }

  async activate(id, actor = {}) {
    const campaign = await this.get(id);
    if (!campaign) throw Object.assign(new Error("PORTFOLIO_NOT_FOUND"), { code: "PORTFOLIO_NOT_FOUND" });
    if (campaign.status !== "DRAFT" && campaign.status !== "PAUSED") throw Object.assign(new Error("PORTFOLIO_NOT_ACTIVATABLE"), { code: "PORTFOLIO_NOT_ACTIVATABLE" });
    campaign.status = "ACTIVE";
    campaign.approvedBy = actor.userId ?? "unknown";
    campaign.startedAt ??= this.clock().toISOString();
    campaign.updatedAt = this.clock().toISOString();
    return this.save(campaign);
  }

  withinBudget(campaign, initiative) {
    return campaign.usage.reservedTasks + initiative.taskEstimate <= campaign.budget.maxTasks && campaign.usage.reservedTokenEstimate + initiative.tokenEstimate <= campaign.budget.maxTokenEstimate && campaign.usage.reservedRuntimeMinutes + initiative.runtimeMinuteEstimate <= campaign.budget.maxRuntimeMinutes;
  }

  async tickOne(campaign, now) {
    for (const item of campaign.initiatives.filter((candidate) => candidate.status === "DISPATCHING" && now.getTime() - new Date(candidate.startedAt).getTime() > 10 * 60 * 1000)) {
      item.status = "PENDING";
      item.error = "RECOVERED_STALE_DISPATCH";
      campaign.usage.reservedTasks = Math.max(0, campaign.usage.reservedTasks - item.taskEstimate);
      campaign.usage.reservedTokenEstimate = Math.max(0, campaign.usage.reservedTokenEstimate - item.tokenEstimate);
      campaign.usage.reservedRuntimeMinutes = Math.max(0, campaign.usage.reservedRuntimeMinutes - item.runtimeMinuteEstimate);
    }
    if (campaign.status === "WAITING_NEXT_CYCLE" && new Date(campaign.schedule.nextRunAt) <= now) {
      const cycle = campaign.schedule.currentCycle + 1;
      campaign.schedule.currentCycle = cycle;
      campaign.initiatives.push(...this.buildInitiatives(campaign.id, cycle, getStudioApplication(campaign.applicationId), campaign.domainIds, campaign.goal));
      campaign.status = "ACTIVE";
    }
    if (campaign.status !== "ACTIVE" || new Date(campaign.schedule.nextRunAt) > now) return campaign;
    const initiative = campaign.initiatives.find((item) => item.cycle === campaign.schedule.currentCycle && item.status === "PENDING");
    if (!initiative) {
      const cycleItems = campaign.initiatives.filter((item) => item.cycle === campaign.schedule.currentCycle);
      if (cycleItems.some((item) => item.status === "DISPATCHING" || item.status === "RUNNING")) return campaign;
      const failed = cycleItems.some((item) => item.status === "FAILED" || item.status === "BLOCKED");
      if (campaign.schedule.mode === "RECURRING" && campaign.schedule.currentCycle + 1 < campaign.schedule.maxCycles) {
        campaign.status = "WAITING_NEXT_CYCLE";
        campaign.schedule.nextRunAt = new Date(now.getTime() + campaign.schedule.intervalMinutes * 60000).toISOString();
      } else {
        campaign.status = failed ? "COMPLETED_WITH_BLOCKERS" : "SUCCEEDED";
        campaign.finishedAt = now.toISOString();
      }
      return campaign;
    }
    if (!this.withinBudget(campaign, initiative)) {
      initiative.status = "BLOCKED";
      initiative.blockedReasons = [...initiative.blockedReasons, "CAMPAIGN_BUDGET_EXCEEDED"];
      campaign.status = "BUDGET_BLOCKED";
      return campaign;
    }
    campaign.usage.reservedTasks += initiative.taskEstimate;
    campaign.usage.reservedTokenEstimate += initiative.tokenEstimate;
    campaign.usage.reservedRuntimeMinutes += initiative.runtimeMinuteEstimate;
    initiative.status = "DISPATCHING";
    initiative.startedAt = now.toISOString();
    await this.save(campaign);
    try {
      const result = await this.dispatcher({ campaign, initiative });
      initiative.status = result.status === "SUCCEEDED" ? "SUCCEEDED" : result.status === "BLOCKED" ? "BLOCKED" : "FAILED";
      initiative.report = result.report ?? null;
      initiative.kernel = { sessionKey: initiative.sessionKey, goalId: result.report?.goalId ?? null, sessionId: result.report?.sessionId ?? null };
      initiative.finishedAt = this.clock().toISOString();
      campaign.usage.actualTasks += Number(result.report?.totalTasks ?? initiative.taskEstimate);
      campaign.usage.actualRuntimeExecutions += Number(result.report?.runtimeExecutionCount ?? 0);
    } catch (error) {
      initiative.status = error?.code === "WORKFLOW_BLOCKED" ? "BLOCKED" : "FAILED";
      initiative.error = error instanceof Error ? error.message : String(error);
      initiative.blockedReasons = [...initiative.blockedReasons, ...(error?.workflow?.blockedReasons ?? [])];
      initiative.finishedAt = this.clock().toISOString();
      campaign.errors.push({ at: this.clock().toISOString(), initiativeId: initiative.id, code: error?.code ?? "DISPATCH_FAILED", message: initiative.error });
    }
    return campaign;
  }

  async tick(id = null) {
    const campaigns = id ? [await this.get(id)].filter(Boolean) : await this.list();
    const results = [];
    for (const campaign of campaigns) {
      if (!["ACTIVE", "WAITING_NEXT_CYCLE"].includes(campaign.status)) { results.push(campaign); continue; }
      let fd;
      try {
        await mkdir(this.storeDir, { recursive: true });
        if (existsSync(this.lockPath(campaign.id)) && Date.now() - statSync(this.lockPath(campaign.id)).mtimeMs > 10 * 60 * 1000) unlinkSync(this.lockPath(campaign.id));
        fd = openSync(this.lockPath(campaign.id), "wx");
      } catch { results.push(campaign); continue; }
      closeSync(fd);
      try {
        const current = await this.get(campaign.id);
        current.lastTickAt = this.clock().toISOString();
        current.updatedAt = current.lastTickAt;
        results.push(await this.save(await this.tickOne(current, this.clock())));
      } finally { try { unlinkSync(this.lockPath(campaign.id)); } catch {} }
    }
    return id ? results[0] ?? null : results;
  }

  async pause(id, actor = {}) {
    const campaign = await this.get(id);
    if (!campaign) return null;
    if (terminal.has(campaign.status)) return campaign;
    campaign.status = "PAUSED";
    campaign.pausedBy = actor.userId ?? "unknown";
    campaign.updatedAt = this.clock().toISOString();
    return this.save(campaign);
  }
}
