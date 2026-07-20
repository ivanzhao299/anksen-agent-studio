# Autonomous Development Runtime Closure

## Outcome

Studio now has an evidence-backed autonomous software delivery path. A user creates a governed development job, resolves clarification, approves execution, and a resident worker runs four distinct Codex roles: Planner, Implementer, Validator, and Reviewer. The result stops at human diff approval; commit is a separate RBAC-protected action. Push, merge, deploy, production credentials, and production databases are not part of this path.

## Runtime path

`Studio /development → clarification → execution approval → resident worker claim → Planner (read-only CODEX) → Activation Gate → Implementer (workspace-write CODEX) → acceptance commands → Validator (read-only CODEX) → Reviewer (read-only CODEX) → diff approval → optional local commit`

The Implementer uses the existing governed Codex runner, PostgreSQL autonomous kernel, scheduler, task claim, lease, fencing token, project runtime policy, credential reference, one-time approval, runtime adapter, and persisted morning report. The outer development job stores role events and artifacts under the ignored local runtime directory so the Console can display live progress without committing runtime state.

## Truthful capability boundary

- Real production deployment: not configured.
- Local deployment: Console and resident worker are supported as local services.
- Real Codex: enabled only inside the governed Implementer run; Planner, Validator, and Reviewer are read-only Codex processes.
- Simulated runtime: remains available for domain workflows but is not counted as autonomous-development proof.
- Human intervention: clarification, execution approval, final diff approval, and local commit approval.
- Explicitly prohibited: automatic push, merge, deploy, production database access, and plaintext credential storage.

## Acceptance evidence

The isolated repository `/Users/mac/Documents/Codex/anksen-autonomous-development-fixture` was used with no remote. Job `dev-1784554608550-455d2c54` reached `AWAITING_DIFF_APPROVAL` after four successful CODEX role processes. The only changed path was `src/autonomous-result.md`; `git diff --check` passed. Total measured usage was 173,648 input tokens, including 120,320 cached input tokens, 2,181 output tokens, and 272 reasoning output tokens.

## Operations

- Start: `pnpm autonomous-development-worker:service:start`
- Status: `pnpm autonomous-development-worker:service:status`
- Stop: `pnpm autonomous-development-worker:service:stop`

Worker presence is derived from a live PID and a heartbeat that expires after 15 seconds. A logical registry row is not treated as a running worker.

## Remaining scale work

This closure deliberately uses one resident development worker and file-backed outer job projections. Multi-host worker contention, PostgreSQL persistence for the outer four-role job projection, automatic crash resume within a role, and remote deployment orchestration remain future phases. The existing governed Implementer execution is already PostgreSQL-backed and fenced.
