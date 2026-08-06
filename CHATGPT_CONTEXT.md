# ANKSEN Agent Studio — ChatGPT Context

> Last Updated: 2026-08-03
>
> This document is the permanent handoff context for Codex. Every new Codex session must read it before implementing any task.

## 1. Project Position

This repository is **ANKSEN Agent Studio**. It is not Smart Park, ERP, Video Factory, Finance, or HR; those are managed applications.

Studio is the Enterprise AI Operating System and AI Control Plane. Business systems connect to Studio instead of embedding platform code.

- Repository: `/Users/mac/Documents/anksen-agent-studio`
- GitHub: `https://github.com/ivanzhao299/anksen-agent-studio.git`

## 2. Long-term Architecture

```text
Enterprise AI OS
  -> Control Plane (ANKSEN Agent Studio)
  -> Planner
  -> Autonomous Kernel
  -> Scheduler
  -> Resident Worker
  -> Runtime Adapter
  -> Codex / Claude / Gemini / OpenHands / Aider
  -> Business Apps
```

Managed Business Apps include Software Factory, Video Factory, Engineering CAD Center, Strategy OS, Finance, HR, ERP, and Smart Park.

## 3. Development Principle

Never create duplicate Planner, Scheduler, Worker, Runtime, Goal, Task, Queue, or State Machine implementations. Always reuse the existing platform components.

## 4. Current Status

The Autonomous Development platform has completed these major stages:

- Goal Kernel
- Task Graph
- Scheduler
- Resident Worker
- Runtime Adapter
- Persistent Night Shift
- Activation Gate
- Planner MVP
- Autonomous Execution Center
- Night Shift MVP
- Persistent Night Shift Kernel
- Real Codex Activation Gate

The default and production Runtime remains `CONTROLLED_STUB`. The governed autonomous-development path reached `AUTONOMOUS_DEVELOPMENT_READY` (6/6) on 2026-08-03 after one approved, isolated, non-production four-role run completed Planner, Implementer, Validator, and Reviewer with validation evidence. Real `CODEX` is enabled only inside a one-shot Activation Gate after project, path, command, duration, credential-reference, approval, lease, and fencing checks pass; the Feature Flag is restored to off after the attempt.

The Resident Development Worker is installed and can run continuously. Automatic commit, push, merge, deploy, production changes, and secret-value access remain disabled. A successful proof run establishes controlled autonomy, not authorization for production autonomy.

Autonomous Development V3 was implemented on 2026-08-03. It adds bounded Worker supervision, priority and maintenance-window queue policy, deterministic acceptance-evidence mapping, token/runtime budgets, operational metrics and alerts, artifact redaction and SHA256 integrity, retention/audit support, a two-project ten-case controlled policy pilot, and release-assistance artifacts. Maturity is `CONTROLLED_PILOT_READY`, while production autonomy remains `DISABLED`.

The user LaunchAgent definition is installed but cannot execute this repository from macOS `Documents` because launchd returns `EX_CONFIG`; the active service uses the same detached Supervisor as a fallback. Moving the repository to a service-accessible path or granting the relevant background access is required before LaunchAgent loading can replace the fallback.

The Skill Router capability center includes the `awesome-design-md` third-party design-system knowledge resource, pinned to VoltAgent commit `8147538b4226ae41e2487a9179e3bcc1f68e8554`. It indexes 74 MIT-licensed `DESIGN.md` references from `runtime/capability-resources/awesome-design-md`. Selection is explicit and read-only; the loader treats all content as untrusted, removes executable shell-pipe examples on load, never overwrites a managed project's `DESIGN.md`, and prohibits brand impersonation.

The specialized Phoenix ERP bug-intake Runner reached scoped production automation qualification on 2026-08-04. Office 204 runs `phoenix-erp-v3` commit `42890d2f10b8ed2bb18b95eed01b47e9d1ab28d9` with `PHOENIX_ERP_RUNNER_AUTO_RELEASE=true`; guarded probe run `30889595090` proved the service active, state/code/origin commits aligned, and live push, CI-wait, deploy-after-CI and production-smoke arguments present. This is limited to administrator-approved Phoenix bug reports that pass the Runner's evidence and CI gates. It does not enable general Studio production autonomy, arbitrary deployment, migrations, secret access or unmanaged projects.

## 5. Night Shift Principle

Night Shift is the core Studio execution chain:

```text
Goal -> Planner -> Task Graph -> Scheduler -> Worker -> Runtime -> Morning Report
```

Long ChatGPT prompts are deprecated. Planner generates execution plans.

## 6. Roles

- ChatGPT: Chief Architect, Product Planner, Design Reviewer, Acceptance Reviewer—not the task executor.
- Codex: Implementation Engineer.
- Studio: Autonomous Development Platform.

## 7. Current Highest Priority

The next product direction is **Engineering CAD Center**, not another Runtime, Scheduler, Worker, or Planner.

## 8. Engineering CAD Center

Engineering CAD Center is a new Studio App and an AI-native CAD analysis platform. It is not a CAD editor.

V1 supports DWG, DXF, IFC, and PDF. It provides preview, parsing, geometry, layer, block, text, dimension, area, length, and statistics capabilities. Its canonical output is Unified CAD JSON.

## 9. CAD Architecture

```text
CAD Reader
  -> Geometry Model
  -> CAD Agent SDK
  -> CAD Analyzer
  -> Engineering Agent
  -> ERP / BOM / Report
  -> Digital Twin
```

## 10. CAD Agent SDK

Core APIs:

- `loadDocument`
- `convertDocument`
- `extractLayers`
- `extractEntities`
- `extractBlocks`
- `extractTexts`
- `extractDimensions`
- `calculateArea`
- `calculateLength`
- `validateDrawing`
- `generateReport`
- `exportPDF`
- `exportDXF`

## 11. Runtime Boundary

Studio schedules work. A dedicated CAD Worker performs execution and contains FreeCAD, ezdxf, IfcOpenShell, ODA Converter, PDF Renderer, and Geometry Engine capabilities.

## 12. Phase Plan

### CAD-001 — Engineering CAD Center Foundation

- Document Loader
- DXF Parser
- Geometry Model
- Unified CAD JSON Schema
- Preview API
- CAD Worker
- Statistics
- No editing UI
- No AutoCAD dependency

### CAD-002 — CAD Analyzer

- Layer validation
- Dimension validation
- BOM
- Rule Engine

### CAD-003 — CAD Modification

- AI modifies drawings

### CAD-004 — Engineering AI

- Natural language to drawing modification

### CAD-005 — Digital Twin

```text
CAD -> BIM -> ERP -> MES -> IoT
```

## 13. Constraints

- Never modify production.
- Never push automatically.
- Never merge automatically.
- Never deploy automatically.
- Every Runtime execution must pass Activation Gate, RBAC, Approval, Runtime Policy, Credential Reference, and Feature Flag.

## 14. Development Mode

ChatGPT defines Goal, constraints, and acceptance criteria. Planner generates the Task Graph. Night Shift executes it.

## 15. Next Goal

`CAD-001 Engineering CAD Center Foundation`, beginning with Document Loader, DXF Parser, Geometry Model, Unified CAD JSON Schema, CAD Worker, Preview, and Statistics.
