# V5 Enterprise Runtime MVP

## Scope

V5 Enterprise Runtime turns Runtime Center into a governed runtime control plane for local planning, runtime selection evidence, capability scoring, and invoke-plan records. It does not invoke real models, start real Workers, read secret values, deploy, or perform production operations.

## Delivered Artifacts

- `packages/runtime-center/schemas/enterprise-runtime.schema.json`
- `packages/runtime-center/examples/enterprise-runtime.example.json`

## Capabilities

- Enterprise runtime profiles with tenant scope and supported skills.
- Capability scores for safe runtime selection.
- Credential policy set to `reference_presence_only` or `none`.
- Network policy limited to `metadata_only` or `disabled`.
- Workspace policy limited to `local_repo_only` or `read_only`.
- Concurrency policy with path-overlap isolation.
- Invoke policy limited to `invoke_plan_only` or `disabled`.

## Safety

- Real Worker execution: disabled.
- External model calls: disabled.
- Credential values: not read.
- Deploy: disabled.
- Production operations: disabled.
- Managed project writes: disabled.

## Validation

- `pnpm typecheck`
- `pnpm lint:check`
- `git diff --check`
