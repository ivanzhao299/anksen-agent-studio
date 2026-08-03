# Autonomous Development V2 Long Task

## Goal

Turn the existing governed Codex pipeline into a resumable, low-intervention software delivery loop without weakening project path policy, runtime activation, credential isolation, lease/fencing, validation, or production-operation gates.

The target operator flow is:

```text
Goal
  -> deterministic preflight
  -> one scoped approval for a bounded development job
  -> Planner
  -> Implementer
  -> validation
  -> bounded diagnosis and repair loop
  -> independent review
  -> delivery report and diff
  -> human commit/push/deploy decision
```

## Non-negotiable boundaries

- Reuse the existing Planner, Autonomous Kernel, Scheduler, Worker, Runtime Adapter, Activation Gate, Approval, Lease, and Fencing implementations.
- Real runtime execution remains disabled by default and may only be enabled inside the existing governed runner after every gate passes.
- Writable paths, blocked paths, runtime duration, retry count, validation commands, and token/runtime budgets must be explicit and persisted.
- Commit, push, merge, deploy, production migration, production data writes, and secret-value access remain human-controlled.
- Recovery must never blindly replay an attempt that may have produced side effects.

## Long-task phases

### ADV2-001 — Truthful readiness and intervention map

- Add a machine-readable autonomy readiness command.
- Report control-plane, Codex CLI, resident worker, proven-run, recovery, and bounded-repair readiness separately.
- Classify intervention points as automatable, scoped-once, or always-human.
- Acceptance: the report must never claim autonomous readiness from repository evidence alone.

### ADV2-010 — Guided preflight and safe defaults

- Resolve connected project identity and root.
- Detect dirty worktrees and existing user changes before approval.
- Suggest narrow writable paths and repository-native validation commands.
- Infer routine acceptance checks while preserving user acceptance criteria.
- Acceptance: unsafe or ambiguous projects fail closed with concrete remediation.

### ADV2-020 — Scoped job approval

- Replace repeated per-step confirmations with one expiring approval for one job, project root, writable-path set, validation set, runtime budget, and repair budget.
- Consume that approval only through the existing Activation Gate.
- Acceptance: changing scope invalidates approval and requires a new review.

### ADV2-030 — Bounded autonomous repair loop

- Run Planner and Implementer through the governed Codex path.
- Execute deterministic validation.
- On failure, create a diagnostic artifact and permit a bounded repair attempt within the original approved scope.
- Stop on repeated failure, scope drift, dirty-state ambiguity, budget exhaustion, or non-improving results.
- Acceptance: no unbounded loops and no repair outside approved paths.

### ADV2-040 — Resident recovery and cancellation

- Persist attempt identity, child PID, lease heartbeat, validation state, and recovery decision.
- Reconcile orphaned processes after worker restart.
- Resume only side-effect-safe stages; otherwise enter `RECOVERY_REQUIRED`.
- Acceptance: duplicate implementation attempts cannot run concurrently.

### ADV2-050 — Delivery and review automation

- Produce implementation summary, validation evidence, changed-path inventory, risk findings, remaining work, and suggested commit message.
- Allow optional local commit only after explicit diff approval.
- Keep push, merge, deploy, and production operations separate.

### ADV2-060 — Console product surface and validation

- Add readiness guidance, approval scope, repair progress, recovery decisions, and delivery report to Console.
- Verify desktop and phone-width views.
- Run unit, integration, typecheck, build, smoke, and product-readiness checks.

## Intervention target

| Intervention | V2 target |
| --- | --- |
| Goal clarification | Automatic when repository evidence is sufficient; otherwise one focused question |
| Planning confirmation | Included in scoped job approval |
| Each implementation step | Automatic within approved scope |
| Validation failures | Automatic diagnosis and bounded repair |
| Worker restart | Automatic reconciliation; safe resume only |
| Diff review and local commit | Human-controlled |
| Push, merge, deploy, production operations | Always human-controlled |

## Implementation status

Status as of 2026-08-03: implementation and isolated real-run proof complete. Readiness reports `AUTONOMOUS_DEVELOPMENT_READY` (6/6).

- ADV2-001: complete. `pnpm autonomous-development:readiness` reports repository evidence, live Worker state, real-run proof, recovery, and bounded-repair readiness separately.
- ADV2-010: complete. Job creation records a Git workspace digest, blocks existing changes, and infers repository-native validation commands when the operator leaves them blank.
- ADV2-020: complete. One four-hour approval is bound to project root, paths, checks, runtime, and repair budget by an immutable digest; commit/push/merge/deploy remain excluded.
- ADV2-030: complete. Validation failures can trigger up to two governed repair attempts. Every repair verifies the exact prior workspace digest and stops on scope drift, budget exhaustion, or repeated non-improving evidence.
- ADV2-040: complete. Worker cancellation polls even silent child processes. Startup reconciles orphaned jobs, safely requeues non-side-effect stages, and sends implementation/repair uncertainty to `RECOVERY_REQUIRED`.
- ADV2-050: complete. Every terminal development result writes a delivery report containing validation, changed paths, repair usage, risks, next action, and suggested commit message. Commit still requires explicit diff approval.
- ADV2-060: complete. Console shows truthful readiness, preflight blocks, repair usage, recovery decisions, validation, and delivery artifacts. Desktop and 390px viewport checks pass without horizontal overflow.

The implementation does not manufacture `AUTONOMOUS_DEVELOPMENT_READY`. Job `dev-1785731279987-69c1c231` supplied the first real evidence on 2026-08-03: Planner, Implementer, Validator, and Reviewer all succeeded, validation passed, only the approved path changed, no repair was required, and the job stopped at human diff approval without commit, push, merge, or deploy. Starting an idle Worker by itself still proves only `CODEX_RUNTIME_READY`.

The local test-database fixture now prefers Docker and automatically falls back to loopback-only local PostgreSQL when Docker is unavailable. The fallback was verified through the persistent Night Shift PostgreSQL smoke path.
