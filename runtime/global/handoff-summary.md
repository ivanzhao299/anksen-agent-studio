# ANKSEN Studio Runtime Handoff

Generated at: 2026-07-20T23:43:00+08:00

## Product North Star

ANKSEN is one intelligent runtime beneath multiple independent conventional business applications. The Group Cockpit commands and observes; Strategy, HR, Finance, Growth & Sales, Manufacturing ERP, Smart Park, Software Factory, and Video Factory own their business records, forms, work queues, approvals, reports, users, and endpoints.

Business records remain authoritative. Agent Tasks advance or analyse those records and Runtime Memory preserves scoped execution knowledge; neither replaces the business database.

## Current Stage

- program: Enterprise Application Foundation and Intelligent Workflow Integration
- architecture: `docs/ENTERPRISE_APPLICATION_INTELLIGENCE_ARCHITECTURE.md`
- completed foundation: application registry, independent routes, persona capabilities, BusinessTaskBindingV1, conventional record store, My Work, business-to-Kernel workflow bridge
- verified thin slice: Finance expense → Workflow → four Kernel tasks → Scheduler → Worker claims → controlled Runtime → review-ready business state
- release evidence: commits `de4763f` and `0e84d1d` deployed through guarded Office 204 run `29756529313`; public login, Cockpit, My Work, all application endpoints, and MCP readiness returned HTTP 200
- second slice: Strategy objectives/KPIs, HR recruitment/onboarding, and Finance expenses/budgets now have distinct required fields, lifecycle transitions, Agent review gates, and business-object-aware workflow goals
- verified workflow evidence: Strategy objective, HR recruitment case, and Finance expense each completed four Kernel tasks through the existing Scheduler, Worker and CONTROLLED_STUB runtime with the original business object ID on every stage
- next stage: deepen each application from the shared conventional shell into its first domain-specific record detail, forms, reports, and write-back workflow

## Application Endpoints

- `/cockpit`
- `/work`
- `/strategy`
- `/hr`
- `/finance`
- `/growth-sales`
- `/manufacturing`
- `/smart-park`
- `/development`
- `/video`

## Required Reading

- `docs/ENTERPRISE_APPLICATION_INTELLIGENCE_ARCHITECTURE.md`
- `runtime/global/decision-log.json`
- `runtime/global/roadmap-memory.json`
- `runtime/global/platform-state.json`
- `docs/BUSINESS_APPLICATION_MODEL.md`
- `docs/release/GITHUB_ACTIONS_OFFICE_DEPLOYMENT.md`

## Safety Boundaries

- Do not duplicate Kernel, Scheduler, Worker, Runtime, Approval, or Audit stacks per application.
- Do not represent a business record only as a Goal, Task, Prompt, or Runtime Memory object.
- Do not perform direct production deployment; an explicitly authorized release may use only the guarded Office 204 workflow.
- Do not run production migration, destructive data operations, or expose credential values.
- Keep high-risk business writes approval-gated and version/fencing protected.
