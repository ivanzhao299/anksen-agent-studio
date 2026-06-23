# Agent Runtime Center PRD

## Objective

Agent Runtime Center makes ANKSEN Agent Studio runtime-neutral. The platform should be able to choose the right AI runtime, tool runtime, or local automation runtime for a task without hard-coding all work to one model, one CLI, or one worker style.

## MVP Scope

- Maintain a provider registry for OpenAI, Anthropic, Google, OpenHands, Aider, and Local Runtime.
- Maintain runtime profiles for `codex-cli`, `claude-code`, `gemini-cli`, `openhands`, `aider`, and `local-agent`.
- Store credential references only; never store real API keys, SSH keys, tokens, or passwords.
- Provide a registry-based health check that reports provider, runtime, status, auth reference state, and available skills.
- Enrich Skill Router metadata so task type can influence runtime selection before agent assignment.

## Non-Goals

- No real credential storage.
- No active network or model probe in V4-I.
- No autonomous runtime switching during project execution.
- No billing integration beyond cost schema placeholders.
- No production deployment or managed project writes.

## Data Model

Runtime Center uses schema-first JSON registries:

- `runtime-provider.schema.json`: provider identity, type, auth modes, capabilities, health status.
- `runtime-profile.schema.json`: runtime identity, provider, invoke mode, supported skills, parallel limits, default budget, region, project preference.
- `credential_reference.schema.json`: vault-backed references only.
- `runtime-health.schema.json`: health check output.
- `runtime-cost.schema.json`: future billing and usage model.

## Runtime Routing

Skill Router remains the first routing layer, but each skill may now include runtime selection metadata:

- ERP/frontend/UI code: prefer `claude-code`, fallback `codex-cli`.
- General guarded code work: default `codex-cli`.
- Document generation: route to document runtime before code agents.
- Image generation: route to image runtime before code agents.
- Validation and Doctor tasks: route to deterministic local scripts or `codex-cli`.

## Console Pages

### Providers

Shows provider registry, provider type, capabilities, auth modes, and health status.

### Runtimes

Shows runtime profiles, supported skills, max parallel tasks, default budget, region, and project preferences.

### Credentials

Shows credential references and vault paths only. Real credential values are never displayed or stored in repository files.

### Billing

Shows future runtime cost profiles, pricing model, and budget policy.

### Health

Shows latest registry health check results, auth reference state, unavailable runtimes, and suggested remediation.

### Usage

Shows future execution counts, token/time estimates, cost summaries, and per-project runtime adoption.

## Safety Rules

- Runtime Center may recommend runtimes, but execution remains behind explicit project approval gates.
- Credential values must stay outside git.
- `--dry-run` health checks must not contact model APIs, browsers, or remote workers.
- High-risk managed project writes still require project-specific approval and validation.

## MVP Acceptance

- Provider and runtime profile examples parse as JSON.
- `runtime-health-check --dry-run` reports all configured runtime profiles.
- Skill Router contains runtime selection hints for code, document, and image tasks.
- Typecheck and lint checks pass.

## V4-I Hardening Addendum

Runtime Center now owns a first-pass routing model:

- `runtime-budget.schema.json` and `runtime-budgets.example.json` define per-runtime budget limits.
- `credential_reference.schema.json` and `credential-references.example.json` define vault references only; real secrets remain forbidden.
- `runtime-selection.schema.json` and `runtime-selection-rules.example.json` define skill/capability/region/budget based selection rules.
- `runtime-center-utils.mjs` evaluates `skill_type + capability + region + health + budget` and returns a ranked runtime candidate list.

CLI surface:

```bash
node packages/orchestrator-core/bin/studio.mjs runtime list
node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run
node packages/orchestrator-core/bin/studio.mjs runtime select --skill code_development --dry-run
```

The hardening layer is still registry-based. It does not call model APIs, does not open browsers, does not execute Agents, and does not read credential values.

## Next Milestones

1. Add credential vault adapter interfaces.
2. Add active health probes gated by credential references.
3. Add runtime selection scoring to task planning.
4. Add console pages for Providers, Runtimes, Credentials, Billing, Health, and Usage.
5. Record runtime usage metrics per managed project.
