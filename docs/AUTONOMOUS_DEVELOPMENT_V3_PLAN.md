# Autonomous Development V3 Long Task

## Goal

Move from a proven single governed run to reliable, observable, low-intervention development operations while retaining human control over commits, remote Git operations, deployments, production changes, and secrets.

## Current baseline

- Readiness: `AUTONOMOUS_DEVELOPMENT_READY` (6/6).
- Resident Worker: running with persisted heartbeat and orphan reconciliation.
- Real proof: one isolated non-production Planner/Implementer/Validator/Reviewer job completed successfully.
- Release boundary: local diff approval, commit, push, merge, deploy, and production operations remain human-controlled.

## Long-task phases

### ADV3-010 — Worker lifecycle reliability

- Install a user-level service definition with restart-on-failure and bounded backoff.
- Add startup health checks for Codex login, PostgreSQL fixture, store writability, and stale PID reconciliation.
- Detect crash loops and stop after a bounded threshold with an actionable incident artifact.
- Acceptance: terminate the Worker during a safe stage and prove automatic recovery without duplicate execution.

### ADV3-020 — Queue policy and concurrency

- Add priority, maintenance window, per-project concurrency, and global resource budgets to the existing queue.
- Preserve a single Scheduler and Worker model; do not create a parallel queue or state machine.
- Add fairness and starvation evidence for multiple connected projects.
- Acceptance: concurrent fixture jobs respect project isolation, capacity, ordering, leases, and fencing.

### ADV3-030 — Stronger deterministic acceptance

- Require each acceptance criterion to map to a command, test, or explicit reviewer check.
- Detect criteria that are only asserted in prose and stop before approval.
- Add coverage, lint, security, dependency, and repository-native checks when available and policy-allowed.
- Acceptance: a job cannot be marked ready when a new behavior lacks executable evidence.

### ADV3-040 — Repair quality and cost control

- Persist validation fingerprints, repair hypotheses, changed hunks, and token/runtime cost per attempt.
- Add error-class-specific repair prompts and a configurable non-improvement threshold.
- Add daily and per-project token/runtime budgets with fail-closed exhaustion behavior.
- Acceptance: repeated or cost-inefficient repair loops stop automatically with a concise escalation package.

### ADV3-050 — Operational observability

- Add queue depth, stage latency, success rate, repair rate, cancellation rate, recovery rate, and token/runtime cost metrics.
- Add structured incident and morning reports with artifact links and immutable job scope.
- Add alerts for offline Worker, stuck stage, approval expiry, crash loop, scope drift, and database failure.
- Acceptance: an operator can diagnose every terminal and stuck state without reading raw process logs.

### ADV3-060 — Evidence retention and audit

- Add retention policy, artifact integrity hashes, redaction checks, and audit export.
- Verify that secret values, auth material, and disallowed paths never enter prompts, logs, or artifacts.
- Add replay-safe cleanup for expired fixtures and completed job artifacts.
- Acceptance: evidence is tamper-evident, scoped, redactable, and removable under policy.

### ADV3-070 — Multi-project pilot

- Connect two clean non-production repositories through the existing project registry.
- Run a matrix of success, validation failure with repair, cancellation, restart recovery, and scope-drift rejection.
- Require repeated success before changing the maturity label from proven to operationally reliable.
- Acceptance: at least ten governed jobs complete with no path escape, duplicate attempt, unauthorized release action, or lost audit evidence.

### ADV3-080 — Controlled release assistance

- Generate commit message, branch suggestion, PR summary, risk notes, and rollback instructions automatically.
- Keep local commit behind explicit diff approval and remote Git actions behind separate explicit approval.
- Never enable automatic merge, deploy, production migration, or production data writes.
- Acceptance: release preparation needs one review interaction while every external mutation remains separately authorized.

## Exit criteria

- Worker survives restart and dependency interruptions with bounded recovery.
- Ten-job multi-project pilot passes all safety and evidence gates.
- Every acceptance criterion has deterministic or explicitly classified review evidence.
- Queue, cost, failure, and recovery behavior is visible in Console.
- No automatic commit, push, merge, deploy, production operation, or secret access is introduced.

## Implementation status

Status as of 2026-08-03: V3 control and operations implementation complete; controlled ten-case pilot complete; production autonomy remains disabled.

- ADV3-010: complete with an operational caveat. The Supervisor performs Codex login, PostgreSQL and store preflight, bounded exponential restart, and crash-loop incident reporting. Killing an idle Worker proved automatic child recovery without a duplicate job. A LaunchAgent definition is installed, but macOS returns `EX_CONFIG` when a background agent executes the repository from `Documents`; the detached Supervisor is the active fallback until the repository is moved to a service-accessible path or background access is granted.
- ADV3-020: complete. Existing queued jobs now carry P0-P3 priority, optional UTC maintenance windows, per-project isolation, global concurrency one, FIFO fairness within priority, and immutable queue scope.
- ADV3-030: complete. Every acceptance criterion must map to an allowed command/test or explicit independent review before approval. Missing or unknown evidence fails closed.
- ADV3-040: complete. Jobs enforce input/output token, total runtime, and daily project runtime budgets. Attempts persist token/runtime evidence and changed paths; repairs persist error class and repair hypotheses and retain bounded non-improvement stopping.
- ADV3-050: complete. Console exposes queue depth, running count, success rate, token cost and actionable alerts. The API exposes operational snapshots and scoped audit export without raw-log inspection.
- ADV3-060: complete. New artifacts are redacted, SHA256-addressed, integrity-checked on read, included in audit export, and eligible for replay-safe terminal-job retention cleanup.
- ADV3-070: controlled pilot complete. Ten deterministic cases across two project identities cover success, repair, cancellation, safe restart, uncertain recovery, scope-drift rejection, approval expiry, budget exhaustion and maintenance windows. The report is explicitly `CONTROLLED_POLICY_PILOT`; it does not claim ten real Codex executions. The earlier four-role real job remains the real Runtime proof.
- ADV3-080: complete. Delivery now generates a commit message, `codex/` branch suggestion, PR summary, risk notes and rollback instructions. Commit, push, merge, deploy and production remain separately approved.

Current maturity labels:

- Autonomous development: `READY` based on the real four-role proof.
- Operational reliability: `CONTROLLED_PILOT_READY`.
- Production autonomy: `DISABLED`.
