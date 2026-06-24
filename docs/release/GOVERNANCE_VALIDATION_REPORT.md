# Governance Validation Report

- validation_id: V5-GOVERNANCE-VALIDATION
- generated_at: 2026-06-24
- status: PASS
- score: 92/100

## Risk Matrix

| Risk | Expected Decision | Observed Automation Mode | Status |
| --- | --- | --- | --- |
| LOW | execute | automatic_execute | PASS |
| MEDIUM | execute | autopilot_execute | PASS |
| HIGH | proposal | proposal_only | PASS |
| CRITICAL | approval | human_approval_required | PASS |

## Evidence

Command:

- `node packages/orchestrator-core/bin/studio.mjs governance check --dry-run`

Observed result:

- Governance status: PASS.
- Risk levels: 4.
- Approval rules: 4.
- Release gates: 8.
- Deploy enabled: no.
- Production operations enabled: no.
- Server access enabled: no.
- Credential values read: no.
- Managed project writes: disabled without explicit approval.

## Product Readiness

PASS. Governance correctly routes LOW/MEDIUM toward safe local execution and HIGH/CRITICAL toward proposal or approval gates.

## Remaining Gaps

- Add product-facing audit evidence for each governance decision.
- Add Console decision trace views.
- Add machine-readable scenario tests for representative LOW, MEDIUM, HIGH, and CRITICAL actions.

## Safety

- Deploy: disabled.
- Production operations: disabled.
- Server access: disabled.
- Credential values: not read.
