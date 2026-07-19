# Beta-002 First Controlled Codex Execution

## Outcome

Beta-002 completed the first successful controlled CODEX development loop on 2026-07-19. The real Codex process created exactly `docs/codex-first-run.md` in the isolated fixture, returned exit code 0, and produced a successful RuntimeResult. The feature flag was restored to false, the one-use Approval is `CONSUMED`, all Attempt rows are terminal, all leases are `RELEASED`, and the successful Morning Report is persisted.

Two earlier controlled sessions failed safely before the successful run. Their immutable audit records were retained and their Approvals cannot be replayed. Persisted logs identified the root cause as standalone `codex-cli 0.141.0` being too old for the configured `gpt-5.6-sol` model. The successful run used the already-installed ChatGPT application CLI `0.145.0-alpha.18`; no desktop-managed binary was overwritten.

## Isolated fixture

- Root: `/Users/mac/Documents/Codex/anksen-codex-first-run-fixture`
- Remote: none
- Generated file: `docs/codex-first-run.md`
- Fixture commits: none
- Production database, migration, credential values, push, merge and deployment: not used

## Successful execution facts

- Session and Goal: `SUCCEEDED`
- Planner tasks: 3 of 3 `SUCCEEDED`
- Each task: Attempt 1 only
- Every lease: `RELEASED`
- CODEX Runtime PID: 38650
- CODEX Runtime exit code: 0
- CODEX fencing token: 1
- Approval: `CONSUMED`, used count 1 of 1
- Runtime executions: 3 total, 2 controlled stub and 1 CODEX
- Morning Report: persisted with no error summary

## Control-plane hardening

Beta-002 adds wildcard capability handling for the existing Access Center platform-owner identity, explicit target-path checks for single-file policies, and readiness checks for project root, allowed paths, blocked paths, timeout and CODEX worker authorization. `CodexCliAdapter` accepts controlled CLI arguments so the exercise forces ephemeral `workspace-write` sandboxing.

Runtime PID, exit code, error code and redacted bounded logs are persisted before success/failure decisions. Failed sessions close automatically, the feature flag resets in `finally`, and no retry path runs automatically. Resume skips terminal CODEX tasks and can finish aggregation or controlled-stub validation without launching another Codex process.

## Residual caution

The Project Runtime Policy authorizes the outer `codex exec` call and the prompt constrains agent commands. A future hardening task should add OS-level or hook-level enforcement for every child command if command-by-command prevention, rather than audit and sandbox containment, is required.
