# Planning Center API Design

## Objective

Planning Center provides a dedicated planning boundary between Autopilot observation and any executable action. Autopilot supplies a goal plus project/platform context, and Planning Center returns one bounded next action with validation and approval metadata.

The MVP is CLI-first. The API below is the future Console/hosted service contract.

## POST /api/planning/plan

Generates a planning output from a goal and evidence bundle.

### Request

```json
{
  "goal": "继续推进 V4",
  "inputs": {
    "readme": {},
    "docs": {},
    "runtime_memory": {},
    "roadmap": {},
    "closure_report": {},
    "packages": {}
  },
  "constraints": {
    "max_steps": 1,
    "agent_execution": "disabled",
    "managed_project_writes": "disabled",
    "deploy": "disabled",
    "production_operations": "disabled",
    "credential_values": "disabled"
  }
}
```

### Response

```json
{
  "current_stage": {},
  "next_action": {},
  "reason": "why this action is next",
  "target_project": "anksen-agent-studio",
  "target_package": "packages/runtime-center",
  "expected_files": [],
  "validation_commands": [],
  "risk": "MEDIUM",
  "approval_required": false,
  "stop_condition": "STOP: one bounded action generated"
}
```

## POST /api/planning/validate

Validates a planning output against platform policy before Autopilot can persist or propose it.

Validation checks:

- required fields exist
- risk is `LOW`, `MEDIUM`, or `HIGH`
- `HIGH` risk requires approval
- stop condition is present
- forbidden actions are not requested:
  - deploy
  - production migration/seed/reset/cleanup
  - real credential read/write
  - unmanaged project writes
  - unbounded loops

## POST /api/planning/propose

Turns an approved planning output into a platform-side proposal. It must not execute Agents or write managed-project queues/events directly.

Output options:

- Autopilot run record
- project task proposal
- approval request
- Console notification

## Safety Boundaries

- Planning Center is deterministic and evidence-driven in MVP.
- Autopilot may call Planning Center, but it must not bypass Planning Center policy.
- `max_steps` is limited to `1` until approval checkpoints exist.
- No real credential values may be stored or returned.
- Managed project writes remain disabled unless a separate approved project adapter flow is used.
