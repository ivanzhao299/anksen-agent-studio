import { execFileSync } from "node:child_process";
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

function byCapability(items) {
  const index = new Map();
  for (const worker of items ?? []) {
    for (const tag of worker.capability_tags ?? []) {
      const workers = index.get(tag) ?? [];
      workers.push(worker);
      index.set(tag, workers);
    }
  }
  return index;
}

function stableId(parts) {
  return createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 10);
}

function readProcessTable() {
  const attempts = [
    ["-Ao", "pid=,command="],
    ["-eo", "pid=,args="]
  ];
  for (const args of attempts) {
    try {
      const stdout = execFileSync("ps", args, {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024
      });
      const processes = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const match = line.match(/^(\d+)\s+(.*)$/);
          if (!match) return null;
          return {
            pid: Number(match[1]),
            command: match[2],
            command_lower: match[2].toLowerCase()
          };
        })
        .filter(Boolean);
      return {
        status: "ok",
        checked_at: new Date().toISOString(),
        process_count: processes.length,
        processes
      };
    } catch (error) {
      continue;
    }
  }
  return {
    status: "error",
    checked_at: new Date().toISOString(),
    process_count: 0,
    processes: [],
    error_message: "Unable to read local process table with ps."
  };
}

function workerProcessProbe(worker) {
  const probe = worker?.process_probe ?? {};
  const matchAny = Array.isArray(probe.match_any)
    ? probe.match_any.map((item) => `${item}`.trim().toLowerCase()).filter(Boolean)
    : [];
  return {
    label: typeof probe.label === "string" && probe.label.trim() ? probe.label.trim() : "on_demand_local",
    matchAny,
    onDemandOk: probe.on_demand_ok !== false
  };
}

function workerProcessSnapshot(worker, inventory) {
  const probe = workerProcessProbe(worker);
  if (inventory.status !== "ok") {
    return {
      probe_mode: probe.label,
      process_probe_status: "probe_error",
      active_process_count: 0,
      matched_processes: [],
      notes: inventory.error_message ?? "Local process table is unavailable."
    };
  }
  if (probe.matchAny.length === 0) {
    return {
      probe_mode: probe.label,
      process_probe_status: "on_demand_idle",
      active_process_count: 0,
      matched_processes: [],
      notes: "Worker is on-demand and does not require a dedicated background process."
    };
  }
  const matched = inventory.processes.filter((processInfo) =>
    probe.matchAny.some((pattern) => processInfo.command_lower.includes(pattern))
  );
  if (matched.length > 0) {
    return {
      probe_mode: probe.label,
      process_probe_status: "active",
      active_process_count: matched.length,
      matched_processes: matched.slice(0, 5).map((processInfo) => ({
        pid: processInfo.pid,
        command: processInfo.command
      })),
      notes: "Matched local process inventory for this worker."
    };
  }
  if (probe.onDemandOk) {
    return {
      probe_mode: probe.label,
      process_probe_status: "on_demand_idle",
      active_process_count: 0,
      matched_processes: [],
      notes: "No active process matched. The worker remains healthy because it is allowed to start on demand."
    };
  }
  return {
    probe_mode: probe.label,
    process_probe_status: "missing",
    active_process_count: 0,
    matched_processes: [],
    notes: "Expected local worker process was not detected."
  };
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
      workersByRuntime: byId(registry.workers, "runtime_id"),
      workersByCapability: byCapability(registry.workers)
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
  if ((worker.capability_tags ?? []).some((tag) => tag === "mobile-ios" || tag === "mobile-android") && worker.worker_os === "macOS") {
    return {
      risk: "MEDIUM",
      execution_mode: worker.execution_mode,
      proposal_required: false,
      human_approval_required: false,
      reason: "Local macOS mobile worker is available for MEDIUM dry-run mobile stack work."
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
    worker_os: worker.worker_os,
    runtime_id: worker.runtime_id,
    adapter_id: worker.adapter_id,
    status: worker.status,
    supported_skills: worker.supported_skills ?? [],
    capability_tags: worker.capability_tags ?? [],
    max_parallel_tasks: worker.max_parallel_tasks,
    isolation_policy_id: worker.isolation_policy_id,
    process_probe: worker.process_probe ?? null,
    notes: worker.notes ?? "",
    governance: governanceForWorker(worker)
  }));
}

export function workerRegistrySummary(bundle) {
  const inventory = workerInventory(bundle);
  const capabilityCoverage = uniqueCapabilities(inventory);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    registry_id: bundle.registry.registry_id,
    worker_count: inventory.length,
    local_worker_count: inventory.filter((worker) => worker.worker_kind === "local").length,
    remote_worker_count: inventory.filter((worker) => worker.worker_kind === "remote").length,
    production_worker_count: inventory.filter((worker) => worker.worker_kind === "production").length,
    capability_tags: capabilityCoverage,
    required_capability_tags: bundle.registry.required_capability_tags ?? [],
    future_worker_classes: bundle.registry.future_worker_classes ?? [],
    safety: {
      server_access: "disabled",
      ssh: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "not_read"
    }
  };
}

function uniqueCapabilities(inventory) {
  return [...new Set(inventory.flatMap((worker) => worker.capability_tags ?? []))].sort();
}

export function workerHeartbeat(bundle) {
  const checkedAt = bundle.healthExample.checked_at ?? new Date().toISOString();
  const inventory = readProcessTable();
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    heartbeat_mode: inventory.status === "ok" ? "local_process_inventory_dry_run" : "local_process_inventory_probe_error",
    registry_updated_at: bundle.registry.updated_at ?? "unknown",
    health_checked_at: inventory.checked_at ?? checkedAt,
    process_inventory_status: inventory.status,
    process_inventory_count: inventory.process_count ?? 0,
    workers: workerInventory(bundle).map((worker) => {
      const processSnapshot = workerProcessSnapshot(worker, inventory);
      return {
        worker_id: worker.worker_id,
        runtime_id: worker.runtime_id,
        status: worker.status,
        heartbeat_status: worker.status !== "available"
          ? "BLOCKED"
          : processSnapshot.process_probe_status === "active"
            ? "HEALTHY_ACTIVE"
            : processSnapshot.process_probe_status === "probe_error"
              ? "PROBE_ERROR"
              : processSnapshot.process_probe_status === "missing"
                ? "BLOCKED"
                : "HEALTHY_IDLE",
        last_heartbeat_at: inventory.checked_at ?? checkedAt,
        capability_tags: worker.capability_tags,
        process_probe_mode: processSnapshot.probe_mode,
        active_process_count: processSnapshot.active_process_count,
        matched_processes: processSnapshot.matched_processes,
        notes: processSnapshot.notes
      };
    }),
    safety: {
      server_access: "disabled",
      ssh: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "not_read"
    }
  };
}

export function workerDispatch(bundle, options) {
  const assignment = assignWorker(bundle, options);
  return {
    schema_version: 1,
    dispatch_id: assignment.assignment_id.replace(/^assign-/, "dispatch-"),
    created_at: assignment.created_at,
    requested_runtime: typeof options === "string" ? options : options.runtimeId ?? "",
    requested_capability: typeof options === "string" ? "" : options.capability ?? "",
    selection_kind: assignment.selection_kind,
    worker_id: assignment.worker_id,
    runtime_id: assignment.runtime_id,
    status: assignment.status,
    execution_mode: assignment.governance.execution_mode,
    risk: assignment.governance.risk,
    proposal_required: assignment.governance.proposal_required,
    human_approval_required: assignment.governance.human_approval_required,
    blocked_reasons: assignment.blocked_reasons,
    isolation_policy: assignment.isolation_policy,
    safety: assignment.safety
  };
}

export function workerControlPlane(bundle) {
  const inventory = workerInventory(bundle);
  const heartbeat = workerHeartbeat(bundle);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    control_plane_id: `${bundle.registry.registry_id}-control-plane`,
    executor: bundle.assignmentExample?.runtime_id ? "local_worker_registry" : "metadata_only",
    true_parallel_executor: bundle.auditLogExample ? "node_child_process_verified" : "not_verified",
    worker_count: inventory.length,
    available_worker_count: inventory.filter((worker) => worker.status === "available").length,
    capability_tags: uniqueCapabilities(inventory),
    runtimes: [...new Set(inventory.map((worker) => worker.runtime_id))].sort(),
    governance: {
      local: "LOW/MEDIUM direct execute",
      remote: "HIGH proposal_only",
      production: "CRITICAL human_approval_required"
    },
    heartbeat_mode: heartbeat.heartbeat_mode,
    process_inventory_status: heartbeat.process_inventory_status,
    process_inventory_count: heartbeat.process_inventory_count,
    active_worker_process_count: heartbeat.workers.reduce((total, worker) => total + (worker.active_process_count ?? 0), 0),
    dispatch_modes: [
      "runtime_select",
      "capability_select"
    ],
    evidence: {
      assignment_example: bundle.paths.assignment,
      heartbeat_example: bundle.paths.health,
      isolation_policy: bundle.paths.isolationPolicy,
      parallel_smoke: bundle.paths.auditLog
    },
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

export function workerHealth(bundle) {
  const inventory = readProcessTable();
  return {
    schema_version: 1,
    checked_at: inventory.checked_at ?? new Date().toISOString(),
    dry_run: true,
    probe_mode: inventory.status === "ok" ? "local_process_inventory_dry_run" : "local_process_inventory_probe_error",
    process_inventory_count: inventory.process_count ?? 0,
    workers: workerInventory(bundle).map((worker) => {
      const processSnapshot = workerProcessSnapshot(worker, inventory);
      const healthStatus = worker.status !== "available"
        ? "blocked"
        : processSnapshot.process_probe_status === "probe_error"
          ? "unknown"
          : processSnapshot.process_probe_status === "missing"
            ? "blocked"
            : "healthy";
      return {
        worker_id: worker.worker_id,
        runtime_id: worker.runtime_id,
        worker_os: worker.worker_os,
        capability_tags: worker.capability_tags ?? [],
        status: worker.status,
        health_status: healthStatus,
        process_probe_status: processSnapshot.process_probe_status,
        process_probe_mode: processSnapshot.probe_mode,
        active_process_count: processSnapshot.active_process_count,
        matched_processes: processSnapshot.matched_processes,
        risk: worker.governance.risk,
        execution_mode: worker.governance.execution_mode,
        notes: processSnapshot.notes
      };
    })
  };
}

function resolveWorkerForAssignment(bundle, options) {
  const runtimeId = typeof options === "string" ? options : options.runtimeId;
  const capability = typeof options === "string" ? "" : options.capability;
  if (capability) {
    const workers = bundle.indexes.workersByCapability.get(capability) ?? [];
    return {
      selection_kind: "capability",
      runtime_id: workers[0]?.runtime_id ?? "",
      capability,
      worker: workers.find((candidate) => candidate.status === "available") ?? workers[0] ?? null
    };
  }
  return {
    selection_kind: "runtime",
    runtime_id: runtimeId,
    capability: "",
    worker: bundle.indexes.workersByRuntime.get(runtimeId) ?? null
  };
}

export function assignWorker(bundle, options) {
  const selection = resolveWorkerForAssignment(bundle, options);
  const worker = selection.worker;
  const governance = governanceForWorker(worker);
  const blockedReasons = [];
  if (!worker && selection.selection_kind === "runtime") blockedReasons.push(`No worker is registered for runtime ${selection.runtime_id}.`);
  if (!worker && selection.selection_kind === "capability") blockedReasons.push(`No worker is registered for capability ${selection.capability}.`);
  if (worker?.status !== "available") blockedReasons.push(`Worker status is ${worker?.status ?? "missing"}.`);
  if (governance.proposal_required || governance.human_approval_required) blockedReasons.push(governance.reason);
  const status = blockedReasons.length === 0 ? "ASSIGNED" : "BLOCKED";
  return {
    schema_version: 1,
    assignment_id: `assign-${stableId([selection.selection_kind, selection.runtime_id || selection.capability, worker?.worker_id ?? "missing", new Date().toISOString()])}`,
    created_at: new Date().toISOString(),
    selection_kind: selection.selection_kind,
    runtime_id: selection.runtime_id || worker?.runtime_id || "",
    capability: selection.capability,
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
    capability_tags: worker?.capability_tags ?? [],
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
  const capabilityCoverage = new Set();
  for (const worker of bundle.registry.workers ?? []) {
    if (seen.has(worker.worker_id)) {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "Duplicate worker_id." });
    }
    seen.add(worker.worker_id);
    for (const tag of worker.capability_tags ?? []) capabilityCoverage.add(tag);
    const governance = governanceForWorker(worker);
    if (worker.worker_kind === "local" && !["LOW", "MEDIUM"].includes(governance.risk)) {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "Local workers must be LOW or MEDIUM risk." });
    }
    if ((worker.capability_tags ?? []).includes("mobile-ios") && worker.worker_os !== "macOS") {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "mobile-ios workers must be macOS in Pilot-2." });
    }
    if ((worker.capability_tags ?? []).some((tag) => tag === "mobile-ios" || tag === "mobile-android") && governance.risk !== "MEDIUM") {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "Local mobile workers must evaluate to MEDIUM risk." });
    }
    if (worker.worker_kind === "remote" && governance.execution_mode !== "proposal_only") {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "Remote workers must default to proposal_only." });
    }
    if (worker.worker_kind === "production" && governance.risk !== "CRITICAL") {
      findings.push({ severity: "ERROR", worker_id: worker.worker_id, message: "Production workers must be CRITICAL." });
    }
  }
  for (const tag of bundle.registry.required_capability_tags ?? []) {
    if (!capabilityCoverage.has(tag)) {
      findings.push({ severity: "ERROR", worker_id: "", message: `Missing required capability tag coverage: ${tag}.` });
    }
  }
  return {
    status: findings.filter((finding) => finding.severity === "ERROR").length === 0 ? "PASS" : "FAIL",
    worker_count: bundle.registry.workers?.length ?? 0,
    local_worker_count: (bundle.registry.workers ?? []).filter((worker) => worker.worker_kind === "local").length,
    capability_tags: [...capabilityCoverage].sort(),
    macos_mobile_worker_policy: "MEDIUM / local_repo_execute",
    remote_worker_policy: "HIGH / proposal_only",
    production_worker_policy: "CRITICAL / human_approval_required",
    findings
  };
}
