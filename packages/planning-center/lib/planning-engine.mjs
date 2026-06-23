import { createHash } from "node:crypto";

function outputId(request) {
  const hash = createHash("sha1")
    .update(JSON.stringify({
      request_id: request.request_id,
      goal: request.goal,
      created_at: request.created_at
    }))
    .digest("hex")
    .slice(0, 10);
  return `planning-output-${hash}`;
}

function runtimeCenterReady(inputs) {
  return Boolean(inputs.packages?.runtime_center_exists)
    && Number(inputs.packages?.runtime_providers?.length ?? 0) >= 6
    && Number(inputs.packages?.runtime_profiles?.length ?? 0) >= 6
    && Boolean(inputs.docs?.runtime_center_prd_present);
}

function currentStage(inputs) {
  const extractionCompleted = Boolean(inputs.closure_report?.extraction_completed);
  const remoteExecuteCompleted = Boolean(inputs.closure_report?.remote_execute_completed);
  const runtimeCenterBootstrapped = runtimeCenterReady(inputs);
  return {
    stage_name: runtimeCenterBootstrapped
      ? "V4-I Agent Runtime Center"
      : "Post-extraction V4 bootstrap",
    extraction_completed: extractionCompleted,
    remote_execute_completed: remoteExecuteCompleted,
    next_stage: "V4-I Agent Runtime Center",
    runtime_center_bootstrapped: runtimeCenterBootstrapped,
    planning_center_exists: Boolean(inputs.packages?.planning_center_exists),
    managed_project_doctor: inputs.runtime_memory?.project_state?.doctor_status ?? "unknown"
  };
}

function bootstrapRuntimeCenterAction() {
  return {
    title: "Bootstrap V4-I Agent Runtime Center MVP",
    reason: "Extraction and Remote Execute are complete; Runtime Center is the next V4 platform capability and must define providers, runtime profiles, credential references, and dry-run health checks.",
    target_project: "anksen-agent-studio",
    target_package: "packages/runtime-center",
    expected_files: [
      "packages/runtime-center/schemas/runtime-provider.schema.json",
      "packages/runtime-center/schemas/runtime-profile.schema.json",
      "packages/runtime-center/schemas/credential_reference.schema.json",
      "packages/runtime-center/examples/runtime-providers.example.json",
      "packages/runtime-center/examples/runtime-profiles.example.json",
      "packages/runtime-center/bin/runtime-health-check.mjs",
      "docs/release/AGENT_RUNTIME_CENTER_PRD.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/runtime-center/bin/runtime-health-check.mjs --dry-run",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "proposal_only"
  };
}

function hardenRuntimeCenterAction() {
  return {
    title: "Harden V4-I Agent Runtime Center routing and health gates",
    reason: "Runtime Center MVP exists; the next V4 step is to convert provider/profile metadata into runtime selection, health-gate evidence, and Planning Center driven next-action proposals before any active runtime execution.",
    target_project: "anksen-agent-studio",
    target_package: "packages/runtime-center",
    expected_files: [
      "packages/runtime-center/bin/runtime-health-check.mjs",
      "packages/runtime-center/examples/runtime-profiles.example.json",
      "packages/skill-router/registry/skill-registry.json",
      "docs/release/AGENT_RUNTIME_CENTER_PRD.md",
      "docs/release/AGENT_STUDIO_V4_ROADMAP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/runtime-center/bin/runtime-health-check.mjs --dry-run",
      "node packages/orchestrator-core/bin/studio.mjs plan --goal \"继续推进 V4\" --dry-run",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "proposal_only"
  };
}

export function buildPlanningOutput(request) {
  const stage = currentStage(request.inputs ?? {});
  const action = stage.runtime_center_bootstrapped
    ? hardenRuntimeCenterAction()
    : bootstrapRuntimeCenterAction();
  const stopCondition = "STOP: Planning Center generated one next action. Autopilot max_steps=1; no Agent, deploy, production operation, credential read, or managed-project write is allowed.";

  return {
    schema_version: 1,
    planning_output_id: outputId(request),
    source_request_id: request.request_id,
    goal: request.goal,
    current_stage: stage,
    next_action: action,
    reason: action.reason,
    target_project: action.target_project,
    target_package: action.target_package,
    expected_files: action.expected_files,
    validation_commands: action.validation_commands,
    risk: action.risk,
    approval_required: action.approval_required,
    execution_mode: action.execution_mode,
    stop_condition: stopCondition
  };
}
