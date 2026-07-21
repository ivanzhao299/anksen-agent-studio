# CAD-001 Engineering CAD Center Foundation

## Outcome

CAD-001 establishes a read-only Engineering CAD Center on the existing Studio control plane. It does not introduce another Planner, Scheduler, Worker pool, Runtime, Goal, Task, Queue, or state machine.

## Planner graph

- Planner: `RulePlannerEngine`
- Template: `SOFTWARE_DELIVERY`
- Planner version: `rule-planner-v1-483bade42d6b963d`
- Tasks: `CAD_001_ANALYZE` → `CAD_001_IMPLEMENT` → `CAD_001_VALIDATE`
- Graph validation: PASS
- LLM used: false

## Capability truth table

| Capability | State | Evidence |
| --- | --- | --- |
| Safe in-memory document loading | Local runnable | `loadCadDocument` verifies extension, signature and size |
| ASCII DXF parsing | Local runnable | `parseDxf` and `minimal.dxf` test fixture |
| Unified CAD JSON | Local runnable | `schemas/unified-cad.schema.json` |
| Layer/entity/text/dimension extraction | Local runnable | `CadAgentSdk` |
| Length, area, bounds and statistics | Local runnable | `geometry.mjs` |
| SVG preview | Local runnable | `renderCadSvg` and `/api/cad/analyze` |
| CAD Worker routing | Local runnable after capability probe | `cad-dxf-foundation` professional profile and `local-cad-dxf-1` registration |
| Binary DXF | Not ready | Fails closed with `DXF_BINARY_NOT_SUPPORTED` |
| DWG | Format recognition only | External ODA/FreeCAD adapter not enabled |
| IFC | Format recognition only | IfcOpenShell adapter not enabled |
| PDF | Format recognition only | PDF renderer adapter not enabled |
| Drawing mutation/export | Not ready | Fails closed with `CAD_CAPABILITY_NOT_IMPLEMENTED` |

## API

`POST /api/cad/analyze`

Authenticated request:

```json
{
  "filename": "drawing.dxf",
  "contentBase64": "..."
}
```

The endpoint accepts file bytes, not an arbitrary host path. It returns `document`, `previewSvg`, and `report`. The request body is limited by the Console server and the CAD loader enforces a 10 MB document limit.

## Kernel relationship

The `engineering-cad` domain defines a four-stage professional workflow: load, parse, analyze and preview. The stages bind to `agent-engineering-cad` and resolve through the existing professional capability registry to `local-cad-dxf-1`. Static worker state is unavailable; the existing registry probe is the authority that marks the DXF profile ready.

## Next boundary

CAD-002 may build validation and BOM rules on the canonical JSON. DWG, IFC and PDF need isolated external adapters and their own readiness probes before they can be advertised as runnable.
