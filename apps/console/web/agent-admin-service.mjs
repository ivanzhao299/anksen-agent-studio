import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const forbiddenKeys = /(^|_)(secret|password|token|api_?key|private_?key)($|_)/i;
const allowedBillingUnits = new Set(["request", "task", "minute", "million_tokens"]);
const allowedCurrencies = new Set(["CNY", "USD"]);

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function assertNoSecretMaterial(value, path = "payload") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.test(key)) throw Object.assign(new Error(`Secret material is not accepted at ${path}.${key}.`), { code: "SECRET_VALUE_FORBIDDEN" });
    assertNoSecretMaterial(child, `${path}.${key}`);
  }
}

function integer(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

function money(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 10000) / 10000 : fallback;
}

function publicCredential(reference) {
  if (!reference) return null;
  return {
    credential_id: reference.credential_id,
    provider: reference.provider,
    credential_type: reference.credential_type,
    reference_type: reference.reference?.reference_type ?? null,
    status: reference.status
  };
}

export class AgentAdminService {
  constructor(options = {}) {
    this.repoRoot = resolve(options.repoRoot ?? process.cwd());
    this.configPath = options.configPath ?? join(this.repoRoot, "runtime/global/agent-control-config.json");
    this.auditPath = options.auditPath ?? join(this.repoRoot, "runtime/local-services/agent-control-audit.jsonl");
    this.adaptersPath = options.adaptersPath ?? join(this.repoRoot, "packages/runtime-adapters/examples/runtime-adapters.example.json");
    this.workersPath = options.workersPath ?? join(this.repoRoot, "packages/worker-pool/examples/worker-registry.example.json");
    this.credentialsPath = options.credentialsPath ?? join(this.repoRoot, "packages/credential-vault/examples/credential-references.example.json");
    this.plansPath = options.plansPath ?? join(this.repoRoot, "packages/access-center/examples/plan-entitlements.example.json");
    this.defaultConfigPath = options.defaultConfigPath ?? join(this.repoRoot, "apps/console/examples/agent-control-config.example.json");
  }

  async loadSources() {
    const [adapterRegistry, workerRegistry, credentialRegistry, entitlementRegistry, defaults, saved] = await Promise.all([
      readJson(this.adaptersPath, { adapters: [] }),
      readJson(this.workersPath, { workers: [] }),
      readJson(this.credentialsPath, { credential_references: [] }),
      readJson(this.plansPath, { plans: [] }),
      readJson(this.defaultConfigPath, { schema_version: "1.0.0", updated_at: null, agents: {} }),
      readJson(this.configPath, null)
    ]);
    return { adapterRegistry, workerRegistry, credentialRegistry, entitlementRegistry, config: saved ?? defaults };
  }

  async dashboard() {
    const { adapterRegistry, workerRegistry, credentialRegistry, entitlementRegistry, config } = await this.loadSources();
    const references = credentialRegistry.credential_references ?? [];
    const plans = entitlementRegistry.plans ?? [];
    const workers = workerRegistry.workers ?? [];
    const agents = (adapterRegistry.adapters ?? []).map((adapter, index) => {
      const override = config.agents?.[adapter.adapter_id] ?? {};
      const credentialId = override.credential_reference_id ?? adapter.credential_reference_id ?? null;
      const credential = references.find((item) => item.credential_id === credentialId) ?? null;
      const matchedWorkers = workers.filter((item) => item.adapter_id === adapter.adapter_id || item.runtime_id === adapter.runtime_id);
      const allowedPlanIds = Array.isArray(override.allowed_plan_ids)
        ? override.allowed_plan_ids
        : plans.filter((plan) => (plan.runtime_allowlist ?? []).includes("*") || (plan.runtime_allowlist ?? []).includes(adapter.runtime_id) || (plan.runtime_allowlist ?? []).includes(adapter.adapter_id)).map((plan) => plan.plan_id);
      return {
        adapter_id: adapter.adapter_id,
        runtime_id: adapter.runtime_id,
        provider: adapter.provider,
        invoke_mode: adapter.invoke_mode,
        supported_skills: adapter.supported_skills ?? [],
        guardrails: adapter.guardrails ?? [],
        risk_baseline: adapter.risk_baseline ?? "MEDIUM",
        health_status: adapter.health_status ?? "unknown",
        credential_reference_required: adapter.credential_reference_required === true,
        credential_reference: publicCredential(credential),
        credential_state: adapter.credential_reference_required === true ? (credential ? "REFERENCE_PRESENT" : "REFERENCE_MISSING") : "NOT_REQUIRED",
        network_required: adapter.network_required === true,
        workspace_required: adapter.workspace_required === true,
        workers: matchedWorkers.map((worker) => ({ worker_id: worker.worker_id, status: worker.status, risk: worker.risk, max_parallel_tasks: worker.max_parallel_tasks })),
        enabled: override.enabled ?? true,
        priority: integer(override.priority, (index + 1) * 10, 1, 100),
        max_parallel_tasks: integer(override.max_parallel_tasks, adapter.max_parallel_tasks ?? 1, 1, 64),
        allowed_plan_ids: allowedPlanIds,
        monthly_budget: money(override.monthly_budget),
        currency: allowedCurrencies.has(override.currency) ? override.currency : "CNY",
        billing_unit: allowedBillingUnits.has(override.billing_unit) ? override.billing_unit : "task",
        unit_cost: money(override.unit_cost),
        configured: Boolean(config.agents?.[adapter.adapter_id])
      };
    });
    return {
      status: "READY",
      generated_at: new Date().toISOString(),
      policy: {
        admin_only: true,
        credential_values_read: false,
        credential_reference_only: true,
        scheduler_replaced: false,
        registry_replaced: false
      },
      summary: {
        total: agents.length,
        enabled: agents.filter((agent) => agent.enabled).length,
        credential_ready: agents.filter((agent) => agent.credential_state !== "REFERENCE_MISSING").length,
        worker_ready: agents.filter((agent) => agent.workers.some((worker) => worker.status === "available")).length,
        monthly_budget_by_currency: Object.fromEntries([...allowedCurrencies].map((currency) => [currency, agents.filter((agent) => agent.currency === currency).reduce((total, agent) => total + agent.monthly_budget, 0)]))
      },
      credentials: references.map(publicCredential),
      plans: plans.map((plan) => ({ plan_id: plan.plan_id, display_name: plan.display_name, runtime_allowlist: plan.runtime_allowlist ?? [] })),
      agents
    };
  }

  async updateAgent(adapterId, payload, actor = {}) {
    assertNoSecretMaterial(payload);
    const dashboard = await this.dashboard();
    const existing = dashboard.agents.find((agent) => agent.adapter_id === adapterId);
    if (!existing) throw Object.assign(new Error(`Unknown adapter: ${adapterId}`), { code: "AGENT_ADAPTER_NOT_FOUND" });
    const credentialId = payload.credential_reference_id === null || payload.credential_reference_id === "" ? null : String(payload.credential_reference_id ?? existing.credential_reference?.credential_id ?? "");
    if (credentialId && !dashboard.credentials.some((item) => item.credential_id === credentialId)) throw Object.assign(new Error(`Unknown credential reference: ${credentialId}`), { code: "CREDENTIAL_REFERENCE_NOT_FOUND" });
    const planIds = Array.isArray(payload.allowed_plan_ids) ? [...new Set(payload.allowed_plan_ids.map(String))] : existing.allowed_plan_ids;
    if (planIds.some((id) => !dashboard.plans.some((plan) => plan.plan_id === id))) throw Object.assign(new Error("One or more plan IDs are unknown."), { code: "ACCESS_PLAN_NOT_FOUND" });
    const next = {
      enabled: payload.enabled === undefined ? existing.enabled : payload.enabled === true,
      priority: integer(payload.priority, existing.priority, 1, 100),
      max_parallel_tasks: integer(payload.max_parallel_tasks, existing.max_parallel_tasks, 1, 64),
      credential_reference_id: credentialId,
      allowed_plan_ids: planIds,
      monthly_budget: money(payload.monthly_budget, existing.monthly_budget),
      currency: allowedCurrencies.has(payload.currency) ? payload.currency : existing.currency,
      billing_unit: allowedBillingUnits.has(payload.billing_unit) ? payload.billing_unit : existing.billing_unit,
      unit_cost: money(payload.unit_cost, existing.unit_cost)
    };
    const sources = await this.loadSources();
    const document = {
      schema_version: "1.0.0",
      updated_at: new Date().toISOString(),
      agents: { ...(sources.config.agents ?? {}), [adapterId]: next }
    };
    await mkdir(dirname(this.configPath), { recursive: true });
    const tempPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
    await rename(tempPath, this.configPath);
    const audit = {
      audit_id: `agent-audit-${randomUUID()}`,
      action: "AGENT_CONFIGURATION_UPDATED",
      adapter_id: adapterId,
      actor_user_id: actor.user_id ?? actor.userId ?? "unknown",
      occurred_at: document.updated_at,
      changed_fields: Object.keys(next).filter((key) => JSON.stringify(existing[key]) !== JSON.stringify(next[key])),
      credential_reference_only: true
    };
    await mkdir(dirname(this.auditPath), { recursive: true });
    await appendFile(this.auditPath, `${JSON.stringify(audit)}\n`, { mode: 0o600 });
    return { status: "UPDATED", agent: (await this.dashboard()).agents.find((agent) => agent.adapter_id === adapterId), audit };
  }

  async audits(limit = 50) {
    try {
      const rows = (await readFile(this.auditPath, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
      return rows.slice(-Math.max(1, Math.min(Number(limit) || 50, 200))).reverse();
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }
}

export { assertNoSecretMaterial };
