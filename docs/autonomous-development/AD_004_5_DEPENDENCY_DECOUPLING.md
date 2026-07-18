# AD-004.5 Dependency Decoupling

Removed dependencies: park/tenant entities, engineering/ERP/property modules, Smart Park permission menus and guards, NestJS/TypeORM controller assembly, numbered Smart Park migrations, park environment variables, deployment configuration, runtime queue JSON and locks.

Platform substitutions:

- `tenant + park + project` becomes `organizationId + workspaceId + projectId`.
- planning-center output is normalized by `normalizePlanningOutput`.
- worker-pool profiles are projected by `adaptWorkerProfile`; the kernel registry stores only live claim state.
- runtime execution is an injected `RuntimeAdapterPort`; `NoRuntimeAdapter` proves this extraction does not start a runtime.
- access-center, claim gate, queue preflight and model-gateway Proposal flows remain upstream control-plane checks.

The kernel imports no Smart Park module and contains no `parkId` field. Smart Park may later connect through project-connector as one managed project.
