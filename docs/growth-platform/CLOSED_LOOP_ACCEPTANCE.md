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

## GA-000~017 definition of done
GA-000 architecture/boundaries; GA-001 tenant/domain model; GA-002 channel contract; GA-003 events/audit; GA-004 discovery; GA-005 identity graph; GA-006 scoring; GA-007 360 projection; GA-008 content strategy contract; GA-009 media-factory adapter; GA-010 publishing contract; GA-011 engagement ingestion; GA-012 qualification/NBA; GA-013 downstream opportunity handoff; GA-014 follow-up action; GA-015 revenue attribution; GA-016 optimization inputs/decision action; GA-017 executive closed-loop report.

The current reusable core implements the minimum executable vertical slice for all stages. Production connectors, tenant packs and UI are incremental adapters/surfaces and must not alter the core boundary.

## Pilot policy
KingTurf is the first reference tenant. Its product catalog, ICPs, countries, keywords, scoring weights, content policy, sales playbook and Business OS mappings belong in a tenant/industry pack, never reusable core.
