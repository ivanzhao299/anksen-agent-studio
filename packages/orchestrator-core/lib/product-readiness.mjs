import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = (path, description, patterns = []) => ({ path, description, patterns });

export const productReadinessEvidenceModel = Object.freeze([
  { id: "identity", label: "Identity", evidence: [
    evidence("apps/console/web/identity-service.mjs", "OIDC identity proxy and runtime configuration", ["normalizeIdentityRuntimeConfig", "isPublicIdentityPath"]),
    evidence("infrastructure/identity/realm/anksen-realm.json", "Versioned ANKSEN realm configuration", ["studio-identity"]),
    evidence("packages/orchestrator-core/test/identity-service.test.mjs", "Restricted identity surface verification", ["registrationAllowed", "bruteForceProtected"])
  ] },
  { id: "gateway", label: "Gateway", evidence: [
    evidence("packages/orchestrator-core/lib/studio-gateway.mjs", "Authenticated Studio gateway implementation", ["StudioGateway", "GatewayAuthenticator"]),
    evidence("packages/orchestrator-core/schemas/studio-gateway.openapi.yaml", "Gateway HTTP contract", ["openapi:"]),
    evidence("packages/orchestrator-core/test/studio-gateway.test.mjs", "Gateway behavior verification", ["test("])
  ] },
  { id: "autonomous-kernel", label: "Autonomous kernel", evidence: [
    evidence("packages/orchestrator-core/lib/autonomous-kernel/domain.mjs", "Deterministic domain transitions", ["recoveryDecision"]),
    evidence("packages/orchestrator-core/lib/autonomous-kernel/postgres-store.mjs", "Transactional kernel store", ["schedulerTick", "claimNext"]),
    evidence("packages/orchestrator-core/test/autonomous-kernel/domain.test.mjs", "Kernel transition verification", ["node:assert"])
  ] },
  { id: "scheduler", label: "Scheduler", evidence: [
    evidence("packages/orchestrator-core/lib/persistent-night-shift.mjs", "Persistent scheduler loop", ["schedulerTick", "ad_scheduler_tick"]),
    evidence("packages/orchestrator-core/migrations/002_persistent_night_shift.up.sql", "Scheduler persistence schema", ["ad_scheduler_tick"]),
    evidence("packages/orchestrator-core/bin/night-shift-postgres.mjs", "Scheduler contention smoke", ["contention", "SINGLE_TASK_DOUBLE_CLAIM"])
  ] },
  { id: "worker", label: "Worker", evidence: [
    evidence("packages/worker-pool/lib/worker-pool-utils.mjs", "Governed worker-pool behavior", ["worker"]),
    evidence("packages/orchestrator-core/lib/autonomous-kernel/postgres-store.mjs", "Leased worker claim implementation", ["registerWorker", "claimNext"]),
    evidence("packages/runtime-adapters/test/runtime-core.test.mjs", "Worker runtime isolation verification", ["test("])
  ] },
  { id: "runtime-activation-gate", label: "Runtime activation gate", evidence: [
    evidence("packages/orchestrator-core/lib/activation-gate.mjs", "Policy, approval, credential-reference, and feature-flag gate", ["ActivationGateService", "AUTONOMOUS_RUNTIME_CODEX_ENABLED===\"true\"", "allowPush||policy.allowMerge||policy.allowDeploy"]),
    evidence("packages/orchestrator-core/migrations/003_codex_activation_gate.up.sql", "Durable activation approvals", ["ad_runtime_approval"]),
    evidence("packages/orchestrator-core/test/beta-002-activation.test.mjs", "Controlled activation verification", ["AUTONOMOUS_RUNTIME_CODEX_ENABLED"])
  ] },
  { id: "persistent-recovery", label: "Persistent recovery", evidence: [
    evidence("packages/orchestrator-core/lib/persistent-night-shift.mjs", "Expired lease recovery and persisted sessions", ["recoverExpired", "loadSession"]),
    evidence("packages/orchestrator-core/test/autonomous-kernel/domain.test.mjs", "Side-effect-aware recovery test", ["never blindly replays side effects"]),
    evidence("packages/orchestrator-core/bin/night-shift-postgres.mjs", "Restart/resume smoke path", ["resume", "checkpoint"])
  ] },
  { id: "console-product-surface", label: "Console product surface", evidence: [
    evidence("apps/console/web/routes.mjs", "Console route surface", ["consoleWebRoutes", "requiredConsoleWebRouteIds"]),
    evidence("apps/console/web/render.mjs", "Server-rendered operator console", ["buildConsoleDashboardModel"]),
    evidence("apps/console/web/server.mjs", "Loopback console server", ["127.0.0.1"])
  ] },
  { id: "verification", label: "Verification", evidence: [
    evidence("package.json", "Workspace build and typecheck entry points", ["\"build\"", "\"typecheck\""]),
    evidence("packages/orchestrator-core/package.json", "Node test runner configuration", ["node --test"]),
    evidence("packages/orchestrator-core/test/night-shift-smoke.test.mjs", "End-to-end controlled smoke verification", ["test("])
  ] },
  { id: "release-safety", label: "Release safety", evidence: [
    evidence("packages/orchestrator-core/lib/activation-gate.mjs", "Push, merge, and deploy denied by runtime policy", ["DANGEROUS_POLICY", "allowPush||policy.allowMerge||policy.allowDeploy"]),
    evidence("packages/production-ops/lib/production-ops-utils.mjs", "Production operations governance", ["approval"]),
    evidence("packages/governance-center/examples/release-gates.example.json", "Versioned release gate evidence", ["release"])
  ] },
  { id: "professional-domain-automation", label: "Professional domain automation", evidence: [
    evidence("packages/software-engineering-domain/schemas/software-engineering-contract.schema.json", "Versioned software engineering domain contract", ["SOFTWARE_ENGINEERING", "allowedPaths", "validationCommands"]),
    evidence("packages/software-engineering-domain/lib/software-engineering-domain.mjs", "Existing-Planner adapter and deterministic acceptance gate", ["RulePlannerEngine", "SoftwareEngineeringPlanner", "evaluateSoftwareEngineeringAcceptance"]),
    evidence("packages/software-engineering-domain/test/software-engineering-domain.test.mjs", "Kernel, Scheduler, Lease, Fencing, and acceptance verification", ["SmokeKernelFixture", "fencing", "BLOCKED"])
  ] }
]);

async function inspectEvidence(root, item) {
  try {
    const content = await readFile(resolve(root, item.path), "utf8");
    const missingPatterns = item.patterns.filter((pattern) => !content.includes(pattern));
    return { ...item, status: missingPatterns.length === 0 ? "PRESENT" : "INCOMPLETE", missingPatterns };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { ...item, status: "MISSING", missingPatterns: item.patterns };
    throw error;
  }
}

export async function assessProductReadiness({ root = process.cwd(), model = productReadinessEvidenceModel } = {}) {
  const checks = [];
  for (const definition of model) {
    const inspected = await Promise.all(definition.evidence.map((item) => inspectEvidence(root, item)));
    const present = inspected.filter((item) => item.status === "PRESENT").length;
    const status = present === inspected.length ? "READY" : present === 0 ? "MISSING" : "DEGRADED";
    checks.push({ id: definition.id, label: definition.label, status, evidence: inspected });
  }
  const ready = checks.filter((check) => check.status === "READY").length;
  const status = ready === checks.length ? "READY" : checks.every((check) => check.status === "MISSING") ? "MISSING" : "DEGRADED";
  return { schemaVersion: 1, status, summary: { ready, total: checks.length }, checks };
}
