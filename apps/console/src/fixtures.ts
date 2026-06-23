export const consoleFixture = {
  "generated_from": "autopilot executor local fixtures",
  "data_sources": [
    "runtime/global/platform-state.json",
    "runtime/global/roadmap-memory.json",
    "runtime/projects/jinhu-smart-park/project-state.json",
    "packages/runtime-center/examples/runtime-providers.example.json",
    "packages/runtime-center/examples/runtime-profiles.example.json",
    "packages/skill-router/registry/skill-registry.json"
  ],
  "dashboard": {
    "platform_status": "GO",
    "current_stage": "V4-K Console Read-Only preparation",
    "next_stage": "V4-K Console Read-Only MVP",
    "next_action": "Prepare V4-K Console Read-Only MVP",
    "safety_mode": "read-only"
  },
  "projects": [
    {
      "project_id": "jinhu-smart-park",
      "doctor_status": "GO",
      "repo_clean": "yes",
      "memory_dir": "runtime/projects/jinhu-smart-park",
      "queue_status_counts": {
        "AUDITED": 35,
        "BLOCKED": 4
      }
    }
  ],
  "agents": [
    {
      "agent_id": "autopilot-runner",
      "lane": "platform",
      "status": "available",
      "mode": "max_steps_1"
    },
    {
      "agent_id": "planning-center",
      "lane": "planning",
      "status": "available",
      "mode": "dry_run"
    },
    {
      "agent_id": "managed-project-agents",
      "lane": "jinhu-smart-park",
      "status": "disabled_from_console",
      "mode": "proposal_only"
    }
  ],
  "skills": [
    "code_development",
    "document_generation",
    "spreadsheet_analysis",
    "slide_generation",
    "image_generation",
    "pdf_processing",
    "web_research",
    "data_integration",
    "validation_testing",
    "evolution_observer"
  ],
  "runtime": {
    "provider_count": 6,
    "profile_count": 6,
    "credential_reference_count": 6,
    "credential_values_read": "no",
    "external_service_calls": "disabled"
  },
  "planning": {
    "planning_output_id": "planning-output-ba55912053",
    "selected_action": "Prepare V4-K Console Read-Only MVP",
    "target_package": "apps/console",
    "risk": "MEDIUM",
    "approval_required": false
  },
  "evolution": {
    "mode": "read-only placeholder",
    "source": "packages/evolution-center",
    "open_improvements": "from future observer memory"
  },
  "discovery": {
    "mode": "fixture/manual-manifest",
    "source": "packages/discovery-engine/examples",
    "external_crawling": "disabled"
  },
  "memory": {
    "global_context_files": 6,
    "project_contexts": 1,
    "active_project": "jinhu-smart-park"
  }
} as const;

export type ConsoleFixture = typeof consoleFixture;
