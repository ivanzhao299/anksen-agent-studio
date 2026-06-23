# Autopilot Continuous Mode MVP

## Scope

Autopilot Continuous Mode lets Studio run a bounded sequence of V4 roadmap steps from one command while keeping each step inside Governance, Approval, and Release Gate policy.

## Command

~~~bash
node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "完成 V4 剩余四步" --apply --max-steps 4
~~~

## Runtime Rules

- max_steps defaults to 1 and is capped at 4 for continuous mode.
- Every step reads runtime/global context and Planning Center output before choosing the next action.
- Every step evaluates Governance Center before writing files.
- LOW and MEDIUM local repository tasks may execute when release gates pass.
- HIGH and CRITICAL tasks stop at proposal-only or human-approval gates.
- The runner writes JSON and Markdown reports under autopilot-runs for each step.
- The runner runs pnpm typecheck, pnpm lint:check, and git diff --check for each step.
- The runner commits each safe implementation, proposal, report, and final summary separately.

## Safety Boundaries

- No deploy.
- No production operation.
- No server connection.
- No real credential read or write.
- No managed project writes.
- No jinhu-smart-park modification.
- No unbounded loop; the runner stops at max_steps.

## Current Run

- run_id: v4-continuous-2026-06-23T164157169Z-187199ed
- goal: 完成 V4 剩余四步
- mode: dry-run planning plus bounded apply execution.
