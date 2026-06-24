# Pilot-1 Runtime Smoke Report

## Summary

- status: PASS
- runtime: codex-cli
- provider: openai
- credential_reference: reference_only
- adapter: codex-cli
- governance: PASS
- worker: local codex-cli
- real_execution: yes
- validation: PASS

## Runtime Center

- runtime_select_status: PASS
- selected_runtime: codex-cli
- skill_type: code_development

## Credential Vault Reference

- credential_id: openai-primary-ref
- status: reference_only
- reference_type: vault_path
- secret_value_read: no

## Runtime Adapter

- adapter_id: codex-cli
- invoke_mode: cli
- execution_status: planned
- model_invocation: disabled
- external_calls: disabled

## Governance

- status: PASS
- risk: MEDIUM
- automation_mode: autopilot_execute
- deploy: disabled
- production_operations: disabled

## Worker Runtime

- worker_runtime: local codex-cli
- worker_task: pilot-1-write-runtime-smoke-artifact
- result: artifact_written
- result_hash: 222d041841cc99c2
- files_written: docs/release/PILOT_1_REAL_RUNTIME_SMOKE.md, runtime/pilot/pilot-1-runtime-smoke.json, runtime/pilot/pilot-1-runtime-smoke-report.md

## Validation

- command: git diff --check
- status: PASS
- exit_code: 0
- stderr_tail: none

## Safety

- managed_project_writes: disabled
- jinhu_smart_park_modified: no
- deploy: disabled
- production_operations: disabled
- server_access: disabled
- credential_values: not_read
- real_model_call: disabled
