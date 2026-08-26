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
5. The sanitized Pilot readiness evidence is now projected into the authenticated Growth Console without an activation action; keep its tenant isolation and fail-closed API evidence green.
6. Delivery failures, reconciliation mismatches and open identity-review cases now come from scoped PostgreSQL evidence. Identity resolution/dismissal has separate reviewer RBAC, exact-version CAS, candidate validation and immutable audit; keep the browser projection read-only until authenticated end-to-end action UX is proven.
7. Signed ingress, publishing and Business API now have tenant-scoped, default-disabled, CAS/audited connector bindings. Publishing additionally requires an active channel account. The read-only health-probe service has no production adapter registered. Connector activation now has a one-time Gate over existing business approval plus separate `production.request` authorization, but no Console execution endpoint is exposed and no real binding has been activated.
8. The Console provides a read-only activation-preflight projection for production-operations handoff without exposing authorization or credential references. It now reads the existing Production Ops bundle and visibly reports the authoritative global blocked gate. The Gate proves Access Center authorization through the separate `growth_production_operator`, while a second Production Ops seam defaults to deny. Exact-version activation/disable are exercised only by an explicit local governance fixture; neither operation has a Console endpoint. Keep both unexposed until the central policy itself has separately governed authoritative production authorization.
9. Validate KingTurf through governed connectors and downstream mappings only after the existing gates authorize it.
10. Keep the second non-KingTurf tenant proof green without a Core or schema fork.

Read `ANKSEN_AI_GROWTH_PLATFORM_PLAN.md`, `CLOSED_LOOP_ACCEPTANCE.md`, `IMPLEMENTATION_QUEUE.md`, and `packages/growth-core/README.md`, inspect the first failing or unproven acceptance criterion, and continue from there without restarting product discovery.
