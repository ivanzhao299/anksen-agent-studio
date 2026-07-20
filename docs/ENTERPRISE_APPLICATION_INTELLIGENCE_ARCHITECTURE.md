# Enterprise Application Intelligence Architecture

## Product thesis

ANKSEN is a unified intelligent runtime underneath multiple independent, conventional business applications. The cockpit is the cross-system command and observation surface; it is not the place where every business transaction is performed.

Ordinary users work with familiar software concepts: forms, records, ledgers, documents, approvals, work queues, search, reports, dashboards, and notifications. Agent workflows add continuous planning, assignment, analysis, execution, validation, recovery, and memory without forcing those users to understand Goal, Task Graph, Lease, Fencing, Runtime Adapter, or Token terminology.

## Product layers

1. **Group cockpit** — `/cockpit`: objectives, commands, cross-application results, exceptions, approvals, and system readiness.
2. **Independent business applications** — `/strategy`, `/hr`, `/finance`, `/growth-sales`, `/manufacturing`, and `/smart-park`.
3. **Shared work surface** — `/work`: user assignments, Agent assignments, approvals, failed work, analysis results, and notifications.
4. **Intelligent operating layer** — Kernel, Planner, Scheduler, Workflow, Skills, Agents, online Runners, Runtime Adapters, Runtime Memory, Approval, Audit, Outbox, and projections.
5. **Technical and governance surfaces** — `/development`, `/runtime`, `/governance`, and administrative configuration.

## Non-negotiable boundaries

- A business record is the system of record; an Agent Task only advances or analyses it.
- Runtime Memory explains execution and preserves scoped experience; it never replaces the business database.
- Each business application owns its routes, personas, permissions, navigation, business objects, workflows, and result definitions.
- Applications share the same Kernel, Scheduler, Worker, Approval, Audit, and Runtime foundations. No application may create a second orchestration stack.
- Turning off intelligent runtimes must leave a usable conventional business application.
- Enabling runtimes makes the application continuously observable and actionable, but high-risk transactions remain approval-gated.
- The cockpit aggregates source-backed business outcomes. Agent completion counts are operational evidence, not business outcomes.

Authoritative business records, user work items, and business audit events are persisted in an isolated transactional PostgreSQL store. Record transitions use optimistic version CAS, while Runtime completion and business-state write-back commit in one transaction. The file store is retained only as an explicit local fallback when no business database is configured.

Every business record has a conventional detail surface containing its typed fields, accountable owner, version, work assignments, Agent/Kernel references, approval history, and audit timeline. A record in `WAITING_APPROVAL` cannot be advanced by a normal transition: a scoped, single-pending approval must be requested and an authorized reviewer must approve or reject it. Approval consumes the exact object version and writes the decision, state change, and audit event atomically, so stale approvals cannot change newer business facts.

Application workbenches and the group cockpit expose source-backed operational reports derived from the same scoped records, work items, and approvals. These reports show record volume, object mix, lifecycle distribution, exception states, approval backlog, and human/Agent workload with drill-down links. They remain separate from connector-backed financial and commercial KPIs: the platform never relabels workflow counts as revenue, conversion, cash, production output, or other business outcomes.

Agent work is controlled through the business work item, never by exposing Kernel lease operations to ordinary users. Work items carry an independent version for CAS. Authorized operators may pause, resume, retry, reassign, cancel, or take over eligible work; every control decision is audited. Pause, reassignment, cancellation, and takeover fail closed while the linked Kernel goal has an unexpired ACTIVE lease. Resume, retry, and Agent reassignment re-enter the same domain workflow through the shared Kernel using a new version-scoped session key, preserving the original business object and validation contract.

Completed Agent work is explainable from the conventional record detail without duplicating orchestration state. A read-only projection joins the business work item's Kernel Goal to authoritative Kernel Tasks, business Skill contracts, Agent assignments, planned and actual Runner/Worker identity, latest Attempt, lease status, and a sanitized Runtime result summary. Runtime completion persists the safe result summary on the Attempt under the same fencing-protected lease release. The business API never returns lease tokens, fencing tokens, raw logs, environment snapshots, or credential values.

## Application boundaries

| Application | Endpoint | Primary users | Initial conventional objects | First intelligent workflow |
| --- | --- | --- | --- | --- |
| Group Cockpit | `/cockpit` | Chairperson, executives | command, decision, exception, outcome | cross-application objective dispatch |
| Strategy Execution | `/strategy` | Strategy office, accountable owners | objective, KPI, initiative, review | objective decomposition and monthly review |
| Human Resources | `/hr` | HR, managers, employees | organization, position, employee, recruitment case | recruitment to onboarding |
| Finance | `/finance` | Finance, executives, business owners | budget, expense, receivable, payable | expense review and budget variance |
| AI Growth & Sales | `/growth-sales` | Marketing, sales, service | product, campaign, lead, customer, opportunity | content to lead to opportunity |
| Manufacturing ERP | `/manufacturing` | Planning, production, procurement, warehouse, quality | material, BOM, work order, inventory, quality case | order planning and shortage handling |
| Smart Park | `/smart-park` | Leasing, operations, property, security, energy | enterprise, space, contract, service order, meter | leasing to contract and service dispatch |

## Business object and autonomous work contract

Every autonomous work item must carry:

- organization, workspace, application, project, and user scopes;
- business object type, business object ID, and immutable object version;
- workflow and workflow stage;
- skill contract and assigned Agent role;
- selected online Runner and required capabilities;
- risk, approval, idempotency, validation, recovery, and audit policies;
- Kernel goal/task/attempt/lease references when execution begins;
- resulting business event and expected business-object write-back.

The task is complete only when its validation passes and the expected business-object state or analysis projection is persisted.

## Six-hour implementation sequence

1. Persist this architecture in roadmap and decision memory.
2. Add an application registry with endpoint and persona contracts.
3. Add the business-object/autonomous-work contract and validation.
4. Add independent application endpoints and role-aware navigation.
5. Add a shared My Work projection backed by real task and object links.
6. Add minimum conventional object workbenches for all six applications.
7. Connect one safe workflow end to end, prove object write-back, test, push, and deploy to Office 204.

## Acceptance rule

The implementation must be judged by a conventional-software test: a normal business user can open their application, find records, perform permitted actions, receive assigned work, and inspect results without knowing the internal orchestration vocabulary.

## Executable enterprise acceptance

`pnpm enterprise-business:acceptance` is the repeatable EA-014 evidence gate. It runs only against the local isolated PostgreSQL fixture and keeps `CONTROLLED_STUB` as the sole Runtime. The gate creates authoritative records for six operational roles (strategy owner, HR operator, finance requester, sales operator, manufacturing planner, and park operator), advances each record through its own lifecycle, creates human and Agent work, and drives every Agent assignment through the existing Planner, Kernel, Scheduler, Resident Worker, Attempt, Lease, and report path.

The generated JSON evidence pack fails unless all six scopes prove restart readability, cross-tenant denial, a conventional My Work assignment, exactly four successful Kernel tasks and Attempts, and exactly four Runtime executions. It also exercises the finance requester/reviewer separation, version-bound approval, approval replay rejection, and six-application cockpit aggregation. The fixture does not call Codex, production databases, deployment, merge, or push. This is an engineering acceptance gate; authenticated browser UAT with named production roles remains a separate release activity.

## Authoritative business chains

Business records are not isolated task cards. The transactional store persists typed, auditable relationships between records in the same organization, workspace, and application. Thirty contracts now cover multi-stage chains such as objective → KPI/initiative/review, position → recruitment → candidate application → employment offer → onboarding → employee, budget → expense/payable, product → campaign → approved content/channel account → publish plan, lead/customer → opportunity, material → BOM → work order → quality case, released SOP → work order, completed WMS inventory → work order, and enterprise/space → lease → meter plus enterprise → service order. Every contract declares the exact source states allowed to create its downstream transaction. A draft or otherwise immature lead, budget, BOM, SOP, inventory count, recruitment case, candidate, offer, content asset, channel account, enterprise, or other source fails closed. The conventional detail form requires the user to provide every authoritative downstream field; record creation, relation creation, and audit events commit atomically and retry idempotently. Arbitrary, reversed, cross-tenant, or wrong-state combinations are rejected.

These links remain business facts rather than Runtime Memory. Agent workflows may read or advance linked records only through the same scoped business APIs, while the detail page shows a user-friendly upstream/downstream chain without exposing Kernel internals. `pnpm enterprise-business:acceptance` now creates and reloads all six chains as part of its evidence gate.

Application operational reports aggregate persisted relationship counts and relation types from the same scoped business database. The group cockpit displays these source-backed chain counts alongside formal records, approvals, and Agent work, so an executive can distinguish a collection of isolated records from an operating end-to-end process. Relationship counts are operational structure, not fabricated revenue, conversion, delivery, or financial outcomes.

## Cross-application business exception center

`/work` includes a role-scoped exception center sourced from authoritative business records and work items. A record appears only when its formal status is `AT_RISK`, `BLOCKED`, `OVERDUE`, `REJECTED`, `SHORTAGE`, `FAULT`, or `ESCALATED`; a work item appears only when its persisted status is `BLOCKED`. Each exception identifies its application, business object, accountable owner or assignee, update time, and conventional record link. Agent blockage is labelled separately from business-record exceptions.

The API derives its application allowlist from server-side RBAC route access and then applies organization and workspace scope in the store. Clients cannot request visibility into another application or tenant. This projection does not infer severity from task counts, expose Kernel leases or fencing values, or invent commercial and financial outcomes.

Exception resolution reuses the conventional application's declared lifecycle and the shared work-control protocol. The exception contract returns the exact object/work version and only the legal next actions already declared by that object. Users open the authoritative record to correct or advance it; blocked work is retried or taken over through version-CAS work control. Successful resolution writes the normal business audit event and removes the item from the exception projection. There is no generic “close exception” mutation and no parallel exception state machine.

The group cockpit action feed is an idempotent projection of the same exceptions and exact-version pending approvals. Stable notification keys are derived from source type, source ID, version, and status, so refreshes and process restarts do not duplicate reminders. The feed distinguishes critical exceptions, warnings, and approval actions, links back to the authoritative business record, and applies the same server-derived application allowlist. Because no read-receipt store exists yet, the product deliberately does not claim that an item is read or unread.

The group cockpit also provides conventional cross-application record search over authoritative display keys, titles, owners, and statuses. Search always injects the server-derived application allowlist plus organization and workspace scope; a client cannot broaden it. PostgreSQL uses parameterized literal substring matching rather than user-controlled wildcard patterns. Results are paginated, link to the owning application, and intentionally omit typed field payloads, Runtime metadata, credentials, and internal orchestration state.

Conventional record details support versioned editing of title, accountable owner, and typed business fields while the object is in a schema-declared editable state. Updates merge and revalidate the complete field set, use optimistic object-version CAS, preserve the immutable display key, and atomically append a `business.object.updated` audit event. Approval, active-processing, and terminal states fail closed. The audit records changed field names and title/owner change flags rather than duplicating field values.

Business operators can add immutable handling notes directly to a conventional record's existing audit timeline. A note is organization-, workspace-, application-, record-, author-, and exact-object-version scoped. It does not mutate or increment the business record version: a stale browser must refresh before its note is accepted, so commentary cannot be attached to superseded facts by accident. Note text is trimmed, length and control-character bounded, and rejected before persistence when it resembles a private key, access token, password, or API secret. Notes remain business audit events; they are not Runtime Memory, a parallel chat system, or a replacement for formal fields, approvals, and state transitions.

Each conventional application workbench queries its authoritative ledger through a server-side record-list contract. Users can search display key, title, or owner, filter by business-object type, formal status, and exact owner, and move through a bounded stable page. Organization, workspace, and application are injected by the authenticated server route rather than accepted from the browser. PostgreSQL uses parameterized literal substring matching, so wildcard characters cannot broaden a query. The response retains the complete, schema-presented business rows needed by the owning workbench while cross-application search continues to return only its minimal locating projection.

Agent delegation begins with a read-only, exact-object-version preflight rather than a blind “run” button. The preflight resolves the authoritative record to its application-owned Workflow and displays every stage's business Skill, skill type, selected Agent, eligible Agents, Runner identity, on-demand/registered mode, expected business-status write-back, and the enforced `CONTROLLED_STUB` execution policy. It fails closed when the record cannot legally enter its Agent review state or any Skill lacks an active Agent or declared Runner capacity. Confirmation sends the previewed object version; the server re-loads the scoped record, rejects stale versions, rebuilds the same preflight, and only then creates the work item and submits the existing shared Kernel. This is a visible execution contract over the existing Planner/Scheduler/Worker stack, not a second orchestrator.

The confirmed delegation plan is not ephemeral UI state. Work-item creation sanitizes it to the business object/application/type/version, Workflow definition/version/domain, expected write-back status, enforced Runtime policy, maximum attempts, and each stage's Skill/Agent/Runner assignment. The work item, normal assignment event, and immutable `business.work.delegation-approved` event commit in the same file-store save or PostgreSQL transaction. The event is idempotent with work-item creation, rejects a plan copied from another record or application, contains no credential, token, environment, raw prompt, or lease value, and is visible in the conventional record timeline as “委派方案已确认”.

Business record details and My Work project that immutable event into a safe approved-plan view. Operators can therefore see the owning domain and Workflow, stage count, expected write-back, enforced Runtime, and each stage's Skill, Agent, and Runner without opening an internal orchestration console. The projection is reconstructed after restart by both storage backends, remains organization/workspace scoped, and deliberately omits registered Runtime internals, credentials, raw prompts, lease tokens, and fencing values. It is read-only evidence over the existing Kernel, not mutable work state or another scheduler.

When a work item is attached to the Kernel, the PostgreSQL business store also builds a live, read-only execution projection from persisted Task, latest Attempt, Worker, and Night Shift Session facts. It reduces internal states to business-facing phases (`AWAITING_DISPATCH`, `STARTING`, `QUEUED`, `RUNNING`, `BLOCKED`, `COMPLETED`, or `CANCELLED`), stage progress, current Skill/Agent/Runner, scheduler ticks, claims, executions, and report availability. My Work automatically refreshes while execution is active, and the conventional record detail shows the same projection beside the work and approved plan. The query joins the Session back to a Goal in the authenticated organization/workspace and never returns lease identifiers, tokens, fencing values, environment data, prompts, or credential material. File fallback exposes only its persisted business-work phase because it has no online Kernel database to claim as evidence.

Agent assignment is asynchronous. The request transaction creates the governed work item, compiles and submits the existing Kernel Task Graph, and attaches the exact Goal and Night Shift Session with work-version CAS; it then returns `202 QUEUED` instead of holding the browser open while Runtime work finishes. A resident business-work adapter scans only persisted Agent work already marked `RUNNING` and attached to a Goal/Session, then asks the existing Persistent Domain Workflow and Kernel worker path to resume it. It is not a second scheduler or Runtime. PostgreSQL advisory locks make two Studio processes mutually exclusive per business work item, while Kernel leases and fencing continue to protect each Task. After process or OS restart the new process discovers the same row and Session, finishes remaining Tasks, loads the durable report, and transitions the conventional record and work item with both object-version and work-version checks. A changed or illegal business record fails closed to `BLOCKED`; deterministic re-execution requires a new governed delegation instead of silently replaying a consumed Session. Runner failures use bounded exponential backoff, and shutdown waits for current work before closing the shared database pool.

Resident Runner operations are also durable. Every Studio process registers a stable node identity in PostgreSQL, publishes capacity and heartbeats, and becomes effectively `OFFLINE` when its heartbeat is stale. `DRAINING` is a persisted desired state: the node finishes in-flight work but does not scan or claim new business work until an authorized operator resumes it. Control uses node-version CAS and appends an immutable audit event, so two administrators cannot silently overwrite each other. If the registry cannot be reached, the Runner fails closed and does not claim work. The Work Center exposes only safe fleet health, backlog counts, aggregate execution evidence, and a sanitized Morning Report; lease tokens, fencing tokens, credentials, raw logs, environment snapshots, and raw error messages remain outside the business API.

Completion now writes a versioned `result_summary` onto the original business work item in the same transaction as status and optional record transition. The summary contains safe stage, Skill, Agent, Worker, Runtime, Attempt and aggregate report facts and survives process restarts independently of the web process. Its contract explicitly separates `EXECUTION_EVIDENCE` from a professional business outcome. A successful `CONTROLLED_STUB` run sets `businessOutcomeProduced=false` and directs the operator to connect a professional Skill Runner; Studio therefore never presents a stubbed finance review, hiring recommendation, sales judgment or production decision as real business output. Future domain runners must write their validated outputs through this same contract rather than adding another result model.

The first professional implementation is `finance-expense-rule-runner-v1`. Its active registry contract binds `finance-platform / expense → financial_control_validation → finance-control-agent → PROFESSIONAL_RULE_ENGINE` and requires a human approval after a pass. It runs only after the existing Kernel workflow has completed, reads the authoritative expense plus an `ACTIVE` budget connected by the typed `CONTROLS` relation, and checks the budget link, budget code, department, currency, fiscal year and single-expense ceiling. Missing budget evidence blocks the work; mismatches require review; a complete pass recommends submission for human approval. The result states that it does not calculate consumed or remaining budget without posted-ledger data. This is the pattern for later HR, sales, manufacturing and Smart Park professional runners: shared orchestration, separate conventional application data, an explicit Skill/Agent/Runner contract, typed evidence, and no invented business facts.

The second professional implementation is `manufacturing-work-order-readiness-runner-v1`. The manufacturing ERP now owns a conventional, versioned `routing_sop` object in addition to work orders, materials, BOM, inventory and quality cases. A work order can be governed only by a `RELEASED` BOM through `USED_BY`, a `RELEASED` SOP through `GOVERNS`, and `COMPLETED` inventory counts through `ALLOCATED_TO`. After the same Kernel workflow succeeds, the Runner checks product and plant consistency, BOM/SOP effective dates, a controlled work-instruction reference, declared per-unit component requirements, and linked WMS quantities updated within the preceding 24 hours for the planned order quantity. Missing, stale or short evidence blocks release. A pass only recommends human release approval: it never reserves stock, sequences capacity, changes WMS, starts production, or releases the order automatically. This proves that a second independent traditional application can use the shared runtime while retaining its own objects, relations, professional rules and human control boundary.

The third professional implementation is `hr-onboarding-readiness-runner-v1`. The HR platform now owns candidate applications and employment offers between recruitment and onboarding. Candidate records use a reference identifier rather than placing resumes or credentials in the execution result, and they require privacy consent plus an explicit human-selection decision reference. An accepted offer and active position are linked to onboarding through typed, source-state-gated relations. The professional evidence loader follows the scoped business graph for at most three typed relation edges so it can reconstruct position → recruitment → candidate → offer → onboarding without copying those records into a second result model. Every accepted HR fact must carry the required `AUTHORIZES`, `RESULTS_IN`, `CONSIDERS`, `RECEIVES`, or `INITIATES` path; correct-looking but unrelated records fail closed. The Runner verifies administrative consistency, controlled documents, identity-verification evidence, equipment request and least-privilege access profile, then recommends human onboarding approval. It never ranks candidates, calculates suitability, sends or accepts an offer, signs a contract, provisions access, or activates an employee. Configured headcount is not presented as remaining vacancy because incumbent and reservation facts are not yet available.

The fourth professional implementation is `growth-publish-readiness-runner-v1`. The Growth & Sales platform now owns conventional content assets, channel accounts and publish plans. Product claims and rights clearances are reference-backed; channel credentials remain a Credential Reference and are never copied into the result. The Runner accepts only an `ACTIVE` product, matching Campaign, `APPROVED` assets carrying all of the `GROUNDS`, `PRODUCES` and `INCLUDES` evidence paths, and an `ACTIVE` channel account linked by `AUTHORIZES`. It checks Campaign dates, product/channel consistency, expected asset count, content hashes, rights evidence and account authorization expiry. A pass only recommends a version-bound human approval. It does not register an account, resolve credentials, publish, contact customers, spend budget or create a transaction.

## Named business roles

Strategy, HR, finance, sales, manufacturing, and Smart Park operators have separate least-privilege roles. Each role can open only its own application and My Work, create and transition its formal records, establish allowed business chains, request approvals, and delegate LOW-risk work to the shared Planner. These conventional MEDIUM-risk lifecycle actions are allowed, but approval decisions, Runtime execution control, development commit, release, deployment, credentials, and access administration remain denied unless separately granted.

Finance review is a separate role with `proposal.approve`. It can read finance and My Work and decide a version-bound finance approval, but it has no `autopilot.execute.local`, `access.manage`, production, deployment, or other application capability. This separation is enforced by the same Access Center checks used by the HTTP APIs, not by hiding buttons alone.

HR review is likewise a separate least-privilege role. `hr_reviewer` can read HR and My Work and decide version-bound candidate, offer and onboarding approvals, but it cannot plan or control Agent work, execute Runtime, access finance or other applications, manage identities, or make an automated employment decision. HR operators retain record and workflow operations but cannot approve their own pending business decision through the approval API.

Growth review uses the same separation. `sales_reviewer` can read the Growth & Sales application and decide version-bound product, content, account and publish-plan approvals, but it cannot control Agent work, execute Runtime, register an external account, perform publication or access another business application.
