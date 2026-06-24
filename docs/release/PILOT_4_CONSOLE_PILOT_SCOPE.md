# Pilot-4 Console Pilot Scope

- pilot_id: PILOT-4-CONSOLE-PILOT-SCOPE
- generated_at: 2026-06-24
- status: PASS_READY_FOR_DRY_RUN_USE
- scope: Console action entry points only

## Summary

Pilot-4 moves the Console from read-only display toward Pilot operation entry points. The Console remains read-only by default. Every action intent is represented as metadata and every action plan is dry-run or proposal-only.

The Console does not execute writes, deploy, production operations, server connections, real model calls, managed project modifications, or credential reads.

## Action Center

Action metadata lives in:

- `apps/console/schemas/console-action.schema.json`
- `apps/console/schemas/console-action-plan.schema.json`
- `apps/console/examples/console-actions.example.json`
- `apps/console/examples/console-action-plan.example.json`
- `apps/console/src/action-center.ts`

Default policy:

- mode: `read_only`
- write_enabled: `false`
- production_enabled: `false`
- deploy: disabled
- production operations: disabled
- server access: disabled
- credential values: not read
- model invocation: disabled
- managed project writes: disabled

## Action Intents

| Action | Intent | Risk | Gate | Command Plan |
| --- | --- | --- | --- | --- |
| `context-summary` | context summary | LOW | ALLOW_DRY_RUN | `context summary` |
| `runtime-health` | runtime health | LOW | ALLOW_DRY_RUN | `runtime health --dry-run` |
| `project-inspect` | project inspect | MEDIUM | ALLOW_DRY_RUN | `project inspect --dry-run` |
| `worker-health` | worker health | MEDIUM | ALLOW_DRY_RUN | `worker health --dry-run` |
| `credential-validate` | credential validate | MEDIUM | ALLOW_DRY_RUN | `credential validate --dry-run` |
| `governance-check` | governance check | LOW | ALLOW_DRY_RUN | `governance check --dry-run` |
| `autopilot-run` | autopilot dry-run | MEDIUM | ALLOW_DRY_RUN | `autopilot run --dry-run` |
| `proposal-review` | proposal review | MEDIUM | ALLOW_DRY_RUN | read-only proposal listing |
| `proposal-approve` | proposal approval | HIGH | PROPOSAL_ONLY | no direct command |

## Proposal-Only Flow

HIGH and CRITICAL actions are not executable from the Console. The Console can only produce an action plan with:

- status: `PROPOSAL_ONLY`
- write_enabled: `false`
- production_enabled: `false`
- requires_approval: `true`
- blocked reason explaining the required governance/proposal path

## CLI

```bash
node packages/orchestrator-core/bin/studio.mjs console actions --dry-run
node packages/orchestrator-core/bin/studio.mjs console action-plan --action runtime-health --dry-run
node packages/orchestrator-core/bin/studio.mjs console action-plan --action autopilot-run --dry-run
node packages/orchestrator-core/bin/studio.mjs console action-plan --action proposal-approve --dry-run
```

These commands generate Console action metadata and plans only. They do not invoke the planned commands.

## Safety Boundaries

- Real deploy: forbidden.
- Production operation: forbidden.
- Credential read/write: forbidden.
- `jinhu-smart-park` modifications: forbidden.
- Server connection: forbidden.
- Real model call: forbidden.
- Console writes: disabled until an explicit proposal and governance gate approve a future flow.

## Validation

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs console render --dry-run
node packages/orchestrator-core/bin/studio.mjs console actions --dry-run
node packages/orchestrator-core/bin/studio.mjs console action-plan --action runtime-health --dry-run
node packages/orchestrator-core/bin/studio.mjs console action-plan --action autopilot-run --dry-run
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
git diff --check
git status
```

Expected result: all checks pass with Console still in read-only/dry-run mode.
