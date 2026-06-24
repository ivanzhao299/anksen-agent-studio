# Pilot-5 Console Productization

- pilot_id: PILOT-5-CONSOLE-PRODUCTIZATION
- generated_at: 2026-06-24
- status: PASS_READY_FOR_LOCAL_USE
- scope: local Web Console only

## Summary

Pilot-5 turns the Console from a read-only data model into a runnable local Web Console. It uses a dependency-free Node HTTP server and static build script under `apps/console/web/`.

The Console reads local repository files only. It does not connect to a database, call external APIs, invoke models, connect to servers, deploy, run production operations, read credential values, or write managed projects.

Phoenix ERP is not connected in this pilot. It will be onboarded later through a GitHub Repo Connector instead of a presumed local path.

## Start Console

Preferred command:

```bash
pnpm --filter @anksen/console dev
```

Root convenience command:

```bash
pnpm console:dev
```

Default local URL:

```text
http://127.0.0.1:4317
```

Static build:

```bash
pnpm --filter @anksen/console build
```

## Page Modules

- Dashboard
- Projects
- Runtime
- Workers
- Credentials
- Governance
- Planning
- Autopilot
- Console Actions
- Memory
- Pilot Status

## Local Data Sources

The Console reads:

- `runtime/global/platform-state.json`
- `runtime/global/roadmap-memory.json`
- `runtime/global/v5-roadmap.json`
- `runtime/projects/jinhu-smart-park/project-state.json`
- `packages/runtime-center/examples/*.json`
- `packages/worker-pool/examples/*.json`
- `packages/governance-center/examples/*.json`
- `packages/credential-vault/examples/*.json`
- latest JSON record in `autopilot-runs/`
- `apps/console/examples/console-actions.example.json`

The Console does not read Phoenix ERP local files in Pilot-5.

## Console Smoke

New command:

```bash
node packages/orchestrator-core/bin/studio.mjs console smoke --dry-run
```

Smoke validates:

- required routes exist
- data files are readable
- dashboard model can be generated
- external calls are disabled
- credential values are not read
- managed project writes are disabled
- deploy and production operations are disabled
- Phoenix ERP local path is not connected

## Action Policy

Console Actions remain dry-run or proposal-only:

- Runtime health: dry-run plan
- Project inspect: dry-run plan
- Worker health: dry-run plan
- Credential validate: dry-run plan
- Governance check: dry-run plan
- Autopilot run: dry-run plan
- Proposal approve: proposal-only

No write action is enabled from the Console in Pilot-5.

## GitHub Repo Connector Path

Future Phoenix ERP onboarding should use a GitHub Repo Connector flow:

1. Read repository metadata from GitHub.
2. Create project registry entry as planned/not connected.
3. Generate runtime memory from repository metadata.
4. Require governance review before local checkout or managed project writes.

Pilot-5 does not implement that connector.

## Validation

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs console smoke --dry-run
pnpm --filter @anksen/console typecheck
pnpm --filter @anksen/console build
git diff --check
git status
```

Expected result: all checks pass with no external calls, no secrets read, no managed project writes, no deploy, and no production operations.
