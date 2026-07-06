# Studio Control Plane Foundation P1

## Scope

This pass turns ANKSEN Agent Studio from a collection of isolated dry-run commands into a first-class local control plane with explicit project attachment, worker control, access enforcement, release consistency, and console-visible machine-readable summaries.

## Delivered Capabilities

### P1-001 Repo Router / Attached Project Execution Foundation

- `studio project bind --config <file> [--dry-run|--apply]`
- `studio project workspace [--dry-run|--apply]`
- `studio project exec-context --project <project_id> --dry-run`

Artifacts:

- `runtime/projects/<project_id>/binding.json`
- `runtime/global/attached-project-workspace.json`

Purpose:

- Make attached project routing explicit instead of implicit.
- Show repo path, branch, write policy, doctor status, runtime memory path, and worktree inventory before execution.

### P1-002 Worker Control Plane MVP

- `studio worker registry --dry-run`
- `studio worker control-plane [--dry-run|--apply]`
- `studio worker heartbeat --dry-run`
- `studio worker dispatch --runtime <id> --dry-run`
- `studio worker dispatch --capability <tag> --dry-run`

Artifact:

- `runtime/global/worker-control-plane.json`

Purpose:

- Productize local worker inventory, governance posture, heartbeat mode, and dispatch routing.

### P1-003 Access Center Hard Enforcement

- `studio access enforcement [--user <username>] [--project <project_id>] [--dry-run|--apply]`

Artifact:

- `runtime/global/access-enforcement.json`

Purpose:

- Convert route and action authorization into a readable, auditable control-plane snapshot.
- Show effective direct-execute risk, project scope, runtime allowlist, route visibility, and action allow/deny reasons.

### P1-004 Release Consistency / Deploy Pipeline

- `studio release consistency [--dry-run|--apply]`

Artifact:

- `runtime/global/release-consistency.json`

Purpose:

- Verify that core control-plane files, console entrypoints, and latest run evidence are aligned before local release or operator handoff.
- Keep deploy and production operations disabled.

### P1-005 Console Workspace Productization

Console now reads:

- `runtime/global/attached-project-workspace.json`
- `runtime/global/worker-control-plane.json`
- `runtime/global/access-enforcement.json`
- `runtime/global/release-consistency.json`
- `runtime/projects/*/binding.json`

Surfaces updated:

- Dashboard
- Projects
- Workers
- Config
- Memory

### P1-006 Attached Project Dispatch Planner

- `studio project dispatch-plan --project <project_id> --text "..." [--user <username>] [--runtime <runtime_id>] [--dry-run|--apply]`

Artifacts:

- `runtime/projects/<project_id>/dispatch-plans/<task_id>.json`

Purpose:

- Link attached project binding, execution context, task candidate, access gate, worker dispatch, proposal state, and queue state into one auditable dispatch record.
- Tell the operator the exact next safe CLI step:
  - create proposal
  - approve / inject into queue
  - execute
  - or resolve blockers

## Safety

- Managed project writes remain disabled by default.
- Deploy remains disabled.
- Production operations remain disabled.
- Credential values remain unread.
- Remote worker execution remains proposal-only or human-approved depending on risk.

## Next Step Plan

1. Upgrade worker heartbeat from metadata-only to live local process inventory.
2. Add release promotion stages for local preview, server preview, and reviewed publish.
3. Wire project dispatch plans into Console actions and proposal review flows.
4. Add guarded queue-injection audit trace for approved attached-project proposals.

## Notes

- This foundation is intentionally local-first.
- It does not start deploy automation.
- It does not enable managed project writes without a later approval layer.
