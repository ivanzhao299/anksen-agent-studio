# Console Operable Read-Only MVP

## Scope

V4-R adds an operable read-only layer to apps/console. The Console now exposes local command descriptors that a future UI can render as disabled, dry-run, or proposal-only actions.

## Included Controls

- Context Summary
- Planning Dry Run
- Runtime Health
- Governance Check
- Production Safety Check
- Autopilot Dry Run

## Safety

- No command execution from the Console view model.
- No database connection.
- No external service calls.
- No Agent execution.
- No deploy.
- No production operation.
- No server access.
- No credential value read or write.
- No jinhu-smart-park modification.
