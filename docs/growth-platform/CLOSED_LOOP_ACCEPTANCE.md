# ANKSEN AI Growth Platform — Closed-loop Acceptance

## Product closure
A tenant must be able to execute: discovery → identity resolution → lead → explainable score → engagement → next-best-action → qualified opportunity → downstream handoff → revenue attribution → management report.

## Mandatory gates
1. Core contains no KingTurf-specific logic.
2. Every authoritative object/event is organization/workspace/tenant scoped.
3. Cross-tenant operations fail closed.
4. Channel adapters declare capability, risk and approval policy; official API/webhook is preferred.
5. External writes are idempotent/auditable; high-risk automation remains optional.
6. Score is explainable and versioned.
7. Identity resolution deduplicates repeated discovery.
8. Opportunity handoff uses an adapter boundary; CRM/ERP remains authoritative downstream.
9. Revenue attribution references opportunity and lead.
10. Closed-loop automated test passes.

## Persistent GA-004~007 evidence

- Signed website conversion events are normalized by the connector and committed through one PostgreSQL transaction.
- Replayed event IDs return the existing lead without duplicating engagement, score or audit mutations.
- Deterministic email/domain identity evidence reuses the scoped canonical lead; conflicting identities roll back and require human review.
- Score snapshots are immutable and event-idempotent, while distinct events at the same timestamp remain distinct history.
- Customer 360 reads tenant-scoped identities, engagements, score history, opportunities, revenue and audit timeline; cross-tenant reads return no record.

## Governed GA-010 delivery evidence

- The first official-API publishing adapter is disabled by default, HTTPS-only outside tests, host-allowlisted and credential-reference based.
- Every external write carries an idempotency key and an existing validated approval reference; credential values, content bodies and raw error messages are not persisted.
- The PostgreSQL delivery ledger records request fingerprints, CAS versions, bounded attempts, retry classification, external IDs and reconciliation state without creating a second Scheduler or Queue.
- Rate limits and server failures may become `RETRYABLE`; policy/approval failures become terminal. Completed writes can be reconciled as `MATCHED` or `MISMATCH`.

## Governed GA-013 handoff evidence

- Commercial handoff requires an existing approval reference when the downstream adapter declares approval.
- The default-disabled official Business API adapter returns only authoritative downstream references and never promotes Growth projections into CRM/ERP truth.
- RFQ/quote/order handoffs reuse the same delivery ledger and pass only a controlled source reference; commercial payloads and credentials are not copied into the ledger.

## Read-only operations evidence

- `/growth-sales` exposes delivery totals, running/retryable counts and sanitized exception/reconciliation items through a tenant-scoped PostgreSQL endpoint.
- The endpoint returns an explicit unavailable/migration-required status instead of mutating schema during a read.
- The browser projection cannot receive credential references, approval references, request fingerprints, source references or raw error messages, and it cannot trigger retries.

## Governed operator control evidence

- Every delivery transition is captured by a PostgreSQL trigger in an immutable, tenant-scoped audit trail with actor, CAS version, status and sanitized outcome metadata.
- A sales operator with `business.work.control` may only bring an already-`RETRYABLE`, below-limit operation forward to its next eligible execution time; the request does not call an external system or create another worker.
- Reconciliation requires separate `business.manage + proposal.approve` authority, an exact operation version and an observed external ID.
- Sales reviewers cannot request retries or assert reconciliation, and ordinary sales operators cannot assert reconciliation.

## GA-000~017 definition of done
GA-000 architecture/boundaries; GA-001 tenant/domain model; GA-002 channel contract; GA-003 events/audit; GA-004 discovery; GA-005 identity graph; GA-006 scoring; GA-007 360 projection; GA-008 content strategy contract; GA-009 media-factory adapter; GA-010 publishing contract; GA-011 engagement ingestion; GA-012 qualification/NBA; GA-013 downstream opportunity handoff; GA-014 follow-up action; GA-015 revenue attribution; GA-016 optimization inputs/decision action; GA-017 executive closed-loop report.

The current reusable core implements the minimum executable vertical slice for all stages. Production connectors, tenant packs and UI are incremental adapters/surfaces and must not alter the core boundary.

## Pilot policy
KingTurf is the first reference tenant. Its product catalog, ICPs, countries, keywords, scoring weights, content policy, sales playbook and Business OS mappings belong in a tenant/industry pack, never reusable core.

## Pilot readiness evidence

- `pnpm --filter @anksen-agent-studio/growth-core pilot:readiness` evaluates implementation evidence separately from production activation evidence and is part of the root and CI acceptance gates.
- The KingTurf snapshot proves the tenant pack, scoped channel mix, signed website connector, official publishing/business adapter boundaries, persistence migrations, delivery audit/ledger and unrelated second-tenant validation.
- The snapshot truthfully remains `PILOT_ACTIVATION_BLOCKED` while credential references, connector health, data-owner approval, production feature flag, Runtime Activation Gate or explicit production authorization are absent.
- Readiness assessment is pure and read-only: it cannot resolve credential values, invoke connectors, mutate production, or enable a Runtime.
- The authenticated Growth Console projects the same versioned report and its blockers through a read-only endpoint; it exposes no activation control and rejects an explicitly different tenant context.
- Console delivery-failure and reconciliation-mismatch counts come from the tenant-scoped PostgreSQL ledger. Missing tables/connections and the not-yet-persisted identity-review backlog remain unobserved blockers; absence of evidence is never converted to zero.
- Conflicting deterministic identities roll back the lead mutation, then idempotently create one tenant-scoped identity-review case containing only candidate lead IDs, identity types and a hashed external reference. The readiness backlog is counted from open persisted cases.
- Identity-review resolution or dismissal requires the dedicated sales-review action, an exact case version, a reason and—for resolution—a lead from the recorded candidate set. PostgreSQL triggers preserve opened/resolved/dismissed audit events; the browser remains read-only and omits raw identity values and external references.
- Publishing Credential Reference presence is derived from active, unexpired, tenant-workspace-scoped `channel_account` business records. The projection returns only a configured count and `credentialValuesRead: false`; account configuration is reported as `CONFIGURED_NOT_PROBED`, never promoted to connector health.
- Website ingress, publishing and Business API bindings have one tenant-scoped governed registry. Bindings store reference IDs and allowlisted hosts—not credential values—are default-disabled, use CAS for configuration and hash health evidence. Readiness reports missing bindings, disabled state and stale probes as blockers; no probe or activation is performed by assessment.
- The health-probe seam accepts only adapters declaring `READ_ONLY_HEALTH_PROBE`, permits pre-activation probing of disabled bindings but rejects stale versions, passes a Credential Reference identifier rather than resolving a value, and returns explicit `externalWritesPerformed: false`. Raw probe evidence is hashed before persistence and omitted from audit/readiness projections.
- Connector activation reuses the conventional Growth `connector_activation` record and existing `business_approval`; it does not add an approval engine. The Gate separately requires `production.request`, exact request/binding versions, matching tenant/kind, fresh healthy evidence, an unexpired explicit authorization reference and one-time atomic consumption. No Console activation endpoint or button is exposed.
- The authenticated Console exposes a tenant-scoped, read-only activation-preflight list for production-operations handoff. It returns current request/binding versions, health status and blocker codes only; Credential References, explicit authorization identifiers, approval comments and raw probe evidence remain server-side, and the projection performs no external call or activation.
