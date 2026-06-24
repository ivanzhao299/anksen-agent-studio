import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");

export const workerPoolPaths = {
  registry: resolve(packageRoot, "examples/worker-registry.example.json"),
  isolationPolicy: resolve(packageRoot, "examples/worker-isolation-policy.example.json"),
  health: resolve(packageRoot, "examples/worker-health.example.json"),
  assignment: resolve(packageRoot, "examples/worker-assignment.example.json"),
  cancellation: resolve(packageRoot, "examples/worker-cancellation.example.json"),
  auditLog: resolve(packageRoot, "examples/worker-audit-log.example.json")
};

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function byId(items, idField) {
  return new Map((items ?? []).map((item) => [item[idField], item]));
}

function stableId(parts) {
  return createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 10);
}

export async function loadWorkerPool() {
  const [registry, isolationPolicy, healthExample, assignmentExample, cancellationExample, auditLogExample] = await Promise.all([
    readJson(workerPoolPaths.registry),
    readJson(workerPoolPaths.isolationPolicy),
    readJson(workerPoolPaths.health),
    readJson(workerPoolPaths.assignment),
    readJson(workerPoolPaths.cancellation),
    readJson(workerPoolPaths.auditLog)
  ]);
  return {
    registry,
    isolationPolicy,
    healthExample,
    assignmentExample,
    cancellationExample,
    auditLogExample,
    paths: workerPoolPaths,
    indexes: {
      workersById: byId(registry.workers, "worker_id"),
      workersByRuntime: byId(registry.workers, "runtime_id")
    }
  };
}

export function governanceForWorker(worker) {
  if (!worker) {
    return {
      risk: "CRITICAL",
      execution_mode: "proposal_only",
      proposal_required: true,
      human_approval_required: true,
      reason: "Worker is missing from registry."
    };
  }
  if (worker.worker_kind === "production") {
    return {
      risk: "CRITICAL",
      execution_mode: "human_approval_required",
      proposal_required: true,
      human_approval_required: true,
      reason: "Production workers require CRITICAL human approval."
    };
  }
  if (worker.worker_kind === "remote") {
    return {
      risk: "HIGH",
      execution_mode: "proposal_only",
      proposal_required: true,
      human_approval_required: false,
      reason: "Remote workers default to HIGH risk and proposal-only mode."
    };
  }
  return {
    risk: worker.risk,
    execution_mode: worker.execution_mode,
    proposal_required: false,
    human_approval_required: false,
    reason: "Local worker is available for LOW/MEDIUM governed local repository work."
  };
}

export function workerInventory(bundle) {
  return (bundle.registry.workers ?? []).map((worker) => ({
    worker_id: worker.worker_id,
    display_name: worker.display_name,
    worker_kind: worker.worker_kind,
    runtime_id: worker.runtime_id,
    adapter_id: worker.adapter_id,
    status: worker.status,
    supported_skills: worker.supported_skills ?? [],
    max_parallel_tasks: worker.max_parallel_tasks,
    isolation_policy_id: worker.isolation_policy_id,
    governance: governanceForWorker(worker)
  }));
}

export function workerHealth(bundle) {
  return {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    dry_run: true,
    workers: workerInventory(bundle).map((worker) => ({
      worker_id: worker.worker_id,
      runtime_id: worker.runtime_id,
      status: worker.status,
      health_status: worker.status === "available" && worker.worker_kind === "local" ? "healthy" : "blocked",
      risk: worker.governance.risk,
      execution_mode: worker.governance.execution_mode,
      notes: worker.worker_kind === "local"
        ? "Dry-run local worker health. Metadata is available; no process, server, SSH, credential, deploy, or production operation was invoked."
        : "Remote and production workers are blocked in Pilot-2."
    }))
  };
}

export function assignWorker(bundle, runtimeId) {
  const worker = bundle.indexes.workersByRuntime.get(runtimeId) ?? null;
  const governance = governanceForWorker(worker);
  const blockedReasons = [];
  if (!worker) blockedReasons.push(`No worker is registered for runtime ${runtimeId}.`);
  if (worker?.status !== "available") blockedReasons.push(`Worker status is ${worker?.status ?? "missing"}.`);
  if (governance.proposal_required || governance.human_approval_required) blockedReasons.push(governance.reason);
  const status = blockedReasons.length === 0 ? "ASSIGNED" : "BLOCKED";
  return {
    schema_version: 1,
    assignment_id: `assign-${stableId([runtimeId, worker?.worker_id ?? "missing", new Date().toISOString()])}`,
    created_at: new Date().toISOString(),
    runtime_id: runtimeId,
    worker_id: worker?.worker_id ?? "",
    status,
    dry_run: true,
    governance,
    isolation_policy: {
      policy_id: bundle.isolationPolicy.policy_id,
      workspace_scope: bundle.isolationPolicy.workspace_scope,
      network: bundle.isolationPolicy.network,
      credential_values: bundle.isolationPolicy.credential_values,
      managed_project_writes: bundle.isolationPolicy.managed_project_writes
    },
    blocked_reasons: blockedReasons,
    safety: {
      server_access: "disabled",
      ssh: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "not_read",
      managed_project_writes: "disabled"
    }
  };
}

export function cancelWorker(bundle, workerId) {
  const worker = bundle.indexes.workersById.get(workerId) ?? null;
  const governance = governanceForWorker(worker);
  const blockedReasons = [];
  if (!worker) blockedReasons.push(`Worker not found: ${workerId}.`);
  return {
    schema_version: 1,
    cancel_id: `cancel-${stableId([workerId, new Date().toISOString()])}`,
    created_at: new Date().toISOString(),
    worker_id: workerId,
    runtime_id: worker?.runtime_id ?? "",
    dry_run: true,
    governance,
    kill_switch: {
      status: worker ? "ARMED_DRY_RUN" : "EXECUTION_DISABLED",
      would_cancel_active_tasks: Boolean(worker),
      would_stop_worker_process: false,
      reason: worker
        ? "Pilot-2 cancellation is dry-run only; no local process, server, SSH session, deploy, or production operation is stopped."
        : "No worker matched the requested id."
    },
    blocked_reasons: blockedReasons,
    safety: {
      server_access: "disabled",
      ssh: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "not_read",
      managed_project_writes: "disabled"
    }
  };
}

export function validateWorkerPool(bundle) {
  const findings = [];
  const seen = new Set();
  for (const worker of bundle.registry.workers ?? []) {
    if (seen.has(worker.worker_id)) {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "Duplicate worker_id." });
    }
    seen.add(worker.worker_id);
    const governance = governanceForWorker(worker);
    if (worker.worker_kind === "local" && !["LOW", "MEDIUM"].includes(governance.risk)) {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "Local workers must be LOW or MEDIUM risk." });
    }
    if (worker.worker_kind === "remote" && governance.execution_mode !== "proposal_only") {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "Remote workers must default to proposal_only." });
    }
    if (worker.worker_kind === "production" && governance.risk !== "CRITICAL") {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "Production workers must be CRITICAL." });
    }
  }
  return {
    status: findings.filter((finding) => finding.severity === "ERROR").length === 0 ? "PASS" : "FAIL",
    worker_count: bundle.registry.workers?.length ?? 0,
    local_worker_count: (bundle.registry.workers ?? []).filter((worker) => worker.worker_kind === "local").length,
    remote_worker_policy: "HIGH / proposal_only",
    production_worker_policy: "CRITICAL / human_approval_required",
    findings
  };
}
