# Platform Hardening Review

## Goal

V4-N reviews the platform surface after Credential Vault, Runtime Center, Runtime Adapter Marketplace, Governance Center, Autopilot Runner, Console Read-Only, and Multi-Project Workspace MVPs.

This review is documentation and planning evidence only. It does not execute Agents, deploy, run production operations, access servers, read credential values, or write to managed projects.

## Capability Inventory

| Area | Status | Evidence |
| --- | --- | --- |
| Runtime Center | Dry-run routing and health metadata available | `node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run` |
| Credential Vault | Reference-only credential model available | `node packages/orchestrator-core/bin/studio.mjs credential validate --dry-run` |
| Runtime Adapter Marketplace | Dry-run adapter registry and invoke plans available | `node packages/orchestrator-core/bin/studio.mjs adapter list --dry-run` |
| Governance Center | Risk, approval, and release gate policies available | `node packages/orchestrator-core/bin/studio.mjs governance check --dry-run` |
| Autopilot Runner | Single-step guarded planning and local execution available | `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "继续推进 V4" --dry-run` |
| Console Read-Only | Fixture-backed read-only console skeleton available | `apps/console` |
| Multi-Project Workspace | Read-only project connector workspace available | `packages/project-connector` |

## Hardening Checks

The platform remains bounded by dry-run and approval gates:

- Runtime health is registry-only and does not run network probes.
- Credential Vault stores references only and does not read env, keychain, external vault, API key, or SSH key values.
- Adapter invoke plans do not call models, CLIs, browsers, webhooks, or remote workers.
- Governance Center blocks deploy, production operations, server access, managed project writes, and credential value access.
- Autopilot remains `max_steps=1` and only executes local repository LOW/MEDIUM tasks that pass governance checks.
- `jinhu-smart-park` remains a managed project context and is not modified by platform hardening.

## Validation Matrix

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run
node packages/orchestrator-core/bin/studio.mjs adapter health --dry-run
node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run
git diff --check
git status
```

## Next Recommendation

Prepare a Production Operations Center proposal. It must remain proposal-only until a separate explicit approval exists, because it touches deploy / production operation semantics.

Allowed next scope:

- production operation schema
- approval evidence schema
- dry-run planning CLI
- audit model
- documentation

Still forbidden:

- real deploy
- production operation execution
- server access
- credential value access
- managed project writes
- `jinhu-smart-park` modifications
