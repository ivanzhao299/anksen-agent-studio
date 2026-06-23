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

function batchId(request) {
  const hash = createHash("sha1")
    .update(JSON.stringify({
      request_id: request.request_id,
      goal: request.goal,
      created_at: request.created_at,
      kind: "batch_plan"
    }))
    .digest("hex")
    .slice(0, 10);
  return `batch-plan-${hash}`;
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

function governanceReleaseGatesReady(inputs) {
  return Boolean(inputs.packages?.governance_release_gates_exists)
    && Boolean(inputs.packages?.governance_center_exists);
}

function platformHardeningReviewReady(inputs) {
  return Boolean(inputs.docs?.platform_hardening_review_present);
}

function productionOperationsCenterProposalReady(inputs) {
  return Boolean(inputs.docs?.production_operations_center_proposal_present);
}

function productionOperationsCenterDryRunReady(inputs) {
  return Boolean(inputs.docs?.production_operations_center_dry_run_mvp_present)
    && Boolean(inputs.packages?.production_ops_dry_run_exists);
}

function autopilotContinuousModeReady(inputs) {
  return Boolean(inputs.docs?.autopilot_continuous_mode_mvp_present);
}

function realWorkerRuntimeSmokeProposalReady(inputs) {
  return Boolean(inputs.docs?.real_worker_runtime_smoke_proposal_present);
}

function consoleOperableReady(inputs) {
  return Boolean(inputs.docs?.console_operable_read_only_mvp_present)
    && Boolean(inputs.packages?.console_operable_mvp_exists);
}

function goalTargetsV5(request) {
  return /\bV5\b/i.test(String(request.goal ?? ""));
}

function v5Roadmap(inputs) {
  const roadmap = inputs.roadmap?.v5_roadmap;
  return roadmap && Array.isArray(roadmap.stages) ? roadmap : null;
}

function v5MasterPlanReady(inputs) {
  return Boolean(inputs.docs?.v5_master_plan_present)
    && Boolean(inputs.packages?.v5_master_plan_schema_exists)
    && Boolean(v5Roadmap(inputs));
}

function highOrCritical(risk) {
  return risk === "HIGH" || risk === "CRITICAL";
}

function v5StageCompleted(stage) {
  return stage.status === "completed" || stage.completed === true;
}

function nextV5Stage(inputs) {
  const roadmap = v5Roadmap(inputs);
  if (!roadmap) return null;
  return [...roadmap.stages]
    .sort((left, right) => Number(left.order ?? 999) - Number(right.order ?? 999))
    .find((stage) => !v5StageCompleted(stage)) ?? null;
}

function v5CurrentStage(inputs) {
  const stage = nextV5Stage(inputs);
  const roadmap = v5Roadmap(inputs);
  return {
    stage_name: stage ? `${stage.id} ${stage.title}` : "V5 Master Plan complete",
    next_stage: stage ? `${stage.id} ${stage.title}` : "V5 review and portfolio planning",
    extraction_completed: Boolean(inputs.closure_report?.extraction_completed),
    remote_execute_completed: Boolean(inputs.closure_report?.remote_execute_completed),
    v5_master_plan_ready: v5MasterPlanReady(inputs),
    v5_roadmap_present: Boolean(roadmap),
    v5_plan_id: roadmap?.plan_id ?? "",
    v5_current_stage_id: stage?.id ?? "",
    v5_current_stage_order: stage?.order ?? null,
    high_critical_policy: roadmap?.safety_policy?.high_critical_policy ?? "proposal_only",
    managed_project_doctor: inputs.runtime_memory?.project_state?.doctor_status ?? "unknown"
  };
}

function v5MasterPlanAction() {
  return {
    title: "Add V5 Master Plan",
    reason: "V4 continuous mode is complete; Planning Center needs a machine-readable V5 roadmap before Autopilot can continue productization work.",
    target_project: "anksen-agent-studio",
    target_package: "packages/planning-center",
    expected_files: [
      "docs/release/AGENT_STUDIO_V5_MASTER_PLAN.md",
      "runtime/global/v5-roadmap.json",
      "packages/planning-center/schemas/v5-master-plan.schema.json"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs autopilot run --goal \"继续推进 V5\" --dry-run",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "local_repo_execute"
  };
}

function v5ActionFromStage(stage) {
  const risk = stage.risk_level ?? "CRITICAL";
  const executionMode = highOrCritical(risk) ? "proposal_only" : stage.execution_mode ?? "local_repo_execute";
  return {
    title: `Prepare ${stage.id} ${stage.title}`,
    reason: highOrCritical(risk)
      ? `${stage.id} is ${risk} risk in the V5 roadmap, so Planning Center must stop at proposal-only and require review before any execution.`
      : `${stage.id} is the next V5 stage and is within the safe local repository automation band for schemas, examples, docs, and dry-run planning.`,
    target_project: stage.target_project ?? "anksen-agent-studio",
    target_package: stage.target_package ?? "docs/release",
    expected_files: stage.expected_files ?? [],
    validation_commands: stage.validation_commands ?? [
      "pnpm typecheck",
      "pnpm lint:check",
      "git diff --check"
    ],
    risk,
    approval_required: Boolean(stage.approval_required || highOrCritical(risk)),
    execution_mode: executionMode,
    v5_stage_id: stage.id,
    automation_level: highOrCritical(risk) ? "proposal_only" : stage.automation_level ?? "autopilot_execute"
  };
}

function normalizeBatchTask(task) {
  const risk = task.risk ?? "CRITICAL";
  return {
    ...task,
    execution_mode: highOrCritical(risk) ? "proposal_only" : task.execution_mode ?? "local_repo_execute",
    approval_required: Boolean(task.approval_required || highOrCritical(risk)),
    proposal_required: Boolean(task.proposal_required || highOrCritical(risk))
  };
}

function v5BatchTasks() {
  const commonForbiddenPaths = [
    "jinhu-smart-park/**",
    "../jinhu-smart-park/**",
    "examples/jinhu-smart-park/**",
    "runtime/projects/jinhu-smart-park/**",
    "**/.env*",
    "**/*secret*",
    "**/*private_key*",
    "**/*ssh_key*"
  ];
  return [
    normalizeBatchTask({
      task_id: "v5-batch-agent-1-docs-console-manual",
      title: "V5 docs, Console copy, and user manual plan",
      owner_agent: "agent-1",
      target_project: "anksen-agent-studio",
      target_package: "docs/release",
      skill_type: "document_generation",
      runtime: "codex-cli",
      allowed_paths: [
        "docs/release/AGENT_STUDIO_V5_MASTER_PLAN.md",
        "docs/release/V5_*",
        "apps/console/README.md"
      ],
      forbidden_paths: commonForbiddenPaths,
      risk: "LOW",
      dependencies: [],
      validation_commands: [
        "pnpm typecheck",
        "pnpm lint:check",
        "git diff --check"
      ],
      execution_mode: "local_repo_execute",
      objective: "Prepare operator-facing V5 documentation, Console microcopy, and user manual outlines without adding mutation paths."
    }),
    normalizeBatchTask({
      task_id: "v5-batch-agent-2-governance-validation",
      title: "V5 governance, validation, and test matrix",
      owner_agent: "agent-2",
      target_project: "anksen-agent-studio",
      target_package: "packages/governance-center",
      skill_type: "validation_testing",
      runtime: "codex-cli",
      allowed_paths: [
        "packages/governance-center/**",
        "packages/planning-center/schemas/**",
        "docs/release/V5_*GOVERNANCE*",
        "docs/release/V5_*TEST*"
      ],
      forbidden_paths: commonForbiddenPaths,
      risk: "MEDIUM",
      dependencies: [],
      validation_commands: [
        "pnpm typecheck",
        "pnpm lint:check",
        "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
        "git diff --check"
      ],
      execution_mode: "local_repo_execute",
      objective: "Define validation matrix and governance evidence for V5 roadmap work while keeping HIGH/CRITICAL gates proposal-only."
    }),
    normalizeBatchTask({
      task_id: "v5-batch-agent-3-project-runtime-memory",
      title: "V5 project connector, data, and runtime memory plan",
      owner_agent: "agent-3",
      target_project: "anksen-agent-studio",
      target_package: "packages/project-connector",
      skill_type: "schema_inference",
      runtime: "codex-cli",
      allowed_paths: [
        "packages/project-connector/**",
        "runtime/global/**",
        "docs/release/V5_*MULTI_PROJECT*"
      ],
      forbidden_paths: commonForbiddenPaths,
      risk: "MEDIUM",
      dependencies: [],
      validation_commands: [
        "pnpm typecheck",
        "pnpm lint:check",
        "node packages/orchestrator-core/bin/studio.mjs project commands --config examples/jinhu-smart-park/project.config.example.json --dry-run",
        "git diff --check"
      ],
      execution_mode: "local_repo_execute",
      objective: "Prepare read-only multi-project operation schemas and runtime memory links without writing managed projects."
    }),
    normalizeBatchTask({
      task_id: "v5-batch-agent-4-console-ui-entrypoints",
      title: "V5 Console UI and operation entrypoints",
      owner_agent: "agent-4",
      target_project: "anksen-agent-studio",
      target_package: "apps/console",
      skill_type: "code_development",
      runtime: "codex-cli",
      allowed_paths: [
        "apps/console/**",
        "docs/release/V5_ENTERPRISE_CONSOLE_MVP.md"
      ],
      forbidden_paths: commonForbiddenPaths,
      risk: "MEDIUM",
      dependencies: [
        "v5-batch-agent-1-docs-console-manual"
      ],
      validation_commands: [
        "pnpm typecheck",
        "pnpm lint:check",
        "git diff --check"
      ],
      execution_mode: "local_repo_execute",
      objective: "Plan Console operation entrypoints as dry-run descriptors and proposal queues without executing commands."
    }),
    normalizeBatchTask({
      task_id: "v5-batch-agent-5-architecture-runtime-prodops",
      title: "V5 architecture, runtime, and Production Ops proposal",
      owner_agent: "agent-5",
      target_project: "anksen-agent-studio",
      target_package: "docs/release",
      skill_type: "code_development",
      runtime: "codex-cli",
      allowed_paths: [
        "docs/release/V5_*ARCHITECTURE*",
        "docs/release/V5_*RUNTIME*",
        "docs/release/V5_*PRODUCTION*",
        "packages/runtime-adapters/**",
        "packages/production-ops/**"
      ],
      forbidden_paths: commonForbiddenPaths,
      risk: "HIGH",
      dependencies: [
        "v5-batch-agent-2-governance-validation"
      ],
      validation_commands: [
        "pnpm typecheck",
        "pnpm lint:check",
        "node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run",
        "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
        "git diff --check"
      ],
      execution_mode: "proposal_only",
      approval_required: true,
      proposal_required: true,
      objective: "Prepare architecture and Production Ops proposals only; no real Worker, deploy, server access, or production operation."
    })
  ];
}

function buildV5BatchPlan(request, selectedAction) {
  const tasks = v5BatchTasks();
  return {
    batch_id: batchId(request),
    goal: request.goal,
    source_planning_output_id: outputId(request),
    source_action_title: selectedAction.title,
    parallelism: {
      min_tasks: 3,
      max_tasks: 5,
      recommended_parallel: 2,
      max_parallel: 5
    },
    execution_policy: {
      low_medium: "local_repo_execute_allowed",
      high_critical: "proposal_only",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled",
      managed_project_writes: "disabled"
    },
    tasks
  };
}

function buildV5PlanningOutput(request) {
  const inputs = request.inputs ?? {};
  const stage = v5CurrentStage(inputs);
  const nextStage = nextV5Stage(inputs);
  const action = nextStage ? v5ActionFromStage(nextStage) : {
    title: "Review V5 Master Plan",
    reason: "Every V5 stage is marked complete in the roadmap; the next step is roadmap review rather than automatic execution.",
    target_project: "anksen-agent-studio",
    target_package: "docs/release",
    expected_files: [
      "docs/release/AGENT_STUDIO_V5_MASTER_PLAN.md",
      "runtime/global/v5-roadmap.json"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "git diff --check"
    ],
    risk: "LOW",
    approval_required: false,
    execution_mode: "proposal_only"
  };
  const selectedAction = v5MasterPlanReady(inputs) ? action : v5MasterPlanAction();
  const batchPlan = buildV5BatchPlan(request, selectedAction);
  return {
    schema_version: 1,
    planning_output_id: outputId(request),
    source_request_id: request.request_id,
    goal: request.goal,
    current_stage: stage,
    next_action: selectedAction,
    reason: selectedAction.reason,
    target_project: selectedAction.target_project,
    target_package: selectedAction.target_package,
    expected_files: selectedAction.expected_files,
    validation_commands: selectedAction.validation_commands,
    risk: selectedAction.risk,
    approval_required: selectedAction.approval_required,
    execution_mode: highOrCritical(selectedAction.risk) ? "proposal_only" : selectedAction.execution_mode,
    batch_plan: batchPlan,
    stop_condition: "STOP: Planning Center generated one V5 next action. HIGH/CRITICAL stages are proposal-only; no Worker, deploy, production operation, credential value, or managed-project write is allowed."
  };
}

function currentStage(inputs) {
  const extractionCompleted = Boolean(inputs.closure_report?.extraction_completed);
  const remoteExecuteCompleted = Boolean(inputs.closure_report?.remote_execute_completed);
  const runtimeCenterBootstrapped = runtimeCenterReady(inputs);
  const credentialVaultCompleted = credentialVaultReady(inputs);
  const autopilotRunnerCompleted = autopilotRunnerReady(inputs);
  const consoleReadOnlyCompleted = consoleReadOnlyReady(inputs);
  const multiProjectWorkspaceCompleted = multiProjectWorkspaceReady(inputs);
  const governanceReleaseGatesCompleted = governanceReleaseGatesReady(inputs);
  const platformHardeningReviewCompleted = platformHardeningReviewReady(inputs);
  const productionOperationsCenterProposalPrepared = productionOperationsCenterProposalReady(inputs);
  const productionOperationsCenterDryRunCompleted = productionOperationsCenterDryRunReady(inputs);
  const autopilotContinuousModeCompleted = autopilotContinuousModeReady(inputs);
  const realWorkerRuntimeSmokeProposalPrepared = realWorkerRuntimeSmokeProposalReady(inputs);
  const consoleOperableCompleted = consoleOperableReady(inputs);
  return {
    stage_name: consoleOperableCompleted
      ? "V4-R Console operable read-only complete"
      : realWorkerRuntimeSmokeProposalPrepared
      ? "V4-R Console operable preparation"
      : autopilotContinuousModeCompleted
      ? "V4-Q Real Worker Runtime Smoke proposal preparation"
      : productionOperationsCenterDryRunCompleted
      ? "V4-P Autopilot Continuous Mode preparation"
      : productionOperationsCenterProposalPrepared
      ? "V4-O Production Operations Center approval gate"
      : platformHardeningReviewCompleted
      ? "V4-O Production Operations Center proposal preparation"
      : governanceReleaseGatesCompleted
      ? "V4-N Platform Hardening preparation"
      : multiProjectWorkspaceCompleted
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
    next_stage: consoleOperableCompleted
      ? "V4 continuous run summary and review"
      : realWorkerRuntimeSmokeProposalPrepared
      ? "V4-R Console operable read-only controls"
      : autopilotContinuousModeCompleted
      ? "V4-Q Real Worker Runtime Smoke proposal"
      : productionOperationsCenterDryRunCompleted
      ? "V4-P Autopilot Continuous Mode"
      : productionOperationsCenterProposalPrepared
      ? "Await explicit approval for V4-O Production Operations Center implementation"
      : platformHardeningReviewCompleted
      ? "V4-O Production Operations Center Proposal"
      : governanceReleaseGatesCompleted
      ? "V4-N Platform Hardening Review"
      : multiProjectWorkspaceCompleted
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
    governance_release_gates_completed: governanceReleaseGatesCompleted,
    platform_hardening_review_completed: platformHardeningReviewCompleted,
    production_operations_center_proposal_prepared: productionOperationsCenterProposalPrepared,
    production_operations_center_dry_run_completed: productionOperationsCenterDryRunCompleted,
    autopilot_continuous_mode_completed: autopilotContinuousModeCompleted,
    real_worker_runtime_smoke_proposal_prepared: realWorkerRuntimeSmokeProposalPrepared,
    console_operable_completed: consoleOperableCompleted,
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
    reason: "The multi-project workspace contracts exist; the next safe V4 step is to define unified governance, approval, risk, audit, and release gate policy bundles without enabling deploy or production operations.",
    target_project: "anksen-agent-studio",
    target_package: "packages/governance-center",
    expected_files: [
      "packages/governance-center/schemas/governance-policy.schema.json",
      "packages/governance-center/schemas/approval-policy.schema.json",
      "packages/governance-center/schemas/release-gate.schema.json",
      "packages/governance-center/schemas/risk-policy.schema.json",
      "docs/release/AGENT_STUDIO_V4_ROADMAP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
      "node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run",
      "node packages/orchestrator-core/bin/studio.mjs context summary",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "proposal_only"
  };
}

function platformHardeningReviewAction() {
  return {
    title: "Prepare V4-N Platform Hardening Review",
    reason: "Governance and release gates exist; the next safe V4 step is a review proposal for platform hardening, keeping runtime execution, deploy, production operations, and credential values disabled.",
    target_project: "anksen-agent-studio",
    target_package: "docs/release",
    expected_files: [
      "docs/release/AGENT_STUDIO_V4_ROADMAP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
      "node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run",
      "git diff --check"
    ],
    risk: "LOW",
    approval_required: false,
    execution_mode: "proposal_only"
  };
}

function productionOperationsCenterProposalAction() {
  return {
    title: "Prepare V4-O Production Operations Center Proposal",
    reason: "Platform hardening review is complete; the next bounded step is a proposal-only Production Operations Center plan that preserves deploy, production operation, credential value, server access, and managed-project write blocks.",
    target_project: "anksen-agent-studio",
    target_package: "docs/release",
    expected_files: [
      "docs/release/PRODUCTION_OPERATIONS_CENTER_PROPOSAL.md",
      "docs/release/AGENT_STUDIO_V4_ROADMAP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
      "node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run",
      "git diff --check"
    ],
    risk: "HIGH",
    approval_required: false,
    execution_mode: "proposal_only"
  };
}

function productionOperationsCenterApprovalGateAction() {
  return {
    title: "Await explicit approval for V4-O Production Operations Center implementation",
    reason: "The Production Operations Center proposal exists, but the capability touches deploy, production operation, server access, credential value, and managed-project write semantics. It must remain blocked until a separate explicit approval defines an implementation boundary.",
    target_project: "anksen-agent-studio",
    target_package: "docs/release",
    expected_files: [
      "docs/release/PRODUCTION_OPERATIONS_CENTER_PROPOSAL.md",
      "docs/release/AGENT_STUDIO_V4_ROADMAP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
      "node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run",
      "git diff --check"
    ],
    risk: "HIGH",
    approval_required: true,
    execution_mode: "blocked"
  };
}

function productionOperationsCenterDryRunAction() {
  return {
    title: "Add V4-O Production Operations Center Dry-Run MVP",
    reason: "The Production Operations Center proposal exists; the next bounded local repository step is dry-run schemas, examples, CLI plans, and safety checks without server access, deploy, production operations, or credential values.",
    target_project: "anksen-agent-studio",
    target_package: "packages/production-ops",
    expected_files: [
      "packages/production-ops/schemas/server-registry.schema.json",
      "packages/production-ops/examples/server-registry.example.json",
      "packages/orchestrator-core/bin/studio.mjs",
      "docs/release/PRODUCTION_OPERATIONS_CENTER_DRY_RUN_MVP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run",
      "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "local_repo_execute"
  };
}

function autopilotContinuousModeAction() {
  return {
    title: "Add V4-P Autopilot Continuous Mode",
    reason: "Production Ops dry-run is available; the next safe V4 step is a bounded continuous Autopilot mode that runs up to four governed steps, commits each local change, records reports, and stops at HIGH/CRITICAL proposal gates.",
    target_project: "anksen-agent-studio",
    target_package: "packages/orchestrator-core",
    expected_files: [
      "packages/orchestrator-core/bin/studio.mjs",
      "packages/planning-center/lib/planning-engine.mjs",
      "docs/release/AUTOPILOT_CONTINUOUS_MODE_MVP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs autopilot run --goal \"完成 V4 剩余四步\" --dry-run",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "local_repo_execute"
  };
}

function realWorkerRuntimeSmokeAction() {
  return {
    title: "Prepare V4-Q Real Worker Runtime Smoke Proposal",
    reason: "Continuous mode is available, but real worker runtime smoke may involve live workers, model invocation, credentials, server access, or managed project writes. It must stop at a proposal-only gate.",
    target_project: "anksen-agent-studio",
    target_package: "docs/release",
    expected_files: [
      "docs/release/REAL_WORKER_RUNTIME_SMOKE_PROPOSAL.md",
      "docs/release/AGENT_STUDIO_V4_ROADMAP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
      "git diff --check"
    ],
    risk: "HIGH",
    approval_required: false,
    execution_mode: "proposal_only"
  };
}

function consoleOperableAction() {
  return {
    title: "Add V4-R Console operable read-only controls",
    reason: "Real worker runtime smoke remains proposal-only; the next safe local repository step is to make the Console operable for dry-run command planning without adding mutation paths.",
    target_project: "anksen-agent-studio",
    target_package: "apps/console",
    expected_files: [
      "apps/console/src/actions.ts",
      "apps/console/src/view-model.ts",
      "docs/release/CONSOLE_OPERABLE_READ_ONLY_MVP.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "git diff --check"
    ],
    risk: "MEDIUM",
    approval_required: false,
    execution_mode: "local_repo_execute"
  };
}

function v4ContinuousCompleteAction() {
  return {
    title: "Review V4 continuous run summary",
    reason: "The remaining V4 continuous sequence has produced reports, proposals, and safe local repository changes. The next step is review rather than automatic execution.",
    target_project: "anksen-agent-studio",
    target_package: "docs/release",
    expected_files: [
      "docs/release/V4_CONTINUOUS_RUN_SUMMARY.md"
    ],
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "git diff --check"
    ],
    risk: "LOW",
    approval_required: false,
    execution_mode: "proposal_only"
  };
}

export function buildPlanningOutput(request) {
  if (goalTargetsV5(request)) {
    return buildV5PlanningOutput(request);
  }

  const stage = currentStage(request.inputs ?? {});
  const action = stage.console_operable_completed
    ? v4ContinuousCompleteAction()
    : stage.real_worker_runtime_smoke_proposal_prepared
    ? consoleOperableAction()
    : stage.autopilot_continuous_mode_completed
    ? realWorkerRuntimeSmokeAction()
    : stage.production_operations_center_dry_run_completed
    ? autopilotContinuousModeAction()
    : stage.production_operations_center_proposal_prepared
    ? productionOperationsCenterDryRunAction()
    : !stage.runtime_center_bootstrapped
    ? bootstrapRuntimeCenterAction()
    : !stage.credential_vault_completed
      ? credentialVaultAction()
      : !stage.autopilot_runner_completed
        ? autopilotRunnerAction()
        : !stage.console_read_only_completed
          ? consoleReadOnlyAction()
          : !stage.multi_project_workspace_completed
            ? multiProjectWorkspaceAction()
            : !stage.governance_release_gates_completed
              ? governanceReleaseGatesAction()
              : !stage.platform_hardening_review_completed
                ? platformHardeningReviewAction()
                : productionOperationsCenterProposalAction();
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
