# SP-000 Smart Park Business Platform Current-State Audit

## Audit basis

Target repository:

`/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park`

Audit date: 2026-07-20

Only implementation evidence is counted. Product notes, plans, menu labels, hidden routes, migrations without consuming code, and controlled-stub results do not prove a complete business capability.

Status meanings:

- `IMPLEMENTED_BASELINE`: real model/API/page chain exists, but product completion still requires domain acceptance.
- `PARTIAL`: material implementation exists but the named business domain is incomplete.
- `PROTOTYPE`: UI, adapter, skeleton, or limited vertical slice exists without a complete domain loop.
- `MISSING`: no matching business implementation was found.
- `FOUNDATION_ONLY`: shared platform capability exists but must not be presented as the named business application.
- `UPSTREAM_PLATFORM_BOUNDARY`: the capability belongs to an independent group platform; Smart Park is responsible only for a governed integration contract.

## Corrected product boundary

Group Strategy Execution, Group Human Resources and Group Finance are independent products at group level. Their absence from `jinhu-smart-park` is expected and must not be recorded as a Smart Park product gap. Smart Park owns park operational facts and consumes or publishes only governed cross-platform contracts.

## Repository baseline

| Evidence | Result |
| --- | --- |
| API modules | 46 module directories under `apps/api/src/modules` |
| API controllers | 85 `*.controller.ts` files |
| TypeORM entities | 139 `*.entity.ts` files |
| Web routes | 144 `page.tsx` files |
| E2E smoke scripts | 27 scripts matching `scripts/e2e/*smoke*.mjs` |
| Typecheck | PASS on 2026-07-20 |
| Lint | PASS on 2026-07-20 |
| API build | PASS on 2026-07-20 |
| Web production build | PASS; `.next/BUILD_ID=XHi5vYHimEeHVvVePENsU` |
| Existing unrelated changes | only `ops/agent-orchestrator` runtime queue/event files; excluded from this program |

Reproducible evidence command:

`pnpm smart-park:audit -- /Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park`

Current source fingerprint:

`35536534f044056fdeafed32f5498075e1880fb7bc9c21c0f1d7d07f42a7846a`

Build success establishes an engineering baseline only. It does not prove that all routes work with real roles, data, external systems, or production configuration.

## Business-domain matrix

| Program task | Business domain | Status | Real implementation evidence | Missing proof / required work |
| --- | --- | --- | --- | --- |
| SP-010 | Platform governance | IMPLEMENTED_BASELINE | `orgs`, `users`, `roles`, `permissions`, `data-scopes`, `field-policies`, `saas-modules`, `files`, `attachments`, `audit`; corresponding `/system/*` pages | Consolidate organization/post semantics, module-route-permission consistency, integration tests, master-data ownership and migration governance |
| SP-030 | Group Strategy integration | UPSTREAM_PLATFORM_BOUNDARY | No strategy ownership model exists in the park repository, which is the correct boundary | Define KPI target input, actual-value output, risk and drill-down-reference contracts; do not build Group Strategy here |
| SP-040 | Group HR integration | UPSTREAM_PLATFORM_BOUNDARY | `orgs`, `posts` and `users` provide a local authorization view; no employee lifecycle domain exists | Define organization/person/position/assignment synchronization and identity references; do not build Group HR here |
| SP-050 | Group Finance integration | UPSTREAM_PLATFORM_BOUNDARY | No general ledger, group budget or accounts-payable modules exist, which is the correct boundary | Define park settlement voucher, reconciliation, posting-result and error-receipt contracts; do not build Group Finance here |
| SP-145 | Park settlement and billing | IMPLEMENTED_BASELINE | leasing receivable/payment/invoice/waiver/refund controllers and entities; migrations `000052`–`000057`; finance and leasing pages; payment/invoice/waiver E2E | Preserve park receivable and collection facts, close reconciliation gaps, and publish controlled vouchers to Group Finance |
| SP-130 | Asset and space | IMPLEMENTED_BASELINE | `assets.controller.ts`, `assets.service.ts`, park/building/floor/unit entities; `/assets/*`; `s2b-smoke.mjs`; `s3a-park-tenant-smoke.mjs` | Validate imports/exports, enterprise-space links, data quality, current occupant, cross-domain 360 and role-specific acceptance |
| SP-140 | Investment, CRM, contract and leasing | IMPLEMENTED_BASELINE | leasing lead/pool/quote/statistics, contract/unit/status log, changes, checkout/refund controllers; `/invest/*` and `/leasing/*`; `s3b`, `s3c`, `s3e` E2E | Resolve duplicate invest/leasing routes, prove quotation-to-contract-to-checkout chain, add product-level browser regression and finance reconciliation |
| SP-150 | Tenant service, workflow and work orders | IMPLEMENTED_BASELINE | `work-orders` controller/service/query/SLA entities; `workflow` message service; `/tenant/service`, `/workflow/inbox`, `/workorders/*`; migrations `000071`–`000079` | Root E2E has limited work-order coverage; complete attachment, evaluation, cross-domain source links, role/mobile/browser regression and SLA observability |
| SP-160 | Safety, inspection, emergency and permits | IMPLEMENTED_BASELINE | inspect plans/tasks/points/templates, hazards/status logs, emergency plan/contact/event/timeline, work permits; `/safety/*`; `s5a`, `s5b`, module-access smoke | Re-run production Gate with real roles and fixtures, verify every status transition, attachment/evidence, overdue/recheck, work-order linkage and audit |
| SP-170 | Engineering lifecycle | IMPLEMENTED_BASELINE | project, plan, daily report, inspection/issue, rectification and acceptance controllers/entities; `/engineering/*`; extensive service/repository/state-machine/integration specs | Add stable root-level E2E and browser workflow, validate real role/data-scope/UAT and migration rehearsal across the full EPDR chain |
| SP-180 | IoT platform | IMPLEMENTED_BASELINE | gateway/device/protocol/metric/ingest/MQTT/alert/rule/scene controllers and entities; `/iot/*`; `s9a`–`s9d1` smokes | Not in root `test:e2e`; real broker/device connectivity, command safety, retained/offline behavior, load, retries and production credential references remain unproven |
| SP-190 | Energy management | IMPLEMENTED_BASELINE | meter/reading/alert/billing cycle/item/adjustment/allocation controllers/entities; `/energy/*`; `s9e`, `s9f`, `s9f1` smokes | Prove meter ingestion, tenant allocation, accounting reconciliation, close/reversal concurrency, billing exports and production-scale data |
| SP-200 | Video security | IMPLEMENTED_BASELINE | platform adapters, camera, preview/config, alert and evidence controllers/entities; `/admin/video-security/*`; `s8c`–`s8f` smokes | Prove real platform credentials/streams, failure recovery, retention/access policy, browser playback and safety evidence chain; smokes are not in root E2E |
| SP-210 | Robot operations | PARTIAL | `robots.controller.ts`, `robots.service.ts`, command log, Ezviz adapter; `/robots/overview` and `/robots/cleaning`; migrations `000132`, `000134`, `000138` | No dedicated robot E2E found; missing generic task/history/track domain, multi-vendor contract, command fencing, failure recovery and work-order linkage proof |
| SP-220 | BIM and digital twin | PROTOTYPE | `/bim/overview` page, menu/module permissions | No BIM API module, model/space/device entities, upload/conversion pipeline, mapping APIs or tests found. Current page is not a digital-twin operating loop |
| SP-230 | AI park operations | PROTOTYPE | `/ai/assistant`; `ai-work-plans` and autonomous-development modules provide task-planning infrastructure | No AI chat/RAG domain, authorized operational data retrieval contract, domain answer evaluation, model credential gate or governed action loop proven |
| SP-240 | Park operations cockpit | PROTOTYPE | `/cockpit/overview`, permission/module enablement and static cross-module presentation | No dedicated cockpit API/semantic metric layer found; executive/invest/assets/finance/safety routes are explicitly disabled placeholders in `apps/web/lib/menu.ts` |

## Cross-domain findings

### 1. Product navigation and release scope diverge

`apps/web/lib/menu.ts` defines a broad application menu, while `FIRST_RELEASE_MENU_PATHS` exposes a smaller subset. Multiple second-phase routes remain directly reachable even when hidden from the menu. Completion requires route, menu, module authorization, RBAC and documented release scope to agree.

### 2. Automated testing is uneven

The root `test:e2e` command covers platform, assets, tenants, leasing/finance and safety. IoT, energy and video have directed smoke scripts but are not part of the root E2E chain. Engineering has unusually strong unit/integration coverage but still needs a stable browser-level business journey. Robot, BIM, cockpit, strategy and HR lack equivalent domain E2E evidence.

### 3. Park settlement is not Group Finance

The implemented finance-labelled routes cover park receivables, payments, aging, invoices, waivers and refunds. This is valuable park settlement capability, not an incomplete group finance system. It remains in Smart Park as SP-145 and sends controlled accounting facts to the independent Group Finance Platform.

### 4. Park organization views are not Group HR

The existing organization, post, user and role structures are identity and authorization views. Employee records, recruitment, movement, performance and talent workflows belong to the independent Group HR Platform. Smart Park must consume governed references rather than recreate that domain.

### 5. External-integration readiness is not proven locally

IoT, video and robot adapters exist. Production broker, camera platform and robot connectivity, credential references, failure behavior, volume and recovery remain separate acceptance gates. They must not be marked production-ready from source presence or fixture smoke alone.

## SP-000 disposition

The repository has a viable engineering baseline and substantial park-operation implementation. The completion program must not rewrite mature modules indiscriminately. It should:

1. establish governed KPI, people-master and finance-voucher integration contracts with the three independent group platforms;
2. preserve park settlement as a park domain and close its reconciliation gaps;
3. close acceptance and integration gaps in existing operational modules;
4. convert BIM, AI and the Park Cockpit prototypes into real cross-domain products;
5. enforce one consistent module/RBAC/route/release contract;
6. add an evidence-backed validation matrix that runs by park domain and as a complete release gate.

SP-000 can move to completion only after this matrix is linked to the persistent Program Goal and its evidence snapshot can be reproduced by an audit command. That reproducible audit command is the next implementation item.
