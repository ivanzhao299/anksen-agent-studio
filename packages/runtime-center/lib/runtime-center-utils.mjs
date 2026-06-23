import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");

const paths = {
  providers: resolve(packageRoot, "examples/runtime-providers.example.json"),
  profiles: resolve(packageRoot, "examples/runtime-profiles.example.json"),
  credentials: resolve(packageRoot, "examples/credential-references.example.json"),
  budgets: resolve(packageRoot, "examples/runtime-budgets.example.json"),
  selection: resolve(packageRoot, "examples/runtime-selection-rules.example.json")
};

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function byId(items, idField) {
  return new Map((items ?? []).map((item) => [item[idField], item]));
}

export async function loadRuntimeCenter() {
  const [providers, profiles, credentials, budgets, selection] = await Promise.all([
    readJson(paths.providers),
    readJson(paths.profiles),
    readJson(paths.credentials),
    readJson(paths.budgets),
    readJson(paths.selection)
  ]);
  return {
    providers,
    profiles,
    credentials,
    budgets,
    selection,
    indexes: {
      providers: byId(providers.providers, "provider_id"),
      profiles: byId(profiles.profiles, "runtime_id"),
      credentialsByProvider: byId(credentials.credential_references, "provider"),
      budgets: byId(budgets.budgets, "runtime_id")
    }
  };
}

function providerAuthStatus(center, provider) {
  const authModes = provider?.auth_modes ?? [];
  if (authModes.includes("none")) return "not_required";
  const credential = center.indexes.credentialsByProvider.get(provider?.provider_id ?? "");
  if (credential?.credential_type === "none") return "not_required";
  if (credential?.vault_path) return "reference_only";
  return "missing";
}

function runtimeStatus(provider, profile) {
  if (profile?.health_status && profile.health_status !== "unknown") return profile.health_status;
  return provider?.health_status ?? "unknown";
}

export function buildRuntimeHealth(center, dryRun = true) {
  const results = (center.profiles.profiles ?? []).map((profile) => {
    const provider = center.indexes.providers.get(profile.provider);
    return {
      provider: profile.provider,
      runtime: profile.runtime_id,
      status: runtimeStatus(provider, profile),
      latency_ms: null,
      auth_status: providerAuthStatus(center, provider),
      available_skills: profile.supported_skills ?? [],
      notes: dryRun
        ? "Dry-run registry health only. No external service, browser, CLI login, or credential value was accessed."
        : "Active probes are disabled in Runtime Center MVP."
    };
  });

  return {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    dry_run: dryRun,
    results
  };
}

function healthScore(status) {
  if (status === "healthy") return 30;
  if (status === "unknown") return 15;
  if (status === "degraded") return 5;
  return -1000;
}

function budgetScore(budget, requestedBudgetUsd) {
  if (!budget || budget.budget_status === "disabled") return -1000;
  if (requestedBudgetUsd > Number(budget.max_usd_per_task ?? 0)) return -1000;
  if (budget.budget_status === "within_budget") return 25;
  if (budget.budget_status === "limited") return 10;
  return 5;
}

function authScore(authStatus) {
  if (authStatus === "not_required") return 15;
  if (authStatus === "reference_only") return 10;
  return -1000;
}

function matchingRule(center, skillType, capability, region) {
  const rules = center.selection.rules ?? [];
  return rules.find((rule) => rule.skill_type === skillType && rule.capability === capability && rule.region === region)
    ?? rules.find((rule) => rule.skill_type === skillType)
    ?? null;
}

function preferenceScore(rule, runtimeId) {
  const preferred = rule?.preferred_runtime_ids ?? [];
  const fallback = rule?.fallback_runtime_ids ?? [];
  const preferredIndex = preferred.indexOf(runtimeId);
  if (preferredIndex >= 0) return 40 - preferredIndex;
  const fallbackIndex = fallback.indexOf(runtimeId);
  if (fallbackIndex >= 0) return 15 - fallbackIndex;
  return 0;
}

export function selectRuntime(center, options) {
  const skillType = options.skillType;
  const capability = options.capability || skillType;
  const region = options.region || "local";
  const rule = matchingRule(center, skillType, capability, region);
  const requestedBudgetUsd = Number(options.budgetUsd ?? rule?.max_budget_usd ?? 0);

  const candidates = (center.profiles.profiles ?? []).map((profile) => {
    const provider = center.indexes.providers.get(profile.provider);
    const budget = center.indexes.budgets.get(profile.runtime_id);
    const status = runtimeStatus(provider, profile);
    const authStatus = providerAuthStatus(center, provider);
    const supportsSkill = (profile.supported_skills ?? []).includes(skillType);
    const providerSupportsCapability = (provider?.capabilities ?? []).includes(capability);
    const regionMatches = profile.region === region || profile.region === "local" || region === "any";
    const scoreParts = {
      skill: supportsSkill ? 40 : -1000,
      capability: providerSupportsCapability ? 20 : 0,
      region: regionMatches ? 10 : -10,
      health: healthScore(status),
      budget: budgetScore(budget, requestedBudgetUsd),
      auth: authScore(authStatus),
      preference: preferenceScore(rule, profile.runtime_id)
    };
    const score = Object.values(scoreParts).reduce((sum, value) => sum + value, 0);
    return {
      runtime_id: profile.runtime_id,
      provider: profile.provider,
      invoke_mode: profile.invoke_mode,
      region: profile.region,
      status,
      auth_status: authStatus,
      supported_skills: profile.supported_skills ?? [],
      max_parallel_tasks: Math.min(
        Number(profile.max_parallel_tasks ?? 1),
        Number(budget?.max_parallel_tasks ?? profile.max_parallel_tasks ?? 1)
      ),
      budget_status: budget?.budget_status ?? "unknown",
      max_usd_per_task: budget?.max_usd_per_task ?? profile.default_budget?.max_usd ?? 0,
      score,
      score_parts: scoreParts,
      eligible: score > 0,
      reason: [
        supportsSkill ? `supports skill ${skillType}` : `does not support skill ${skillType}`,
        providerSupportsCapability ? `provider supports ${capability}` : `provider capability ${capability} not declared`,
        regionMatches ? `region ${region} accepted` : `region mismatch ${profile.region}`,
        `health=${status}`,
        `budget=${budget?.budget_status ?? "unknown"}`,
        `auth=${authStatus}`
      ].join("; ")
    };
  }).sort((a, b) => b.score - a.score || a.runtime_id.localeCompare(b.runtime_id));

  const selected = candidates.find((candidate) => candidate.eligible) ?? null;
  return {
    input: {
      skill_type: skillType,
      capability,
      region,
      requested_budget_usd: requestedBudgetUsd
    },
    selected_runtime: selected?.runtime_id ?? null,
    selected_provider: selected?.provider ?? null,
    rule_id: rule?.rule_id ?? "RULE-FALLBACK",
    confidence: selected ? Math.max(0.35, Math.min(0.95, selected.score / 150)) : 0,
    fallback_used: selected ? !(rule?.preferred_runtime_ids ?? []).includes(selected.runtime_id) : true,
    reason: selected
      ? `${selected.runtime_id} scored highest for ${skillType} using ${rule?.rule_id ?? "fallback scoring"}.`
      : `No eligible runtime for ${skillType}.`,
    candidates
  };
}

export function runtimeInventory(center) {
  return (center.profiles.profiles ?? []).map((profile) => {
    const provider = center.indexes.providers.get(profile.provider);
    const budget = center.indexes.budgets.get(profile.runtime_id);
    return {
      runtime_id: profile.runtime_id,
      provider: profile.provider,
      provider_name: provider?.provider_name ?? profile.provider,
      provider_type: provider?.provider_type ?? "unknown",
      invoke_mode: profile.invoke_mode,
      region: profile.region,
      health_status: runtimeStatus(provider, profile),
      auth_status: providerAuthStatus(center, provider),
      supported_skills: profile.supported_skills ?? [],
      max_parallel_tasks: profile.max_parallel_tasks,
      budget_status: budget?.budget_status ?? "unknown",
      max_usd_per_task: budget?.max_usd_per_task ?? profile.default_budget?.max_usd ?? 0
    };
  });
}
