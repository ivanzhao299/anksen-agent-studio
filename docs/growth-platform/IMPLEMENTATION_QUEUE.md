# ANKSEN AI Growth Platform — Long-Task Implementation Queue

Status: ACTIVE
Branch: `feature/anksen-ai-growth-platform`
Execution rule: work in ordered slices; each item must produce code/tests/docs/evidence before advancing.

Current evidence snapshot (2026-08-26): GA-000~GA-017 executable acceptance is green. GA-004~007 have signed-event transactional PostgreSQL evidence. GA-010/013 have default-disabled official API adapters plus one shared, retry-bounded and reconcilable delivery ledger; commercial handoff persists references rather than payload copies. The KingTurf and unrelated-tenant Pilot readiness evidence is executable and fail-closed: implementation is ready, but production activation remains blocked by unproven credentials, health, approvals and activation authorization. Governed connector bindings, read-only probes, one-time approval consumption, sanitized Console preflight handoff, exact-version emergency disable and a separated production-operator role are implemented. Central Production Ops policy, tenant-scoped expiring Business Source Governance approval, tenant production feature flag, exact existing Runtime Gate evidence and complete three-kind activation-preflight coverage now override static Pilot evidence. Feature-flag enable and disable mutations additionally default-deny without separate Production Ops authorization. Authenticated mutation endpoints remain deliberately absent and named-platform activation remains open. Continue from `CONTINUATION_HANDOFF.md` and run `pnpm growth-platform:acceptance` before advancing.

An optional tenant Runtime binding now has an immutable seven-field CODEX schema aligned to the existing Activation Gate. Missing binding remains the safe KingTurf state; incomplete or non-CODEX configuration fails during tenant-pack definition rather than degrading into ambiguous runtime evidence.

Connector binding configuration and health-evidence persistence now share a default-deny injected mutation authorization. Read-only health probing has its own pre-adapter default-deny authorization. Readiness remains available to Console, while direct calls cannot silently create bindings, contact probe targets or promote health without an explicitly authorized integration context.

Activation approval proof is version-bound to the exact Business approval transition that produced the current `APPROVED` record. A stale or unrelated historical approval can no longer satisfy connector preflight.

Business Source Governance now resolves latest tenant approval by migration 020's monotonic sequence, including same-clock revoke/reapprove flows. Fresh Business Runtime bootstrap always follows base migrations with the idempotent Growth governance migrations under the shared advisory lock.

Migration 021 enforces production feature-flag event immutability in PostgreSQL. Store tests prove both UPDATE and DELETE fail with SQLSTATE `55000`; the authorization hash remains the only retained authorization evidence.

Growth migrations 012–022 now use a shared database ledger plus the existing advisory lock across initialization paths. Concurrent processes skip already-applied DDL instead of repeatedly rebuilding triggers while business transactions are active.

Migration 022 makes the remaining authoritative Growth event and score-history tables database-immutable. The root acceptance gate checks all triggers and proves canonical event UPDATE/DELETE rejection.

Production authorization reference validators now reject common raw-secret formats across connector activation and feature flags, with direct PostgreSQL/store integration evidence.

Migration 023 and delivery-store validation prevent secret-like idempotency, adapter, asset or approval references from entering the outbound ledger, including direct database bypass attempts.

Migration 024 constrains external delivery IDs/statuses, while the completion path converts unsafe adapter responses into sanitized terminal failures rather than persisted remote content.

Future-dated connector health is now stale in readiness and independently blocked by the activation Gate, closing a clock-skew freshness bypass.

Channel accounts and connector activation now expire at the exact boundary, consistent with source approvals and tenant feature flags.

Production feature flags now reject non-boolean mutation input and uncontrolled key names before authorization or persistence. Migration 025 mirrors key and secret-reference constraints in PostgreSQL, including direct-SQL bypass evidence, and is included in both applicable migration paths.

Connector activation and production feature-flag authorization now have a default 366-day maximum lifetime. Invalid policy windows fail at construction, and an arbitrarily distant future expiry cannot create a de facto perpetual production grant.

The shared Growth migration ledger now records SHA-256 checksums across both initialization paths. Legacy rows receive a one-time checksum adoption; subsequent same-name script drift fails closed and is exercised by the root PostgreSQL acceptance gate.

Health and expiry arithmetic now rejects invalid clocks and non-finite windows. Connector health may be tightened but not widened beyond 24 hours; production authorization may be tightened but not widened beyond 366 days, closing `NaN` and oversized-policy bypasses.

Health-evidence references are now bounded to 512 safe characters and validated with the local clock before mutation authorization or SQL. Storage remains hash-only, and invalid adapter output produces no governance or persistence side effects.

Delivery retries require literal boolean intent, remaining attempt budget and a 1-second–24-hour future schedule; otherwise they terminate safely. Registration validates 1–20 attempts and controlled operation/capability values, and migration 026 blocks direct SQL bypass for operation metadata.

## Program objective

Build a reusable, multi-tenant AI Growth Platform on the existing ANKSEN runtime. KingTurf is the first pilot tenant, not a product boundary.

## GA-000 — Architecture & Boundary Freeze
Deliverables:
- product architecture baseline
- reusable-core vs tenant-pack boundary
- package boundaries
- shared runtime reuse rules
- security and policy boundaries
- acceptance criteria

Acceptance:
- Core contains no KingTurf-specific logic
- no duplicated Kernel/Scheduler/Worker/Approval/Audit
- all outbound channel writes routed through adapter contracts

Status: BASELINE COMPLETE; CONTINUOUS BOUNDARY ENFORCEMENT

## GA-001 — Growth Domain Model & Tenant Kit
Deliverables:
- canonical entity schemas
- tenant/brand/market/ICP/channel-policy schemas
- product reference mapping
- KingTurf example tenant pack
- validation tests

Acceptance:
- second unrelated tenant can be represented without schema fork
- tenant isolation fields mandatory

## GA-002 — Channel Adapter Framework
Deliverables:
- capability registry
- connector interface
- normalized results/errors
- health/rate-limit state
- mock connector
- idempotency and audit envelope

Acceptance:
- unsupported capability fails closed
- mock connector demonstrates publish/read/ingest contract

## GA-003 — Canonical Growth Events & Audit
Deliverables:
- event contracts
- webhook/event ingestion envelope
- replay protection
- idempotency keys
- audit integration

Acceptance:
- duplicate event cannot create duplicate business mutation

## GA-004 — Prospect Discovery Ingestion
Deliverables:
- discovery source contract
- prospect/company/profile records
- source provenance
- deduplication pre-processing
- discovery workflow

Acceptance:
- one connector can produce auditable prospects without manual re-entry

## GA-005 — Identity Resolution / Lead Graph
Deliverables:
- person/company identity nodes
- aliases and source profiles
- deterministic match engine
- confidence-scored probabilistic matching
- merge/review/reversal workflow

Acceptance:
- identities from at least two sources can link to one canonical prospect with evidence

## GA-006 — Signals & Explainable Scoring
Deliverables:
- Fit Score
- Intent Score
- Engagement Score
- Opportunity Score
- time decay
- factor contribution
- scoring history

Acceptance:
- score changes show source factors and timestamps
- tenant rules configurable without Core modification

## GA-007 — Lead / Customer 360
Deliverables:
- lead detail projection
- company/person graph
- interaction timeline
- score history
- source attribution preview
- qualification workflow

Acceptance:
- operator can understand why a lead exists and why it is qualified

## GA-008 — Content Strategy Bridge
Deliverables:
- insight -> content brief workflow
- product/market/ICP context contract
- brand-policy checks
- review/approval state

Acceptance:
- tenant content brief can be generated without hard-coded industry logic

## GA-009 — AI Content / Video Factory Integration
Deliverables:
- text/image/video production job contract
- asset reference model
- localization variants
- brand template mapping
- reusable integration with existing Video Factory

Acceptance:
- Growth does not duplicate video runtime

## GA-010 — Multi-Channel Publishing
Deliverables:
- publish plan
- scheduled publishing
- approval gate
- connector execution
- retry/failure states
- performance reference tracking

Acceptance:
- publish through mock + first production connector behind feature flag

## GA-011 — Engagement Ingestion
Deliverables:
- comments/messages/forms/web events normalization
- lead linking
- engagement score updates
- response recommendation contract

Acceptance:
- an inbound event updates the right scoped lead safely

## GA-012 — Sales Qualification & Next Best Action
Deliverables:
- MQL/SQL or tenant-configurable qualification states
- qualification reasons
- next-best-action engine
- human handoff rules

Acceptance:
- qualified lead can produce a controlled sales action recommendation

## GA-013 — CRM / RFQ / Quote / Order Integration
Deliverables:
- business integration adapter interfaces
- customer/opportunity/RFQ/quote/order references
- KingTurf Business OS mapping contract
- sync and reconciliation states

Acceptance:
- downstream commercial object remains authoritative in target business system

## GA-014 — Follow-up Orchestration
Deliverables:
- cadence policy
- channel preference
- stop rules
- response-aware follow-up
- approval/risk controls

Acceptance:
- no uncontrolled bulk outreach
- follow-up stops on conversion, opt-out or policy threshold

## GA-015 — Revenue Attribution Engine
Deliverables:
- touchpoints
- conversion/revenue events
- attribution window
- first/last/linear/configurable models
- source/content/channel/campaign attribution

Acceptance:
- one order/revenue event traces back to acquisition touches

## GA-016 — Growth Director & Experimentation
Deliverables:
- KPI objective model
- performance analysis
- recommendation generation
- experiment design
- channel/content/ICP optimization suggestions

Acceptance:
- recommendations optimize toward qualified pipeline/revenue, not vanity metrics

## GA-017 — Executive Dashboard & Autonomous Closed Loop
Deliverables:
- Growth cockpit
- funnel
- channel/content/market/product performance
- attribution
- Agent recommendations
- exception/approval queue links

Acceptance:
- executive can trace from revenue -> opportunity -> lead -> touchpoint -> content/channel

## Cross-cutting gates

Every GA item must satisfy:
- organization/workspace/tenant isolation
- RBAC
- audit
- version/CAS where mutable business state is involved
- idempotency for external writes
- no secrets in business records/logs/client APIs
- failure/retry semantics
- unit/integration tests
- compatibility with existing enterprise acceptance gates

## Pilot strategy

Wave 1:
- one KingTurf export market
- one or two product families
- `kingturf.cn` as conversion hub
- website plus two external channels
- KingTurf Business OS as downstream sales system

Wave 2:
- expand markets/channels/products
- validate second internal tenant

Wave 3:
- package as reusable external-customer deployment

## Current execution order

1. Keep the unified local and CI acceptance gate green.
2. Harden persistent GA-004 discovery, GA-005 identity resolution, GA-006 score history and GA-007 Customer 360 evidence.
3. Harden GA-008~GA-017 connector reconciliation, retry, approval/failure paths, UI and operational evidence.
4. Keep the authenticated, sanitized Pilot readiness Console projection and tenant fail-closed boundary green; it must not gain an activation control.
5. Keep the persisted tenant-scoped identity-review lifecycle green: conflict capture, live backlog, exact-version reviewer resolution/dismissal, candidate validation, immutable audit and read-only browser projection are implemented.
6. Governed bindings, injected read-only probes and a one-time existing-business-approval Activation Gate now cover signed ingress, publishing and Business API. Add read-only preflight/production-ops handoff and rollback proof; no production probe or activation endpoint is registered.
7. Validate the KingTurf pilot without moving tenant-specific logic into Core or bypassing activation gates.
8. Keep the second non-KingTurf tenant validation green without a schema or Core fork.
