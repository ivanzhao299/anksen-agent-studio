# Managed Model Gateway MVP

## Summary

Managed Model Gateway turns domestic and administrator-managed model options into a governed Studio runtime path. It covers DeepSeek and Qwen first, with Codex CLI kept as the local external-session fallback.

This MVP does not call any model and does not read any secret value. It only verifies:

- runtime is registered
- user plan allows the runtime
- Credential Vault reference exists
- Governance risk remains LOW/MEDIUM for direct local planning
- HIGH/CRITICAL paths stay proposal or human approval
- future queue injection requires an approved proposal audit trace

## User Choice vs Admin Managed

The recommended model is hybrid:

- Admin configures default managed runtimes for teams that cannot self-provision overseas accounts.
- Users can still choose a permitted runtime from their plan.
- Domestic managed models such as DeepSeek and Qwen are available through plan entitlements.
- Overseas or CLI runtimes such as Codex CLI, Claude Code, Gemini CLI, OpenHands, and Aider stay separate external sessions unless the user or admin has configured them.

## Package Binding

Plans control runtime access:

- Starter: DeepSeek, Qwen, Codex CLI, Auto
- Team: DeepSeek, Qwen, Codex CLI, Claude Code, Gemini CLI, Aider, Local Agent, Auto
- Enterprise/Internal Preview: broader allowlists

Credential values are never stored in the repo. Credential Vault stores only reference names such as `DEEPSEEK_API_KEY` or `DASHSCOPE_API_KEY`.

## CLI

```bash
node packages/orchestrator-core/bin/studio.mjs model-gateway status --dry-run
node packages/orchestrator-core/bin/studio.mjs model-gateway route --runtime auto --goal "继续推进项目" --project jinhu-smart-park --user owner --dry-run
node packages/orchestrator-core/bin/studio.mjs model-gateway invoke-plan --runtime deepseek-chat --goal "生成计划" --project jinhu-smart-park --user owner --dry-run
node packages/orchestrator-core/bin/studio.mjs model-gateway audit --dry-run
```

## Console Integration

Console Agent selection now routes DeepSeek and Qwen through Managed Model Gateway invoke-plan. The Console receives a planned route, risk, credential reference status, blocked reasons, and audit requirements. It still does not invoke the model directly.

The project-dispatch action now also writes a Proposal Review bridge for managed model plans:

- `runtime/projects/<project_id>/model-gateway-proposals/*.json`
- `runtime/projects/<project_id>/model-gateway-queue-audits/*.json`
- `runtime/projects/<project_id>/controlled-worker-queue/*.json`

This connects the user flow:

1. Choose Agent.
2. Generate an invoke plan.
3. Review the generated proposal.
4. Approve LOW/MEDIUM proposals.
5. Write a queue injection audit trace.
6. Write a controlled worker queue preflight task.
7. Claim the preflight task through a controlled Worker Claim gate.

The queue audit trace is intentionally not a real model execution. It records that the approved proposal is ready for the future worker queue while preserving the safety boundary.

The controlled worker queue preflight task is also not execution. It is the handoff artifact between Proposal Review and a future Worker Claim gate:

- `status: PREFLIGHT_READY`
- `worker_claim_enabled: false`
- `execution_mode: controlled_queue_preflight_only`
- `next_required_gate: worker_claim_or_project_execute_explicit`
- `model_invocation: disabled`
- `credential_values_read: no`
- `managed_project_writes: disabled`

This gives Console a visible queue state without letting a button silently invoke a model, read credentials, modify a managed project, or perform production work.

## Controlled Worker Claim Gate

Console can now advance a `PREFLIGHT_READY` item into a claim audit:

- `runtime/projects/<project_id>/worker-claim-audits/*.json`

The claim gate verifies:

- proposal approval is cleared
- queue audit status is `PASS`
- risk is not `HIGH` or `CRITICAL`
- model invocation remains disabled
- credential values are not read
- managed project writes remain disabled
- production operations remain disabled
- the target worker is either present in the Worker Registry or is the managed model gateway virtual worker

When the gate passes, the controlled queue record moves to `CLAIMED_DRY_RUN_READY`. This still does not execute a model or write business code. It only proves that the task has passed the explicit worker-claim boundary and is ready for a later result-artifact callback or separately approved execution gate.

## Guardrails

- no real model call
- no real credential read
- no env value read
- no external vault connection
- no deploy
- no production operation
- no managed project writes
- queue injection requires proposal approval and audit trace
- worker execution requires a later explicit Worker Claim / Project Execute gate
- worker claim writes audit trace only; result artifacts are a separate gate

## Next

The next production step is implementing result artifact callback for claimed tasks. After that, a separately approved execution gate can execute approved LOW/MEDIUM work inside the configured runtime boundary. Real gateway execution against admin-managed model credentials must include rate limits, budget tracking, request redaction, audit retention, and user-visible result artifacts.
