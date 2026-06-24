# Pilot-1 Real Runtime Smoke

- pilot_id: pilot-1-real-runtime-smoke
- generated_at: 2026-06-24T03:59:03.975Z
- status: PASS
- runtime: codex-cli
- worker: local codex-cli
- real_execution: yes

## Scope

Pilot-1 validates only Codex CLI. Claude Code, Gemini, OpenHands, and Aider are out of scope.

## Chain

Runtime Center -> Credential Vault Reference -> Runtime Adapter -> Governance -> Worker Runtime -> Result Artifact

## Evidence

| Step | Status | Evidence |
| --- | --- | --- |
| runtime_select | PASS | selected_runtime=codex-cli |
| credential_reference | PASS | openai-primary-ref; vault_path; secret_value_read=no |
| adapter_invoke_plan | PASS | codex-cli; planned |
| governance_gate | PASS | adapter=PASS; center=PASS |
| worker_runtime | PASS | local codex-cli |
| result_artifact | PASS | runtime/pilot/pilot-1-runtime-smoke.json |
| validation | PASS | git diff --check status=0 |

## Result

- result_artifact: `runtime/pilot/pilot-1-runtime-smoke.json`
- result_report: `runtime/pilot/pilot-1-runtime-smoke-report.md`
- worker_result_hash: 222d041841cc99c2
- validation: PASS

## Safety

- `jinhu-smart-park` modified: no.
- Deploy: disabled.
- Production operations: disabled.
- Server access: disabled.
- Credential values: not read.
- Real model call: disabled.
