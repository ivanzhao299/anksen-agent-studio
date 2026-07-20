# ANKSEN Studio Business Application Model

## Decision

ANKSEN Studio is one control plane with multiple business applications. Business applications and domains are not Agent lanes.

The currently confirmed product hierarchy is:

```text
ANKSEN Studio
├── Software Factory
│   └── Software Engineering
├── Video Factory
│   └── Video Production
└── Smart Park ERP
    ├── Strategy Execution
    ├── Human Resources
    └── Finance Management
```

This hierarchy restores the applications explicitly recorded by the user. Additional Smart Park ERP modules must not be inferred from the current Smart Park repository and presented as user-approved scope. They require a separate product decision.

## Layer boundaries

| Layer | Responsibility | Example |
| --- | --- | --- |
| Application | Product entry point and business ownership boundary | Smart Park ERP |
| Business domain | Professional process boundary | Strategy Execution |
| Workflow | Ordered, dependent business stages | goal clarification → KPI model → initiative cascade → review |
| Business Skill | Domain capability required by a stage | `strategy_kpi_modeling` |
| Execution Skill | Tool/runtime capability used to perform it | `spreadsheet_analysis` |
| Agent | Stage responsibility selected from the Agent Registry | `agent-2` |
| Runner | Online execution capacity selected from the Worker Registry | spreadsheet Runner |
| Kernel | Persistent Goal, Task Graph, Scheduler, Attempt, Lease and report source of truth | Autonomous Kernel |

Applications do not receive independent Planner, Scheduler, Worker, or Kernel implementations. Every compiled business workflow is submitted to the existing Autonomous Kernel.

## Current runtime truth

- Software Engineering is runnable through the existing controlled local Runner.
- Human Resources has a runnable document-and-validation workflow.
- Strategy Execution and Finance Management require `spreadsheet_analysis`; they remain blocked until a matching online Runner is registered.
- Video Production requires media-specific online capacity. The current implementation exposes the missing capability rather than claiming the application is operational.
- Real Codex remains governed separately by the Activation Gate. Domain selection does not bypass runtime policy, approval, fencing, or feature flags.

## Source of truth

The executable catalog is defined in `packages/domain-center/lib/domain-center.mjs`. It contains:

- application-to-domain ownership;
- domain keywords and explicit selection;
- professional Skill Packs;
- Workflow stages and dependencies;
- business Skill to execution Skill mapping;
- dynamic Agent and Runner resolution.

The Console consumes this registry directly. Static UI-only domain cards are not allowed.
