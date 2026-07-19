# Beta-002 First Controlled Codex Execution

## Outcome

The first controlled CODEX process was started exactly once on 2026-07-19 and returned a failed RuntimeResult. It was not retried. The feature flag was restored to false immediately, the one-use Approval remained `CONSUMED`, and the active lease was closed with a fencing-aware failure writeback.

The exercise therefore does **not** claim a successful first autonomous code change. No `docs/codex-first-run.md` file was produced and the fixture retained only its pre-existing uncommitted `README.md` baseline.

## Isolated fixture

- Root: `/Users/mac/Documents/Codex/anksen-codex-first-run-fixture`
- Remote: none
- Runtime: one real `CODEX` process
- Production database, migration, credential values, push, merge and deployment: not used

## Persisted result

- Session: `FAILED`
- Goal: `FAILED`
- Planner tasks: 3
- Analyze task: `SUCCEEDED` through `CONTROLLED_STUB`
- Create documentation task: Attempt 1 `FAILED`, Lease `RELEASED`, fencing token 1
- Review task: `BLOCKED`
- Approval: `CONSUMED`, used count 1 of 1
- Runtime executions: 2 total, 1 controlled stub and 1 CODEX
- Morning Report: persisted with `CODEX_RUNTIME_FAILED`

## Control-plane hardening

Beta-002 adds wildcard capability handling for the existing Access Center platform-owner identity, explicit target-path checks for single-file policies, and readiness checks for project root, allowed paths, blocked paths, timeout and CODEX worker authorization. `CodexCliAdapter` accepts controlled CLI arguments so the exercise can force ephemeral `workspace-write` sandboxing.

The drill is intentionally one shot. A failed real RuntimeResult is persisted before the command aborts, the flag is reset in `finally`, and no retry path is invoked automatically.

## Remaining gate

The CODEX process failure needs diagnosis in a later explicitly approved task. Because the one-use Approval has been consumed and Attempt 1 is terminal, diagnosing it must not reuse or replay this execution. A later run requires a new Goal, Task, Approval and explicit authorization.
