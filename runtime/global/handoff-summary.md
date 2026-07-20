# ANKSEN Studio Runtime Handoff

Generated at: 2026-07-20T15:35:00+08:00

## Product North Star

ANKSEN is one intelligent runtime beneath multiple independent conventional business applications. The Group Cockpit commands and observes; Strategy, HR, Finance, Growth & Sales, Manufacturing ERP, Smart Park, Software Factory, and Video Factory own their business records, forms, work queues, approvals, reports, users, and endpoints.

Business records remain authoritative. Agent Tasks advance or analyse those records and Runtime Memory preserves scoped execution knowledge; neither replaces the business database.

## Current Stage

- program: Enterprise Application Foundation and Intelligent Workflow Integration
- architecture: `docs/ENTERPRISE_APPLICATION_INTELLIGENCE_ARCHITECTURE.md`
- completed foundation: application registry, independent routes, persona capabilities, BusinessTaskBindingV1, conventional record store, My Work, business-to-Kernel workflow bridge
- verified thin slice: Finance expense → Workflow → four Kernel tasks → Scheduler → Worker claims → controlled Runtime → review-ready business state
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
