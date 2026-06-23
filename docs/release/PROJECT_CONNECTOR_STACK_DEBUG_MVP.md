# Project Connector + Stack Detector + Debug Specialist MVP

Generated for V4-A/B/C.

## Goal

This MVP improves managed project intake without taking control of the managed project. It lets Agent Studio read a project config, identify likely stack components, derive common command names, and classify a captured error log fixture into a repair proposal.

## Scope

- Package: `packages/project-connector`
- CLI surface: `studio project intake`, `studio project stack`, `studio project commands`, and `studio debug analyze`
- Data mode: local config, local filesystem probes, local examples, and fixtures only
- Execution mode: dry-run only

## Project Intake

The intake model supports these source references:

- `local_path`
- `git_url`
- `zip_placeholder`
- `repo_metadata`

The CLI reports whether the project path exists, whether Git metadata is visible, and whether non-local source references are present. It does not clone, download, unzip, write to the managed project, or connect to remote servers.

```bash
node packages/orchestrator-core/bin/studio.mjs project intake --config examples/jinhu-smart-park/project.config.example.json --dry-run
```

## Stack Detector

The stack detector probes for:

- `package.json`
- `pnpm-workspace.yaml`
- Next.js config files
- NestJS config files
- TypeScript config files
- Prisma/PostgreSQL layout hints
- Docker files
- GitHub Actions CI/CD workflows
- package scripts

It also keeps existing `detected_stack_hints` from the project config as hints, so missing local paths can still produce a useful read-only summary.

```bash
node packages/orchestrator-core/bin/studio.mjs project stack --config examples/jinhu-smart-park/project.config.example.json --dry-run
```

## Command Detector

The command detector proposes common project commands without executing them:

- install
- typecheck
- lint
- test
- build
- dev
- doctor, when present in config hints

Every detected command is marked `executable_in_mvp: false`.

```bash
node packages/orchestrator-core/bin/studio.mjs project commands --config examples/jinhu-smart-park/project.config.example.json --dry-run
```

## Debug Specialist

The debug specialist reads a fixture log, classifies it as `build`, `type`, `lint`, `test`, `runtime`, or `unknown`, and emits a proposal-only repair task.

```bash
node packages/orchestrator-core/bin/studio.mjs debug analyze --fixture packages/project-connector/examples/debug-error.example.log --dry-run
```

## Safety Boundary

- No Agent execution.
- No deploy.
- No production operation.
- No server access.
- No real credential storage.
- No real credential values are read.
- No writes are made to `jinhu-smart-park`.
- Project commands are detected but not executed.

## Validation

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs project intake --config examples/jinhu-smart-park/project.config.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs project stack --config examples/jinhu-smart-park/project.config.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs project commands --config examples/jinhu-smart-park/project.config.example.json --dry-run
node packages/orchestrator-core/bin/studio.mjs debug analyze --fixture packages/project-connector/examples/debug-error.example.log --dry-run
git diff --check
git status
```
