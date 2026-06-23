# Runtime Adapter Marketplace MVP

## Goal

V4-K defines a shared Runtime Adapter Marketplace so Agent Studio can describe different AI and Agent execution paths behind one dry-run contract.

The MVP registers adapters for Codex CLI, Claude Code, Gemini CLI, OpenHands, Aider, and Local Agent. It does not invoke models, run CLIs, open browsers, call webhooks, start remote workers, read credential values, connect to servers, deploy, or perform production operations.

## Package

`packages/runtime-adapters/`

Schemas:

- `runtime-adapter.schema.json`
- `adapter-invocation.schema.json`
- `adapter-result.schema.json`

Examples:

- `runtime-adapters.example.json`
- `adapter-invocation.example.json`
- `adapter-result.example.json`

Utility:

- `lib/runtime-adapter-utils.mjs`

## Adapter Registry

Initial adapters:

| Adapter | Invoke Mode | Credential Reference | Network | Workspace | Risk |
| --- | --- | --- | --- | --- | --- |
| `codex-cli` | `cli` | required | yes | yes | MEDIUM |
| `claude-code` | `cli` | required | yes | yes | MEDIUM |
| `gemini-cli` | `cli` | required | yes | yes | MEDIUM |
| `openhands` | `remote-worker` | required | yes | yes | HIGH |
| `aider` | `cli` | required | yes | yes | MEDIUM |
| `local-agent` | `cli` | not required | no | yes | LOW |

Each adapter declares:

- `invoke_mode`
- `supported_skills`
- `credential_reference_required`
- `network_required`
- `workspace_required`
- `max_parallel_tasks`
- `guardrails`

## CLI

All commands are dry-run only:

```bash
node packages/orchestrator-core/bin/studio.mjs adapter list --dry-run
node packages/orchestrator-core/bin/studio.mjs adapter health --dry-run
node packages/orchestrator-core/bin/studio.mjs adapter invoke-plan --runtime codex-cli --skill code_development --dry-run
```

`invoke-plan` returns a plan only. It never invokes a model, CLI, browser, webhook, or remote worker.

## Runtime Center Integration

Runtime Center profiles now reference `adapter_id`.

`runtime health --dry-run` reports adapter registration alongside credential reference presence:

- `adapter_status=registered`
- `auth_status=reference_only` or `not_required`
- `credential_values: not read`
- `network_probes: disabled`

## Governance Integration

Governance Center can evaluate adapter metadata:

- LOW: local deterministic adapters
- MEDIUM: local CLI adapters with credential references and workspace access
- HIGH: remote-worker/webhook style adapters requiring proposal-only handling
- CRITICAL: reserved for future unsafe or missing-policy adapters

The adapter health and list commands show the Governance Center decision for each adapter.

## Credential Policy

Credential Vault provides reference presence only:

- `vault_path`
- `env_ref`
- `keychain_ref`
- `external_vault_ref`

The Runtime Adapter Marketplace never reads or stores secret values.

## Validation

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs adapter list --dry-run
node packages/orchestrator-core/bin/studio.mjs adapter health --dry-run
node packages/orchestrator-core/bin/studio.mjs adapter invoke-plan --runtime codex-cli --skill code_development --dry-run
node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
git diff --check
git status
```
