# ANKSEN AI Growth Platform — Continuation Handoff

Updated: 2026-08-26
Status: ACTIVE
Branch: `feature/anksen-ai-growth-platform`
Draft PR: `#35`
Program Issue: `#34`

## Product and architecture boundary

ANKSEN AI Growth Platform is a reusable, multi-tenant product on the existing Studio control plane. KingTurf is the first pilot tenant, not the Core boundary. Reuse the existing Kernel, Planner, Scheduler, Worker, Runtime, Approval, Audit, RBAC, credential-reference and activation gates; never create a second orchestration stack.

All authoritative records and events require `organizationId + workspaceId + tenantId`. External writes require declared capability, idempotency, audit and policy approval where applicable. CRM/ERP/RFQ/quote/order systems remain authoritative downstream. Do not push, merge, deploy, migrate production data or enable a real Runtime without explicit authorization.

## Implemented and verified baseline

The executable path covers GA-000~017:

`Discovery -> Identity Resolution -> Lead -> Explainable Score -> Engagement -> Next Best Action -> Opportunity -> Downstream Handoff -> Revenue Attribution -> Executive Report`

The current branch also includes a durable PostgreSQL schema/store, atomic tenant-scoped identity resolution, immutable score history, Customer 360 persistence, KingTurf and unrelated-tenant packs, governed publishing, signed website ingestion, default-disabled official publishing and Business API connectors, and a shared outbound-delivery ledger. The webhook-to-lead path runs in one database transaction with replay detection, cross-source identity reuse, cross-tenant isolation and rollback to human review when identities conflict. Publishing and commercial handoff require approval references and record bounded attempts, sanitized errors, authoritative external IDs and reconciliation without persisting credentials or commercial payloads. These are implementation and acceptance slices, not production authorization.

Run the synchronized local gate before continuing:

```sh
pnpm install --frozen-lockfile
pnpm growth-platform:acceptance
```

The gate runs Core unit and GA acceptance tests, the evidence-based Pilot readiness check, production-connector tests, PostgreSQL store and delivery-ledger tests, signed-event transaction integration tests, an isolated PostgreSQL persistence smoke, and the sanitized Growth delivery operations surface test.

## Direct continuation priority

1. Keep the unified local/CI gate green and close persistence/interface inconsistencies first.
2. Keep GA-004~007 transaction, identity-review and score-history evidence green as connector inputs expand.
3. Governed retry/reconciliation APIs now use existing Console RBAC, CAS and immutable delivery audit. Keep the current browser surface read-only until end-to-end authenticated API evidence and existing Worker connector dispatch are proven.
4. Keep the Pilot readiness report fail-closed: implementation evidence is green, while activation remains blocked until every credential, health, approval, feature-flag, central Production Ops policy, Runtime Gate and explicit production-authorization check is independently proven.
5. The sanitized Pilot readiness evidence is projected into the authenticated Growth Console without an activation action. Central Production Ops policy, tenant-scoped/unexpired Business Source Governance approval, tenant production feature flag, exact existing Runtime Activation Gate binding and complete governed connector-activation preflight coverage override their JSON fixture fields; keep tenant isolation and fail-closed API evidence green.
6. Delivery failures, reconciliation mismatches and open identity-review cases now come from scoped PostgreSQL evidence. Identity resolution/dismissal has separate reviewer RBAC, exact-version CAS, candidate validation and immutable audit; keep the browser projection read-only until authenticated end-to-end action UX is proven.
7. Signed ingress, publishing and Business API now have tenant-scoped, default-disabled, CAS/audited connector bindings. Publishing additionally requires an active channel account. The read-only health-probe service has no production adapter registered. Connector activation now has a one-time Gate over existing business approval plus separate `production.request` authorization, but no Console execution endpoint is exposed and no real binding has been activated.
8. The Console provides a read-only activation-preflight projection for production-operations handoff without exposing authorization or credential references. Pilot explicit-production-authorization evidence now requires a current READY preflight for every required connector kind; missing or duplicate kinds fail closed. It reads the existing Production Ops bundle and visibly reports the authoritative global blocked gate. The Gate proves Access Center authorization through the separate `growth_production_operator`, while a second Production Ops seam defaults to deny. Exact-version activation/disable are exercised only by an explicit local governance fixture; neither operation has a Console endpoint. Keep both unexposed until the central policy itself has separately governed authoritative production authorization.
9. Validate KingTurf through governed connectors and downstream mappings only after the existing gates authorize it.
10. Keep the second non-KingTurf tenant proof green without a Core or schema fork.

The tenant production feature-flag store is also fail-closed at its mutation seam: both enable and disable require separately injected Production Ops authorization, and the default constructor cannot change a flag. The Console instantiates that default-deny form for readiness only and exposes no mutation endpoint.

Tenant packs now validate an optional immutable `metadata.runtimeActivationBinding` against the exact existing CODEX Activation Gate identifiers. An absent binding remains valid and produces `NOT_BOUND`; a partially configured or non-CODEX binding is rejected while loading the pack. Do not add KingTurf IDs until they refer to governed existing Runtime records.

The connector-binding store now defaults both configuration writes and health-evidence writes to unauthorized. The health-probe service separately rejects the actor before it reads binding context or invokes an adapter, proven by a zero-call test. Console constructs the default-deny store for read-only readiness. Tests inject narrow actor authorizations explicitly; do not add a mutation endpoint or production probe adapter without mapping it through existing Access Center and Production Ops policy.

Connector activation now binds the reused Business approval to the precise approved record version: the approval's requested object version plus the approval transition increment must equal the current record version. Historical/stale approvals fail preflight even if their status remains `APPROVED`.

Business Source approval latest-wins semantics use migration 020's monotonic `sequence_id`, not timestamps. Fresh Business Runtime initialization now always applies Growth governance migrations 018–020 after the base schema while holding advisory lock `16012027`; keep this ordering synchronized with `migrateGrowthPlatform`.

Migration 021 makes production feature-flag events database-immutable: direct UPDATE and DELETE, including a parent cascade, are rejected. The Business Runtime and Growth migration runner both apply it after migration 020 through the shared `growth_schema_migration` ledger. Retention or erasure must therefore be an explicit governed schema operation, not an application-store side effect.

Migration 022 extends database immutability to `growth_event`, score snapshots, delivery events, identity-review events and connector-binding events. It is applied by the Growth migration runner after all source tables exist and is part of root Growth acceptance. Do not bypass these triggers for normal cleanup or application workflows.

Authorization-reference validation for connector activation and the tenant production feature flag now rejects `sk-`, GitHub-token, Bearer, PEM and JWT-like secret shapes as well as explicit secret key/value strings. Keep identifiers opaque and reference-only; never place credential material in an authorization field.

Outbound delivery registration now validates every persisted reference before fingerprinting. Migration 023 adds PostgreSQL reference-only and secret-material constraints to the ledger; both store-level and direct-SQL rejection are in acceptance. This migration is Growth-runner-only because it depends on delivery migration 014.

Migration 024 and `complete()` apply the same trust boundary to adapter-returned external ID/status. A token-like adapter response cannot complete an operation or enter the ledger; execution records only the sanitized validation error and direct SQL is constraint-rejected.

Connector readiness and the activation Gate both reject health observations later than their local assessment clock. The write path may accept bounded clock skew for transport tolerance, but future evidence stays `STALE` and cannot authorize activation until time catches up.

Channel-account and connector-activation authorization expiry is strict: equality with the assessment clock is expired. Tests cover both exact boundaries; preserve `expiresAt > now` consistently across production gates.

Production feature-flag input is strict at both trust boundaries. The store accepts only actual booleans and bounded uppercase flag identifiers, preventing string coercion such as `"false"` from enabling production behavior. Migration 025 mirrors the key grammar and secret-material rejection in PostgreSQL; its direct-SQL acceptance case must remain green, and both database initializers must keep applying it after migration 024/021 respectively.

Production authorization is time-bounded, not merely future-dated. Connector activation and tenant production feature flags default to a maximum 366-day authorization lifetime; overlong authorization is blocked, and non-positive/non-finite configured windows fail closed. Preserve this ceiling or deliberately tighten it—do not create a perpetual production authorization path.

Business Runtime and the full Growth initializer now use one checksum-aware migration runner under the existing advisory lock. The ledger stores SHA-256 for every applied script, safely adopts legacy null-checksum rows once, and rejects later same-name drift before executing SQL. The dedicated PostgreSQL test is part of root acceptance; never rewrite an applied migration—add a new numbered migration.

Freshness arithmetic is fail-closed. Connector readiness rejects non-finite clocks and invalid/over-24-hour health windows; activation and feature-flag gates reject invalid clocks, and injected configuration cannot widen the 366-day production authorization ceiling. Keep these policy ceilings as upper bounds, not only constructor defaults.

Connector health evidence is bounded before authorization: the local clock must be finite and the reference must be non-secret, control-character-free and no longer than 512 characters. The write still persists only a SHA-256 hash. Tests prove invalid evidence causes zero authorization and database calls.

Outbound retry state is now schedule-bound. Only literal `retryable: true` plus remaining budget and a retry timestamp 1 second–24 hours ahead can enter `RETRYABLE`; all malformed or missing schedules become terminal with sanitized `last_error.retryable=false`. Registration restricts attempts to 1–20 and operation/capability vocabulary, with migration 026 enforcing the latter in PostgreSQL. This migration is full-Growth-only because it depends on delivery migration 014.

Retry and reconciliation are default-deny at the delivery store seam. Console supplies its evaluated Access Center action decision, and the injected integrations verify the action-specific capability (`business.work.control` for retry, `proposal.approve` for reconciliation). Keep both route and store checks; do not revert to trusting a non-empty actor ID.

Identity-review decisions are likewise default-deny in the store, with Console injecting its evaluated `proposal.approve` decision. Human resolution reasons are bounded and reject controls/common raw-secret shapes before authorization. Migration 027 repeats the reason constraint in PostgreSQL and is Growth-runner-only because it depends on identity-review migration 016.

The signed website ingress contract now requires `x-growth-event-id`, 10-digit Unix-second `x-growth-timestamp` and `x-growth-signature`. Sign the exact byte sequence `timestamp.eventId.rawBody` with HMAC-SHA256. Default clock skew is 300 seconds (hard maximum 900), and duplicates still authenticate before replay handling. Producers using the former body-only signature must upgrade before activation; no named production connector is active.

After HMAC verification, website payloads use a bounded schema rather than coercion: only the controlled event vocabulary, literal consent booleans, safe reference IDs, up to 50 product refs and bounded text fields are accepted. Persistent ingestion independently checks the security-critical normalized event contract and rejects adapter bypass/future evidence before acquiring a database connection.

The adapter replay cache is deliberately bounded: 10,000 entries by default and never above 100,000, evicting oldest IDs. Body configuration is also hard-capped at 1 MiB. Treat this cache as a fast path only; the PostgreSQL canonical-event idempotency key is the durable replay defense after eviction or restart.

Official publishing and business adapters now use `official-api-safety.mjs`. Activation booleans are strict, timeouts stay within 100 ms–30 s, HTTP test escape is loopback-only, endpoint userinfo/query/fragment is denied and success bodies are streamed under a configured 64 KiB default/1 MiB ceiling. Returned IDs/statuses are reference-only, publishing drops remote URLs, and business payloads reject secret-bearing keys/values plus excessive shape/size. Preserve this shared boundary for future official connectors.

Credential resolution is included in outbound availability control rather than occurring before all timers. Each official adapter gives the resolver the configured bounded timeout; hangs are retryable, provider exceptions are sanitized, and malformed tokens are terminal before fetch. Do not log or rethrow resolver messages.

Migration 028 closes canonical cross-tenant relationship holes with composite `(id, organization, workspace, tenant)` foreign keys for identity, engagement, score, opportunity and revenue. Matching Store writes also require the scoped parent in their `INSERT ... SELECT`. Event idempotency now verifies exact canonical content after a conflict instead of treating every collision as a duplicate. This migration is full-Growth-only and the dedicated PostgreSQL integrity test is in root acceptance.

Migration 029 and `PostgresGrowthStore` constrain canonical identity to EMAIL/PHONE/DOMAIN with type-specific normalized shapes, lowercase bounded values and controlled uppercase sources. Phone punctuation is removed before matching; domains are hostnames rather than URLs. Keep new identity kinds out until their normalization and database grammar are explicitly designed.

Tenant scope IDs are a shared security primitive: Growth Core accepts only 1–128 index-safe ASCII reference characters. Migration 030 dynamically installs matching checks on all 15 complete-Growth scope tables; it must remain full-Growth-only so the ledger cannot mark it applied before later tables exist. Root PostgreSQL acceptance asserts all 15 constraints.

Canonical immutable events are bounded in `PostgresGrowthStore` and migration 031: controlled event vocabulary, reference IDs, schema 1–100, object payload at most 64 KiB and application-side future-time rejection. The database check is intentionally `NOT VALID` so historic pre-contract immutable `TEST_EVENT` fixture rows do not block migration, but PostgreSQL enforces it for every new row. Do not validate or delete legacy rows outside an explicit governed retention operation.

Canonical lead roots are bounded at both trust boundaries. `PostgresGrowthStore.upsertLead` validates IDs/source/state, object/array JSON shapes and byte sizes, optional market/ICP refs, finite clock and future creation time. Migration 032 immediately checks every new/direct row with `NOT VALID` legacy rollout semantics. Do not expand person/company/score into unbounded document storage.

Canonical engagements use the same two-boundary contract. `PostgresGrowthStore.recordEngagement` rejects unsafe engagement/lead IDs, uncontrolled kind/channel values, non-object or over-64 KiB payloads, invalid clocks and future evidence before SQL. Migration 033 immediately constrains all new/direct rows while leaving legacy validation to an explicit governed retention operation.

Canonical score history remains append-only and is now exact-replay idempotent. `recordScore` bounds IDs, score type, numeric ranges, model/policy refs, factor/dimension JSON and calculation time before SQL; an existing snapshot ID with different immutable content fails closed. Migration 034 mirrors the structural limits for new/direct rows without rewriting legacy history.

Opportunity and revenue persistence now closes the remaining canonical write boundary. Opportunity IDs are lead-stable and fields/downstream refs are bounded; revenue attributions require safe scoped relation refs, non-negative finite amounts, uppercase three-letter currency, object metadata and non-future timestamps. Revenue replays must match every immutable field. Migration 035 applies matching new-row checks without introducing another sales state machine.

Connector binding control inputs are validated before the authorization callback: adapter, binding and actor IDs are bounded and secret-resistant, CAS versions are positive integers, and configuration clocks must be finite. Migration 036 mirrors binding/reference/host/version/hash structure for new direct rows. These checks never activate a binding, resolve a credential value or enable the Runtime.

Read amplification is bounded at the aggregate boundary. Customer 360 validates its lead ID and caps each independent history relation at 200 newest rows; connector audit trails cap the recent window at 500 and then restore chronological presentation. Add cursor pagination before increasing these ceilings rather than returning unbounded tenant history.

Identity resolution validates its target lead reference before the atomic insert/select operation. Migration 037 adds the matching lead ID check for new direct rows (the identity primary key is already native UUID), complementing migration 029's normalized identity value/source contract. Existing deterministic matching and human review behavior is unchanged.

Delivery control methods now share pre-authorization validation for operation/actor IDs, CAS versions and clocks; completion and reconciliation also require bounded, secret-resistant external references. Failure no longer reads the ledger before clock/control validation. Delivery audit is capped at 500 recent rows, and migration 038 mirrors fingerprints, actors, counters and 4 KiB error envelope structure for direct writes.

Identity review decisions validate case/actor/selected-lead references, positive versions, clocks, reasons and dismissal selection rules before authorization or SQL; review audit is capped at 500 recent rows. Migration 039 bounds candidate/evidence arrays, source/hash/idempotency roots and resolution actors for new direct rows. It preserves the existing human-only decision boundary.

Production feature-flag control now validates the actor and optional CAS version before invoking production authorization or opening a transaction. Migration 040 ensures a disabled flag/event cannot retain an authorization reference/hash or expiry, and bounds control IDs/versions. No flag was enabled by this implementation work.

Connector activation gate inputs are normalized before access checks or SQL: activation/binding/incident/actor refs, positive versions, finite clocks and bounded secret-free emergency reasons. Preflight listing also fails closed on an invalid clock. The Console remains read-only for activation and the independent Production Ops gate remains disabled.

Runtime readiness validates every exact binding reference before SQL. Unsafe binding or credential-reference rows block readiness, while credential/health probe exceptions are converted to `CREDENTIAL_REFERENCE_READY`/`RUNTIME_HEALTH` blockers. The gate remains evidence-only: it never consumes approval, reads a credential value or starts Runtime.

Growth's shared tenant source-approval readiness projection validates scope/application identifiers and clock before SQL, and returns at most 100 connectors. Request and decision semantics remain owned by the shared business governance component; do not fork a Growth-specific approval state machine.

Publishing connector evidence validates up to 20 requested platform labels and a finite clock before querying at most 100 accounts. Unsafe credential references are excluded in SQL, and channel authorization must expire within 366 days. The projection contains counts and platform requirements only; no credential reference or value is returned.

Persistent website ingestion now captures one validated time snapshot per call and injects it into the transactional Store and scoring engine. All fallback occurrence/creation times and any identity-review record created after rollback reuse the snapshot, so a non-monotonic clock provider cannot split one event across inconsistent timestamps.

Revenue attribution has an explicit per-row ceiling of 1 trillion currency units in the Store and migration 041. The value remains currency-specific and is never cross-currency summed; the ceiling prevents unbounded PostgreSQL numeric values from degrading the bounded Customer 360 JavaScript aggregate.

Customer 360 returns sorted `revenueByCurrency`. `totalRevenue` is retained for compatibility only when the bounded history has at most one currency; it is `null` for multi-currency history. Do not introduce FX conversion without an authoritative rate source, timestamp and policy.

Growth migration execution now wraps each new migration SQL and checksum ledger insert in one transaction while retaining the session advisory lock. Fault injection verifies a ledger-write failure removes the schema change. Do not add non-transactional DDL such as concurrent index creation to this runner without a separate governed protocol.

Read `ANKSEN_AI_GROWTH_PLATFORM_PLAN.md`, `CLOSED_LOOP_ACCEPTANCE.md`, `IMPLEMENTATION_QUEUE.md`, and `packages/growth-core/README.md`, inspect the first failing or unproven acceptance criterion, and continue from there without restarting product discovery.
