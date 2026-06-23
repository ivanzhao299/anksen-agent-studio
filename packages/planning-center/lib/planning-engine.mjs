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

function credentialVaultReady(inputs) {
  return Boolean(inputs.packages?.credential_vault_exists)
    && Number(inputs.packages?.credential_references?.length ?? 0) >= 6
    && Boolean(inputs.docs?.credential_vault_mvp_present);
}

function autopilotRunnerReady(inputs) {
  return Boolean(inputs.autopilot_runs?.autopilot_runner_completed);
}

function consoleReadOnlyReady(inputs) {
  return Boolean(inputs.packages?.console_read_only_mvp_exists);
}

function multiProjectWorkspaceReady(inputs) {
  return Boolean(inputs.packages?.multi_project_workspace_exists);
}

function currentStage(inputs) {
  const extractionCompleted = Boolean(inputs.closure_report?.extraction_completed);
  const remoteExecuteCompleted = Boolean(inputs.closure_report?.remote_execute_completed);
  const runtimeCenterBootstrapped = runtimeCenterReady(inputs);
  const credentialVaultCompleted = credentialVaultReady(inputs);
  const autopilotRunnerCompleted = autopilotRunnerReady(inputs);
  const consoleReadOnlyCompleted = consoleReadOnlyReady(inputs);
  const multiProjectWorkspaceCompleted = multiProjectWorkspaceReady(inputs);
  return {
    stage_name: multiProjectWorkspaceCompleted
      ? "V4-M Governance and Release Gates preparation"
      : consoleReadOnlyCompleted
      ? "V4-L Multi-Project Workspace preparation"
      : autopilotRunnerCompleted
      ? "V4-K Console Read-Only preparation"
      : credentialVaultCompleted
        ? "V4-J Autopilot Runner"
        : runtimeCenterBootstrapped
          ? "V4-J Credential Vault"
          : "Post-extraction V4 bootstrap",
    extraction_completed: extractionCompleted,
    remote_execute_completed: remoteExecuteCompleted,
    next_stage: multiProjectWorkspaceCompleted
      ? "V4-M Governance and Release Gates"
      : consoleReadOnlyCompleted
      ? "V4-L Multi-Project Workspace"
      : autopilotRunnerCompleted
      ? "V4-K Console Read-Only MVP"
      : credentialVaultCompleted
        ? "V4-J Autopilot Runner"
        : runtimeCenterBootstrapped
          ? "V4-J Credential Vault"
          : "V4-I Agent Runtime Center",
    runtime_center_bootstrapped: runtimeCenterBootstrapped,
    credential_vault_completed: credentialVaultCompleted,
    autopilot_runner_completed: autopilotRunnerCompleted,
    console_read_only_completed: consoleReadOnlyCompleted,
    multi_project_workspace_completed: multiProjectWorkspaceCompleted,
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

function credentialVaultAction() {
  return {
    title: "Add V4-J Credential Vault MVP",
    reason: "Runtime Center can route and report health, so the next safe V4 action is a credential-reference layer that stores references only and lets Runtime Center detect auth presence without reading secret values.",
    target_project: "anksen-agent-studio",
    target_package: "packages/credential-vault",
    expected_files: [
      "packages/credential-vault/schemas/credential.schema.json",
      "packages/credential-vault/schemas/secret-reference.schema.json",
      "packages/credential-vault/schemas/vault-policy.schema.json",
      "packages/credential-vault/examples/credential-references.example.json",
      "packages/credential-vault/examples/vault-policy.example.json",
      "packages/orchestrator-core/bin/studio.mjs",
      "packages/runtime-center/lib/runtime-center-utils.mjs",
      "docs/release/CREDENTIAL_VAULT_MVP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs credential validate --dry-run",
      "node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "proposal_only"
  };
}

function autopilotRunnerAction() {
  return {
    title: "Add V4-J Autopilot Runner",
    reason: "Credential references and Runtime Center health gates are in place; the next V4 step is to let Autopilot execute one safe local repository action, validate it, commit it, and write the next recommendation.",
    target_project: "anksen-agent-studio",
    target_package: "packages/orchestrator-core",
    expected_files: [
      "packages/orchestrator-core/bin/studio.mjs",
      "packages/planning-center/lib/planning-engine.mjs",
      "docs/release/AUTOPILOT_RUNNER_MVP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs autopilot run --goal \"继续推进 V4\" --dry-run",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "local_repo_execute"
  };
}

function consoleReadOnlyAction() {
  return {
    title: "Prepare V4-K Console Read-Only MVP",
    reason: "Autopilot Runner is available; the next safe V4 step is to prepare a read-only console implementation plan before adding mutation paths.",
    target_project: "anksen-agent-studio",
    target_package: "apps/console",
    expected_files: [
      "apps/console/src/index.ts",
      "docs/release/AGENT_STUDIO_CONSOLE_PRD.md",
      "docs/release/AGENT_STUDIO_CONSOLE_ARCHITECTURE.md",
      "docs/release/AGENT_STUDIO_V4_ROADMAP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs autopilot run --goal \"继续推进 V4\" --dry-run",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "local_repo_execute"
  };
}

function multiProjectWorkspaceAction() {
  return {
    title: "Prepare V4-L Multi-Project Workspace",
    reason: "The read-only Console MVP exists; the next safe V4 step is to prepare multi-project context and connector views without adding mutation paths.",
    target_project: "anksen-agent-studio",
    target_package: "packages/project-connector",
    expected_files: [
      "packages/project-connector/src/index.ts",
      "runtime/global/codex-context-index.json",
      "docs/release/AGENT_STUDIO_V4_ROADMAP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs context summary",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "local_repo_execute"
  };
}

function governanceReleaseGatesAction() {
  return {
    title: "Prepare V4-M Governance and Release Gates",
    reason: "The multi-project workspace contracts exist; the next safe V4 step is to define approval, audit, and release gate policy bundles without enabling deploy or production operations.",
    target_project: "anksen-agent-studio",
    target_package: "packages/production-ops",
    expected_files: [
      "packages/production-ops/src/index.ts",
      "docs/release/AGENT_STUDIO_V4_ROADMAP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs context summary",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "proposal_only"
  };
}

export function buildPlanningOutput(request) {
  const stage = currentStage(request.inputs ?? {});
  const action = !stage.runtime_center_bootstrapped
    ? bootstrapRuntimeCenterAction()
    : !stage.credential_vault_completed
      ? credentialVaultAction()
      : !stage.autopilot_runner_completed
        ? autopilotRunnerAction()
        : !stage.console_read_only_completed
          ? consoleReadOnlyAction()
          : !stage.multi_project_workspace_completed
            ? multiProjectWorkspaceAction()
            : governanceReleaseGatesAction();
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
