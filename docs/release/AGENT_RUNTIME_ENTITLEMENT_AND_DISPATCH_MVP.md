# Agent Runtime Entitlement and Dispatch MVP

## Position

Agent Studio treats every AI/Agent as a governed runtime, not as a hard-coded button. Users select a project, a mode, and an Agent. Access Center decides whether the selected runtime is available under the user's plan. Credential Vault only exposes reference presence; it never stores or reads secret values.

## Runtime Strategy

| Runtime | Provider | Default binding | User experience | Execution in this MVP |
| --- | --- | --- | --- | --- |
| `codex-cli` | OpenAI | External CLI session or reference | Admin or advanced user can operate local CLI | Read-only direct CLI plan |
| `claude-code` | Anthropic | External CLI session or reference | Admin or advanced user can operate local CLI | Read-only direct CLI plan |
| `gemini-cli` | Google | External CLI session or reference | Optional advanced runtime | Invoke-plan only unless locally configured |
| `aider` | Aider | External model env/config reference | Optional advanced runtime | Invoke-plan only |
| `deepseek-chat` | DeepSeek | Admin-managed reference | Good default for domestic users | Invoke-plan and Proposal flow only |
| `qwen-plus` | Qwen/DashScope | Admin-managed reference | Good default for domestic users | Invoke-plan and Proposal flow only |
| `openhands` | OpenHands | Remote worker reference | High-risk remote worker | Proposal only |
| `local-agent` | Local Runtime | No credential required | Deterministic local helper | Local dry-run tools |

## Package Binding

Plans control runtime visibility and limits:

- `starter`: domestic runtimes plus Codex and auto routing.
- `team`: domestic runtimes plus Codex, Claude, Gemini CLI, Aider, Local Agent, and auto routing.
- `internal_preview`: all Pilot runtimes for team testing.
- `enterprise`: wildcard runtime access, still gated by Governance.

This keeps the common user path simple: users do not need to install every CLI, register overseas accounts, or handle cards/API keys. Admins bind platform credential references and users select an available runtime from the Console.

## Credential Policy

Credential references added in this MVP:

- `deepseek-platform-ref` -> `DEEPSEEK_API_KEY`
- `qwen-platform-ref` -> `DASHSCOPE_API_KEY`

The repository stores only reference names. Console health and Action Server only read the metadata and must not read env values, keychain values, vault contents, tokens, or plaintext keys.

## Dispatch Flow

The Console flow is:

1. User selects project, mode, and Agent.
2. Action Server checks Access Center plan/risk/project scope.
3. Safe direct CLI runtimes can create read-only plans.
4. Managed API or unconfigured runtimes generate adapter invoke-plans.
5. Project dispatch creates a dispatch plan.
6. Proposal review shows pending proposals.
7. Approved low-risk proposals can be injected into the execution queue.
8. Queue injection writes audit traces.

HIGH/CRITICAL work remains proposal-only or human-approval-required. Production operations and deploy remain disabled in this MVP.

## Next Step

The next implementation step is a managed API gateway that can call DeepSeek/Qwen without exposing secrets to Console users. That gateway must add rate limits, per-plan budget control, audit logs, and model invocation receipts before it is allowed to execute beyond invoke-plan mode.
