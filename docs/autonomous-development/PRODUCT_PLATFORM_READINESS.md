# ANKSEN Studio product platform readiness

This vertical slice answers one bounded question: does the current checkout contain the implementation and verification evidence needed for the ANKSEN Studio product platform layers? It is a deterministic repository inspection, not a production certification and not a live-service health check.

## Evidence model

The checker reads named files and verifies small, stable implementation assertions for ten areas: identity, gateway, autonomous kernel, scheduler, worker, runtime activation gate, persistent recovery, console product surface, verification, and release safety. A file alone is not sufficient when an expected safety or behavior marker is absent.

Each area is classified as:

- `READY`: every required evidence assertion is present.
- `DEGRADED`: some evidence is present, but at least one required assertion is missing or incomplete.
- `MISSING`: none of the required evidence assertions is present.

The platform is `READY` only when every area is ready. It is `MISSING` only when every area is missing; all other combinations are `DEGRADED`. Results are derived only from the checkout, use no network access, do not start services, and do not mutate runtime state.

## Command

Run the concise operator view from the workspace root:

```sh
pnpm product:readiness
```

For automation and audit capture:

```sh
pnpm --silent product:readiness -- --json
```

The JSON report includes a schema version, overall status, summary counts, per-area status, evidence paths, assertion status, and missing content markers.

## Safety boundary and current limitations

Readiness means the bounded control-plane slice is evidenced in source. It does not prove production capacity, availability, security accreditation, external identity-provider operation, PostgreSQL availability, browser compatibility, remote worker isolation, credential-backend availability, or successful execution against a real professional domain.

Real Codex/runtime execution remains default disabled. The checker never changes `AUTONOMOUS_RUNTIME_CODEX_ENABLED`, creates approvals, invokes model APIs, starts workers, deploys, pushes, merges, or releases. Runtime activation still requires the existing feature flag, scoped identity and RBAC, project policy, credential reference, healthy worker/runtime, and consumable approval. Push, merge, and deploy remain denied by the activation policy.

## Shortest path to professional domain automation

1. Define one narrow domain contract: canonical inputs, outputs, constraints, acceptance criteria, and an authoritative test fixture.
2. Add a domain planner/skill that produces the existing task-graph contract without bypassing identity, gateway, scheduling, or approval controls.
3. Connect one sandboxed worker adapter with least-privilege credential references and explicit project/path/command policy; keep real runtime activation off by default.
4. Prove deterministic replay, idempotency, cancellation, timeout, recovery, audit, and domain acceptance tests in a non-production environment.
5. Expose status, evidence, intervention, and approval decisions in the Console, then run an explicitly approved bounded pilot before considering any production release gate.

The most professional next increment is therefore one deeply verified domain workflow through the existing governed platform, not a general-purpose autonomous-production switch.
