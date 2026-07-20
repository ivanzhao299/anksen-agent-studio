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

Business records are not isolated task cards. The transactional store persists typed, auditable relationships between records in the same organization, workspace, and application. Nineteen contracts now cover multi-stage chains such as objective → KPI/initiative/review, position → recruitment → onboarding → employee, budget → expense/payable, product → campaign and lead/customer → opportunity, material → BOM → work order → quality case, and enterprise/space → lease → meter plus enterprise → service order. Every contract declares the exact source states allowed to create its downstream transaction. A draft or otherwise immature lead, budget, BOM, recruitment case, enterprise, or other source fails closed. The conventional detail form requires the user to provide every authoritative downstream field; record creation, relation creation, and audit events commit atomically and retry idempotently. Arbitrary, reversed, cross-tenant, or wrong-state combinations are rejected.

These links remain business facts rather than Runtime Memory. Agent workflows may read or advance linked records only through the same scoped business APIs, while the detail page shows a user-friendly upstream/downstream chain without exposing Kernel internals. `pnpm enterprise-business:acceptance` now creates and reloads all six chains as part of its evidence gate.

Application operational reports aggregate persisted relationship counts and relation types from the same scoped business database. The group cockpit displays these source-backed chain counts alongside formal records, approvals, and Agent work, so an executive can distinguish a collection of isolated records from an operating end-to-end process. Relationship counts are operational structure, not fabricated revenue, conversion, delivery, or financial outcomes.

## Named business roles

Strategy, HR, finance, sales, manufacturing, and Smart Park operators have separate least-privilege roles. Each role can open only its own application and My Work, create and transition its formal records, establish allowed business chains, request approvals, and delegate LOW-risk work to the shared Planner. These conventional MEDIUM-risk lifecycle actions are allowed, but approval decisions, Runtime execution control, development commit, release, deployment, credentials, and access administration remain denied unless separately granted.

Finance review is a separate role with `proposal.approve`. It can read finance and My Work and decide a version-bound finance approval, but it has no `autopilot.execute.local`, `access.manage`, production, deployment, or other application capability. This separation is enforced by the same Access Center checks used by the HTTP APIs, not by hiding buttons alone.
