# Local Console Service and AI Runtime

## Summary

ANKSEN Agent Studio Console can run as a local macOS launchd service. The service starts the existing dependency-free Node Console server on `127.0.0.1:4317`, keeps it alive after the Codex window closes, and writes local stdout/stderr logs under `runtime/local-services/`.

The Console also has first-class local runtime wiring for:

- Codex CLI: `codex exec --sandbox read-only`
- Claude Code: `claude --print --bare`

These runtimes are only invoked when the user explicitly chooses the Agent in the Console. The default remains local Studio CLI actions.

## Service Commands

```bash
node packages/orchestrator-core/bin/studio.mjs console service status
node packages/orchestrator-core/bin/studio.mjs console service install --dry-run
node packages/orchestrator-core/bin/studio.mjs console service install --apply
node packages/orchestrator-core/bin/studio.mjs console service start --apply
node packages/orchestrator-core/bin/studio.mjs console service stop --apply
```

Shortcut scripts:

```bash
pnpm console:service:status
pnpm console:service:install
pnpm console:service:start
pnpm console:service:stop
```

The generated launchd plist is:

```text
~/Library/LaunchAgents/com.anksen.agent-studio.console.plist
```

## AI Runtime Policy

`studio console agent-status --dry-run` checks whether local `codex` and `claude` commands are installed. It does not invoke a model, read secrets, or store credentials.

When a user selects `指定 Agent` with `Codex CLI` or `Claude Code`, the Console routes the natural-language goal to a real local CLI runtime in read-only mode:

- Codex uses `--sandbox read-only`.
- Claude uses `--bare` and disallows Bash/Edit/Write/MultiEdit/NotebookEdit tools.
- Console does not read API keys, keychain values, SSH keys, or external vault values.
- Console does not store credential values.
- Managed project writes remain disabled.
- Deploy and production operations remain disabled.

## What Persists After Closing Codex

Persisted:

- Repository code and commits.
- Runtime memory files.
- Autopilot run records.
- Console action logs.
- launchd service plist.

Not persisted in memory:

- In-flight Action Server run state.
- Any running child process state after cancellation or service restart.

Historical records remain recoverable from `autopilot-runs/console-actions/`.
