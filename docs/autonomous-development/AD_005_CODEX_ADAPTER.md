# AD-005 Codex CLI Adapter

Codex shares the Generic Process supervisor and unified contract. Health checking uses an argument-array `codex --version` call. Execution uses `codex exec <instruction>` without a shell and only after policy and fencing validation.

Real execution defaults off and requires `AUTONOMOUS_RUNTIME_CODEX_ENABLED=true`. AD-005 does not change production configuration or enable that flag. Instructions containing push, merge, deployment, destructive deletion or shell metacharacters are rejected. Environment values are allowlisted; credentials are neither discovered nor inherited automatically.
