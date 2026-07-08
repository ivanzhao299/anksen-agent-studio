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

## Guardrails

- no real model call
- no real credential read
- no env value read
- no external vault connection
- no deploy
- no production operation
- no managed project writes
- queue injection requires proposal approval and audit trace

## Next

The next production step is implementing a real gateway worker service that can execute approved LOW/MEDIUM prompts against admin-managed model credentials inside a server-side secret boundary. That step must include rate limits, budget tracking, request redaction, audit retention, and user-visible result artifacts.
