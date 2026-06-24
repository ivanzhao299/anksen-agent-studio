# Runtime Chain Report

- validation_id: V5-RUNTIME-CHAIN
- generated_at: 2026-06-24
- status: PASS
- score: 88/100

## Chain

Runtime Center -> Credential Vault -> Runtime Adapter -> Governance -> Invoke Plan

## Evidence

Commands:

- `node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs credential validate --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs adapter invoke-plan --runtime codex-cli --skill code_development --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs governance check --dry-run`

Observed result:

- Runtime Center parsed 6 providers, 6 runtimes, and 6 registered adapters.
- Credential Vault validation returned PASS for 6 credential references.
- Adapter invoke-plan resolved `codex-cli` and `code_development`.
- Invoke plan confirmed `credential_reference_status: reference_only`.
- Invoke plan confirmed `model_invocation: disabled`.
- Governance returned PASS with 4 risk levels and 8 release gates.

## Product Readiness

PASS for dry-run product readiness. The chain can resolve runtime metadata, credential reference presence, adapter metadata, governance status, and an invoke plan without reading secret values or calling a model.

## Remaining Gaps

- Add a single runtime-chain CLI that emits one machine-readable chain object instead of requiring four commands.
- Add JSON schema validation for the joined runtime -> credential -> adapter -> governance result.
- Keep real invocation behind a separate approved runtime smoke gate.

## Safety

- Real model invocation: disabled.
- Credential values: not read.
- Deploy: disabled.
- Production operations: disabled.
- Managed project writes: disabled.
