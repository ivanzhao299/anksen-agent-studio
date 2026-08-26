# ANKSEN AI Growth Platform — Product & Engineering Plan

Status: ACTIVE IMPLEMENTATION BASELINE
Branch: `feature/anksen-ai-growth-platform`
Pilot tenant: KingTurf
Product boundary: reusable multi-tenant platform capability, not KingTurf-specific code

## 1. Product definition

ANKSEN AI Growth Platform is a reusable AI-native growth, customer-acquisition and revenue-attribution platform built on top of the existing ANKSEN intelligent runtime. It is designed to be deployed repeatedly across companies, brands, products and industries.

KingTurf is the first design partner, pilot tenant and reference implementation. KingTurf validates the platform in production, but no reusable core module may depend on artificial-grass-specific rules, schemas, vocabulary or workflows.

The platform must support the full commercial loop:

`Market intelligence -> Content -> Distribution -> Discovery -> Lead -> Identity resolution -> Qualification -> Engagement -> Opportunity -> RFQ/Quote -> Order/Contract -> Revenue -> Attribution -> Optimization`

The objective is not bulk account-control automation. The objective is a governed growth operating system that can continuously discover demand, generate and distribute content, identify and score prospects, coordinate follow-up, synchronize business systems and optimize toward qualified pipeline and revenue.

## 2. Architecture principles

1. Core is industry-neutral and tenant-aware.
2. Business systems remain authoritative systems of record.
3. ANKSEN Kernel/Scheduler/Worker/Runtime/Approval/Audit are reused; no second orchestration stack is created.
4. Official APIs and webhooks are preferred over browser automation; browser/RPA adapters are explicitly secondary and policy-gated.
5. Every external action is auditable, rate-limited, tenant-scoped and attributable to an Agent/workflow/user.
6. High-risk outbound actions require approval policies configurable by tenant/channel.
7. Channel state is normalized behind adapters; platform logic does not depend on a channel-specific API shape.
8. Revenue attribution is a first-class object, not a dashboard afterthought.
9. Industry behavior is delivered through configuration, knowledge, policies, prompt/skill contracts and integration mappings rather than forks.
10. A tenant may disable AI execution and still operate conventional records, queues, campaigns, leads and opportunities.

## 3. Product layering

### 3.1 ANKSEN Runtime Foundation
Existing shared platform capabilities:
- Kernel / Planner / Scheduler / Worker / Runtime adapters
- Business record store
- Approval and audit
- Runtime memory
- My Work / Cockpit
- RBAC, organization/workspace scopes
- Resident runners and controlled execution

### 3.2 Growth Core
Reusable domain primitives:
- Tenant / brand / market / product catalog
- ICP definitions
- Lead and account graph
- Identity resolution
- Lead/customer 360
- Intent signals
- Scoring and qualification
- Campaigns and journeys
- Engagement records
- Opportunities
- Attribution and revenue events
- Experiment definitions
- Next-best-action recommendations

### 3.3 Growth Agent Layer
Initial professional Agent roles:
- Growth Director Agent
- Market Research Agent
- Lead Discovery Agent
- Lead Intelligence Agent
- Identity Resolution Agent
- Content Strategy Agent
- Content Production Agent
- Publishing Agent
- Engagement Agent
- Sales Qualification Agent
- Follow-up Agent
- Attribution Analyst Agent

### 3.4 Channel Hub
Standard adapter contract for:
- TikTok
- Douyin
- LinkedIn
- Meta
- Google Ads / Search / Analytics
- YouTube
- WhatsApp
- Email
- WeChat / WeCom
- Website / landing pages
- Commerce / marketplace channels

Adapter priorities:
1. Official API / SDK
2. Webhook / event subscription
3. Authorized browser workflow
4. RPA fallback only when legally and operationally acceptable

### 3.5 Content Factory
Reusable pipeline:
`insight -> brief -> script -> asset generation -> localization -> brand compliance -> review -> publish package -> publish -> performance feedback`

Supported content forms:
- text
- image
- video
- voice
- subtitles
- translation/localization
- multi-format adaptation
- brand templates

The existing ANKSEN Video Factory should be used as a shared production capability rather than duplicated inside Growth Platform.

### 3.6 Business Integration Layer
Standard integration contracts:
- CRM Adapter
- ERP Adapter
- Commerce Adapter
- Website Conversion Adapter
- RFQ Adapter
- Quote Adapter
- Contract Adapter
- Order Adapter
- Payment / Revenue Adapter

Business systems own downstream business truth. Growth Platform stores references and projections required for attribution and orchestration.

### 3.7 Tenant / Industry Pack
Each deployment supplies configuration and knowledge such as:
- tenant identity
- brands
- target markets
- languages
- product catalog mapping
- ICPs
- customer segmentation
- keywords and search semantics
- scoring policy
- content policy
- sales playbooks
- channel strategy
- approval policy
- compliance policy
- CRM/ERP field mapping
- conversion events
- attribution windows

KingTurf is implemented as the first Industry/Tenant Pack.

## 4. Core domain model

Minimum entities:

### Organization and configuration
- GrowthTenant
- Brand
- Market
- ProductCatalogRef
- ICPDefinition
- ChannelAccount
- ChannelPolicy
- SalesPlaybook
- ContentPolicy

### Acquisition and identity
- Prospect
- PersonIdentity
- CompanyIdentity
- IdentityAlias
- IdentityMatch
- SourceProfile
- IntentSignal
- EngagementSignal
- Lead
- LeadScoreSnapshot
- LeadQualification

### Marketing and content
- Campaign
- AudienceSegment
- ContentBrief
- ContentAsset
- ContentVariant
- PublishPlan
- PublishExecution
- ChannelPerformanceSnapshot

### Commercial pipeline
- CustomerRef
- Opportunity
- OpportunityStageEvent
- RFQRef
- QuoteRef
- ContractRef
- OrderRef
- PaymentRef
- RevenueEvent

### Intelligence and optimization
- AttributionTouch
- AttributionResult
- Experiment
- ExperimentVariant
- Recommendation
- NextBestAction
- GrowthObjective
- GrowthKPI

Every record carries organization/workspace/tenant scope, immutable ID, version, status, owner, created/updated timestamps and audit linkage.

## 5. Lead Graph and identity resolution

A core differentiator is the unified lead/customer graph.

The system must associate multiple external identities with the same prospect/account across channels while preserving provenance and confidence. Matching must use deterministic evidence first and probabilistic evidence second.

Evidence classes:
- verified email
- verified phone / WhatsApp
- company domain
- CRM customer ID
- website session / form identity
- social profile URL / platform ID
- name + company + region
- behavioral correlation

Identity merges are reversible, auditable and confidence-scored. Low-confidence merges require human review or remain soft-linked.

## 6. Scoring model

The platform separates at least four scores:
- Fit Score: ICP/company fit
- Intent Score: buying-intent evidence
- Engagement Score: interaction depth and recency
- Opportunity Score: probability/value of commercial conversion

A composite qualification score may be configured by tenant.

Scoring must support:
- deterministic rules
- weighted factors
- time decay
- model-based estimates
- per-market overrides
- explainable factor contribution
- score history

No tenant-specific product scoring logic may be hard-coded into Growth Core.

## 7. Growth Director control loop

The Growth Director Agent is the supervisory intelligence layer. It should continuously evaluate:
- channel performance
- content performance
- lead quality
- conversion rates
- pipeline velocity
- cost per qualified lead
- cost per opportunity
- attributed revenue
- win rate
- market/product performance
- failed workflows and blocked actions

It produces controlled recommendations or actions:
- adjust content themes
- change audience/ICP priority
- rebalance channel effort
- change publishing cadence
- refine qualification thresholds
- recommend follow-up
- recommend experiment variants
- escalate weak conversion stages

The Growth Director must optimize toward business outcomes, not vanity metrics.

## 8. Channel Adapter contract

Each channel connector should implement a normalized contract where capability exists:
- authorizeAccount
- refreshAuthorization
- getAccountHealth
- publishContent
- scheduleContent
- readContentPerformance
- readComments
- replyComment
- readMessages
- sendMessage
- readFollowersOrAudience
- searchProfilesOrContent
- ingestLeadEvent
- handleWebhook
- getRateLimitState

Every adapter must declare capabilities because many platforms do not expose all operations.

Each call must return:
- tenant/channel/account
- external object ID
- normalized status
- external status
- retryability
- rate-limit state
- audit metadata
- sanitized error

Unsupported or prohibited capabilities fail closed.

## 9. Automation and policy boundaries

Bulk follow, forced messaging, account farming, artificial engagement and similar high-risk automation are not core product requirements.

They may only exist as isolated optional channel capabilities if all of the following are true:
- compliant with platform and legal requirements
- explicitly enabled by tenant admin
- rate-limited
- approval/policy gated where needed
- fully auditable
- replaceable without affecting Growth Core

Core business value must survive removal of all browser/RPA automation.

## 10. Integration with existing ANKSEN architecture

The repository already defines `/growth-sales` as an independent business application on the common ANKSEN intelligent runtime. Growth Platform therefore extends and deepens that application rather than introducing a parallel kernel or application shell.

Required reuse:
- business record and relation contracts
- organization/workspace scope
- conventional record details
- Workflow/Skill/Agent contracts
- async delegation
- approval model
- audit events
- execution projection
- resident runners
- My Work
- Cockpit aggregation

New reusable packages should own domain logic while `/growth-sales` remains the first enterprise UI surface.

## 11. Proposed package boundaries

- `packages/growth-core` — pure domain model, policies, scoring, identity and attribution
- `packages/growth-connectors` — channel adapter interfaces and implementations
- `packages/growth-agents` — skills, prompts/contracts and Agent role definitions
- `packages/growth-integrations` — CRM/ERP/commerce/business-system adapters
- `packages/growth-analytics` — metrics, attribution, experimentation, recommendations
- `packages/growth-tenant-kit` — tenant/industry-pack schema and validation

Existing `packages/domain-center` remains the enterprise record registry/integration surface. Growth packages must integrate with it instead of replacing it.

## 12. API surface

Initial API families:
- `/api/growth/tenants`
- `/api/growth/brands`
- `/api/growth/markets`
- `/api/growth/icps`
- `/api/growth/channels`
- `/api/growth/prospects`
- `/api/growth/leads`
- `/api/growth/identity`
- `/api/growth/signals`
- `/api/growth/scores`
- `/api/growth/campaigns`
- `/api/growth/content`
- `/api/growth/publishing`
- `/api/growth/engagements`
- `/api/growth/opportunities`
- `/api/growth/attribution`
- `/api/growth/recommendations`
- `/api/growth/integrations`

API rules:
- server-injected tenant and workspace scopes
- version-CAS on mutable business records
- idempotency keys on external writes
- approval token/reference for governed actions
- connector capability validation
- no secrets returned to client
- sanitized channel responses

## 13. Event model

Initial normalized events:
- `growth.prospect.discovered`
- `growth.identity.observed`
- `growth.identity.matched`
- `growth.lead.created`
- `growth.signal.ingested`
- `growth.score.changed`
- `growth.lead.qualified`
- `growth.content.created`
- `growth.content.approved`
- `growth.publish.requested`
- `growth.publish.completed`
- `growth.engagement.received`
- `growth.followup.recommended`
- `growth.opportunity.created`
- `growth.rfq.linked`
- `growth.quote.linked`
- `growth.order.linked`
- `growth.revenue.recorded`
- `growth.attribution.recalculated`
- `growth.recommendation.created`

Events feed analytics, workflows and projections; they do not replace authoritative records.

## 14. KingTurf pilot configuration

KingTurf is the first pilot, implemented entirely through tenant/industry configuration plus normal integrations.

Pilot scope:
- initial market: choose one export market in first execution wave
- product focus: choose 1-2 product families
- channels: website + 2 external channels initially
- conversion hub: `kingturf.cn`
- business handoff: KingTurf Business OS
- pipeline: Lead -> Opportunity -> RFQ -> Quote -> Order -> Revenue
- languages: market-dependent configuration
- product knowledge: tenant knowledge base
- ICP and scoring: tenant policy configuration

The pilot is accepted only when revenue or a downstream commercial object can be traced back to acquisition touches and content/channel activity.

## 15. Security, governance and compliance

Mandatory controls:
- tenant isolation
- least-privilege channel credentials
- encrypted secret storage outside business records
- audit of every outbound channel action
- rate limiting
- circuit breakers
- webhook signature validation
- connector health monitoring
- approval gates
- idempotency
- content policy and brand review
- data retention controls
- PII minimization
- reversible identity merge
- export/deletion support where required

## 16. Observability

Minimum telemetry:
- connector health
- authorization expiry
- API error rate
- rate-limit saturation
- workflow latency
- discovery throughput
- content production throughput
- publish success rate
- engagement ingest lag
- score computation lag
- pipeline conversion
- attribution freshness
- Agent success/failure
- human approval backlog

## 17. Delivery phases

### Phase A — Foundation
GA-000 architecture and boundaries
GA-001 domain model and tenant kit
GA-002 channel adapter framework
GA-003 event and audit model

### Phase B — Acquisition Intelligence
GA-004 discovery ingestion
GA-005 identity resolution
GA-006 signals and scoring
GA-007 lead/customer 360

### Phase C — Content & Distribution
GA-008 content strategy integration
GA-009 content/video factory bridge
GA-010 multi-channel publishing
GA-011 engagement ingestion

### Phase D — Sales Conversion
GA-012 qualification and next-best-action
GA-013 CRM/RFQ/quote/order integration
GA-014 follow-up orchestration

### Phase E — Revenue Intelligence
GA-015 attribution engine
GA-016 Growth Director and experiments
GA-017 executive dashboard and closed-loop optimization

## 18. Engineering sequence

1. Freeze product boundary and ADRs.
2. Add package scaffolds and public interfaces.
3. Add tenant-kit schema and KingTurf example pack.
4. Extend Growth & Sales enterprise object definitions only where shared business records require it.
5. Implement canonical acquisition events.
6. Implement channel adapter capability registry.
7. Implement one read-only discovery connector or mock connector first.
8. Implement prospect -> lead -> score path end-to-end.
9. Add identity graph.
10. Add content/publishing path through a mock connector.
11. Add engagement ingest and qualification.
12. Add KingTurf Business OS integration contract.
13. Add revenue-event and attribution path.
14. Add Growth Director recommendations.
15. Add production channel connectors incrementally behind feature flags.
16. Run cross-tenant, replay, idempotency, approval, recovery and failure tests.
17. Run KingTurf pilot and measure qualified pipeline/revenue attribution.

## 19. Acceptance gates

### Architecture gate
- no KingTurf-specific business vocabulary in reusable Core packages
- no duplicate scheduler/runtime/approval stack
- all channel operations behind adapter interfaces
- tenant isolation enforced server-side

### Functional gate
- one tenant can configure brand/market/ICP/product mapping
- prospect discovery produces auditable normalized records
- signals update explainable scores
- lead can move to qualified state
- identity graph can link multiple external identities
- content can be approved and published through an adapter
- engagement can update lead/customer state
- opportunity and downstream business references can be linked
- revenue event can produce attribution results

### Reliability gate
- external writes idempotent
- webhook replay safe
- connector failure retriable or fail-closed
- rate limits respected
- credentials never exposed in business API or logs

### Productization gate
A second tenant with different products, ICP, sales rules and channels can be configured without modifying Growth Core source code.

## 20. Initial Definition of Done

The first meaningful end-to-end slice is complete when a configured pilot tenant can:
1. ingest or discover a prospect;
2. resolve identity and company;
3. compute fit/intent/engagement scores with explanations;
4. create/qualify a lead;
5. create and approve a content item;
6. publish through a controlled adapter;
7. ingest engagement;
8. create or link an opportunity;
9. link an RFQ/quote/order/revenue event from the business system;
10. calculate attribution;
11. surface a Growth Director recommendation based on the outcome.

This slice must use the existing ANKSEN governed workflow/runtime and must pass tenant isolation, audit, idempotency and approval tests.
