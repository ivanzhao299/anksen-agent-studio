# ANKSEN Agent Studio — ChatGPT Context

> Last Updated: 2026-07-21
>
> This document is the permanent handoff context for Codex. Every new Codex session must read it before implementing any task.

## 1. Project Position

This repository is **ANKSEN Agent Studio**. It is not Smart Park, ERP, Video Factory, Finance, or HR; those are managed applications.

Studio is the Enterprise AI Operating System and AI Control Plane. Business systems connect to Studio instead of embedding platform code.

- Repository: `/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/anksen-agent-studio`
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

The current Runtime is `CONTROLLED_STUB`. Real `CODEX` remains disabled because the Feature Flag must remain off until all production conditions are satisfied.

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
