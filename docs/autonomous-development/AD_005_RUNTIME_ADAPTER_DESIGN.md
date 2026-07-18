# AD-005 Runtime Adapter Design

`runtime-adapters` is the only process-execution boundary for autonomous workers. `RuntimeService` resolves a registered adapter, validates current lease fencing, starts execution and exposes internal list/health/get/cancel/log/result operations. It does not add an external API or accept an arbitrary command from a caller.

Real implementations are `CODEX`, `GENERIC_PROCESS` and `CONTROLLED_STUB`. Claude Code, Gemini, OpenHands, Aider, Docker and Media are explicit unsupported registry entries until configured; they never report false success. Night Shift authoritative mode remains disabled.
