export const consoleFixture = {
  generated_from: "local read-only V4 console fixtures",
  generated_at: "2026-06-24T00:00:00.000+08:00",
  data_policy: {
    storage: "static fixture snapshot",
    database: "not connected",
    external_services: "not called",
    credential_values: "not read",
    managed_project_writes: "disabled"
  },
  data_sources: [
    "runtime/global/platform-state.json",
    "runtime/global/roadmap-memory.json",
    "runtime/global/codex-context-index.json",
    "runtime/projects/jinhu-smart-park/project-state.json",
    "packages/project-connector/examples/*.json",
    "packages/runtime-center/examples/*.json",
    "packages/runtime-adapters/examples/*.json",
    "packages/credential-vault/examples/*.json",
    "packages/governance-center/examples/*.json",
    "packages/planning-center/examples/*.json",
    "autopilot-runs/*.json",
    "packages/evolution-center/examples/state.example.json",
    "packages/discovery-engine/examples/discovery-state.example.json"
  ],
  dashboard: {
    platform_status: "GO",
    current_stage: "V4-O Production Operations Center approval gate",
    next_stage: "Await explicit approval for V4-O Production Operations Center implementation",
    next_action: "Await explicit approval for V4-O Production Operations Center implementation",
    next_action_risk: "HIGH",
    next_action_execution_mode: "blocked",
    managed_project_count: 1,
    completed_v4_milestones: 8,
    release_doc_count: 18,
    schema_or_example_count: 75,
    safety_mode: "read-only"
  },
  modules: [
    {
      id: "dashboard",
      title: "Dashboard",
      status: "ready",
      risk: "LOW",
      source: "runtime/global/platform-state.json",
      summary: "Aggregates V4 platform status, next action, safety mode, and module readiness.",
      metrics: [
        { label: "Platform", value: "GO" },
        { label: "Stage", value: "V4-O approval gate" },
        { label: "Completed milestones", value: "8" }
      ]
    },
    {
      id: "projects",
      title: "Projects",
      status: "ready",
      risk: "MEDIUM",
      source: "runtime/projects/jinhu-smart-park/project-state.json",
      summary: "Shows managed project health as context only; project writes stay disabled.",
      metrics: [
        { label: "Managed projects", value: "1" },
        { label: "Doctor", value: "GO" },
        { label: "Repo clean", value: "yes" }
      ]
    },
    {
      id: "projectConnector",
      title: "Project Connector / Stack Detector / Debug Specialist",
      status: "ready",
      risk: "MEDIUM",
      source: "packages/project-connector/examples",
      summary: "Displays project intake, stack probes, command detector output, and debug fixture classification.",
      metrics: [
        { label: "Stack probes", value: "8" },
        { label: "Detected commands", value: "7" },
        { label: "Debug class", value: "type" }
      ]
    },
    {
      id: "runtimeCenter",
      title: "Runtime Center",
      status: "ready",
      risk: "MEDIUM",
      source: "packages/runtime-center/examples",
      summary: "Shows runtime providers, profiles, budgets, and credential-reference presence without probes.",
      metrics: [
        { label: "Providers", value: "6" },
        { label: "Profiles", value: "6" },
        { label: "Network probes", value: "disabled" }
      ]
    },
    {
      id: "runtimeAdapters",
      title: "Runtime Adapters",
      status: "ready",
      risk: "MEDIUM",
      source: "packages/runtime-adapters/examples/runtime-adapters.example.json",
      summary: "Lists adapter metadata and invoke modes; invocation remains plan-only.",
      metrics: [
        { label: "Adapters", value: "6" },
        { label: "Remote/high risk", value: "1" },
        { label: "Model calls", value: "disabled" }
      ]
    },
    {
      id: "credentialVault",
      title: "Credential Vault",
      status: "ready",
      risk: "MEDIUM",
      source: "packages/credential-vault/examples/credential-references.example.json",
      summary: "Shows credential references and reference types without reading secret values.",
      metrics: [
        { label: "References", value: "6" },
        { label: "Reference types", value: "4" },
        { label: "Secret values", value: "not read" }
      ]
    },
    {
      id: "governance",
      title: "Governance Center",
      status: "ready",
      risk: "MEDIUM",
      source: "packages/governance-center/examples",
      summary: "Shows risk matrix, approval policy, and release gates that block unsafe categories.",
      metrics: [
        { label: "Risk levels", value: "4" },
        { label: "Release gates", value: "8" },
        { label: "Expected blocks", value: "5" }
      ]
    },
    {
      id: "planning",
      title: "Planning Center",
      status: "ready",
      risk: "HIGH",
      source: "runtime/global/roadmap-memory.json",
      summary: "Shows the current next action and why V4-O must wait for explicit approval.",
      metrics: [
        { label: "Current stage", value: "V4-O approval gate" },
        { label: "Next risk", value: "HIGH" },
        { label: "Approval", value: "required" }
      ]
    },
    {
      id: "autopilot",
      title: "Autopilot Runs",
      status: "ready",
      risk: "MEDIUM",
      source: "autopilot-runs",
      summary: "Shows single-step run history and whether execution was local, proposal-only, or blocked.",
      metrics: [
        { label: "Run records", value: "8" },
        { label: "Local execute runs", value: "3" },
        { label: "Latest mode", value: "proposal_only" }
      ]
    },
    {
      id: "memory",
      title: "Memory / Context",
      status: "ready",
      risk: "LOW",
      source: "runtime/global and runtime/projects",
      summary: "Shows global context files, project memory, required reading, and startup commands.",
      metrics: [
        { label: "Global files", value: "6" },
        { label: "Project contexts", value: "1" },
        { label: "Startup", value: "context summary" }
      ]
    },
    {
      id: "evolutionDiscovery",
      title: "Evolution / Discovery",
      status: "ready",
      risk: "LOW",
      source: "packages/evolution-center and packages/discovery-engine",
      summary: "Shows observer maturity and discovery fixture state; real crawling remains disabled.",
      metrics: [
        { label: "Maturity", value: "95/98" },
        { label: "Open improvements", value: "4" },
        { label: "Discovery mode", value: "dry-run" }
      ]
    }
  ],
  projects: [
    {
      project_id: "jinhu-smart-park",
      display_name: "Jinhu Smart Park",
      connector_status: "available",
      doctor_status: "GO",
      repo_branch: "main",
      repo_clean: "yes",
      task_count: 39,
      queue_status_counts: {
        AUDITED: 35,
        BLOCKED: 4
      },
      event_file_count: 180,
      memory_dir: "runtime/projects/jinhu-smart-park",
      write_policy: "disabled",
      deploy_policy: "forbidden",
      production_operation_policy: "forbidden"
    }
  ],
  project_connector: {
    intake: {
      supported_sources: ["local_path", "git_url", "zip_placeholder", "repo_metadata"],
      active_project: "jinhu-smart-park",
      project_exists: true,
      git_metadata_visible: true,
      write_mode: "disabled"
    },
    stack_detector: {
      probes: [
        "package.json",
        "pnpm workspace",
        "Next.js",
        "NestJS",
        "TypeScript",
        "Prisma/PostgreSQL",
        "Docker",
        "CI/CD"
      ],
      detected_stack: [
        "Next.js App Router",
        "React",
        "NestJS API",
        "TypeScript",
        "PostgreSQL",
        "Docker deployment scripts",
        "Agent Orchestrator project state"
      ]
    },
    command_detector: {
      command_execution: "disabled",
      commands: [
        "pnpm install",
        "pnpm typecheck",
        "pnpm lint",
        "pnpm test",
        "pnpm build",
        "pnpm dev",
        "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor"
      ]
    },
    debug_specialist: {
      fixture: "packages/project-connector/examples/debug-error.example.log",
      error_class: "type",
      severity: "MEDIUM",
      execution_mode: "proposal_only"
    }
  },
  runtime_center: {
    providers: ["openai", "anthropic", "google", "openhands", "aider", "local-runtime"],
    profiles: ["codex-cli", "claude-code", "gemini-cli", "openhands", "aider", "local-agent"],
    health_mode: "dry-run metadata only",
    credential_reference_count: 6,
    network_probes: "disabled",
    external_service_calls: "disabled"
  },
  runtime_adapters: {
    adapters: [
      { adapter_id: "codex-cli", invoke_mode: "cli", risk: "MEDIUM", credential_reference_required: true, network_required: true },
      { adapter_id: "claude-code", invoke_mode: "cli", risk: "MEDIUM", credential_reference_required: true, network_required: true },
      { adapter_id: "gemini-cli", invoke_mode: "cli", risk: "MEDIUM", credential_reference_required: true, network_required: true },
      { adapter_id: "openhands", invoke_mode: "remote-worker", risk: "HIGH", credential_reference_required: true, network_required: true },
      { adapter_id: "aider", invoke_mode: "cli", risk: "MEDIUM", credential_reference_required: true, network_required: true },
      { adapter_id: "local-agent", invoke_mode: "cli", risk: "LOW", credential_reference_required: false, network_required: false }
    ],
    invocation_policy: "invoke-plan only",
    model_invocation: "disabled"
  },
  credential_vault: {
    reference_count: 6,
    reference_types: ["vault_path", "env_ref", "keychain_ref", "external_vault_ref"],
    providers: ["openai", "anthropic", "google", "openhands", "aider", "local-runtime"],
    secret_values_read: "no",
    env_read: "no",
    keychain_read: "no",
    external_vault_read: "no"
  },
  governance: {
    policy_id: "governance-policy-v4-m-unified",
    approval_matrix: [
      { risk: "LOW", automation_mode: "automatic_execute" },
      { risk: "MEDIUM", automation_mode: "autopilot_execute" },
      { risk: "HIGH", automation_mode: "proposal_only" },
      { risk: "CRITICAL", automation_mode: "human_approval_required" }
    ],
    release_gates: {
      total: 8,
      pass: 3,
      expected_block: 5,
      blocked_categories: [
        "managed_project_write",
        "deploy",
        "production_operation",
        "server_access",
        "credential_value_access"
      ]
    }
  },
  planning: {
    current_stage: "V4-O Production Operations Center approval gate",
    next_action: "Await explicit approval for V4-O Production Operations Center implementation",
    target_project: "anksen-agent-studio",
    target_package: "docs/release",
    risk: "HIGH",
    approval_required: true,
    execution_mode: "blocked",
    stop_condition: "Autopilot max_steps=1; no Agent, deploy, production operation, credential read, or managed-project write is allowed."
  },
  autopilot: {
    max_steps: 1,
    latest_run_id: "autopilot-run-2026-06-23T155807637Z-53456a6a",
    latest_execution_mode: "proposal_only",
    latest_validation: "PROPOSAL_ONLY",
    run_records: [
      { run_id: "autopilot-run-2026-06-23T141408419Z-99436735", mode: "local_repo_execute", title: "Prepare V4-K Console Read-Only MVP", validation: "PASS" },
      { run_id: "autopilot-run-2026-06-23T143345148Z-4a23ba06", mode: "local_repo_execute", title: "Prepare V4-L Multi-Project Workspace", validation: "PASS" },
      { run_id: "autopilot-run-2026-06-23T144920143Z-3868db72", mode: "proposal_only", title: "Prepare V4-M Governance and Release Gates", validation: "PROPOSAL_ONLY" },
      { run_id: "autopilot-run-2026-06-23T155807637Z-53456a6a", mode: "proposal_only", title: "Prepare V4-O Production Operations Center Proposal", validation: "PROPOSAL_ONLY" }
    ]
  },
  memory_context: {
    startup_command: "node packages/orchestrator-core/bin/studio.mjs context summary",
    global_context_files: [
      "runtime/global/platform-state.json",
      "runtime/global/roadmap-memory.json",
      "runtime/global/decision-log.json",
      "runtime/global/codex-context-index.json",
      "runtime/global/codex-startup.md",
      "runtime/global/handoff-summary.md"
    ],
    project_contexts: ["runtime/projects/jinhu-smart-park"],
    required_reading: [
      "runtime/global/codex-startup.md",
      "runtime/global/handoff-summary.md",
      "runtime/global/platform-state.json",
      "runtime/global/roadmap-memory.json",
      "runtime/projects/jinhu-smart-park/handoff-summary.md",
      "README.md"
    ]
  },
  evolution_discovery: {
    evolution: {
      maturity_score: 95,
      target_score: 98,
      status: "observing",
      open_improvements: 4,
      resolved_improvements: 1
    },
    discovery: {
      authorization_status: "AUTHORIZED_FIXTURE_ONLY",
      last_run_mode: "dry-run",
      last_risk_level: "LOW",
      external_crawling: "disabled"
    }
  },
  safety_boundaries: [
    "Do not modify jinhu-smart-park unless an explicit proposal is approved.",
    "Do not execute Agents from console views.",
    "Do not deploy.",
    "Do not run production migration, seed, reset, cleanup, or production operations.",
    "Do not read or write real credential values.",
    "Use local fixtures and runtime memory only."
  ]
} as const;

export type ConsoleFixture = typeof consoleFixture;
