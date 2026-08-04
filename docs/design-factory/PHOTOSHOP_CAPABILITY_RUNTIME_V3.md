# Photoshop Capability Runtime V3

Status: V3 foundation implemented and accepted in Photoshop 2026 v27.9; operations outside the accepted matrix remain explicitly gated.

## Outcome

V3 removes the fixed-template ceiling without turning Photoshop into a second Studio runtime. The existing Studio Goal → Planner → Task Graph remains authoritative. One approved Photoshop task carries one document-local command graph. The plugin validates, previews and executes that graph inside one modal history boundary.

```text
Existing Studio Task
  -> Design Practice evidence + approved direction
  -> Photoshop Capability Registry
  -> document-local Photoshop Command Graph
  -> typed Operation DSL
  -> static DOM / BatchPlay translators
  -> Photoshop document
  -> preflight + artifacts + SHA-256 result manifest
```

The command graph has no workers, queue, scheduler, retries, persistence or task status. It only provides deterministic dependency ordering for commands inside the current Studio task.

## Why this replaces the fixed JSON template model

The V2 plugin exposed 13 operations and relied on project-specific JSX for sophisticated work. V3 exposes 33 composable operations. Created layer outputs can be referenced by later nodes through `target.nodeOutput`, so Studio can assemble different compositions without knowing Photoshop-generated layer IDs in advance.

Capability families:

- document inspection and semantic layer targeting;
- layer creation, naming, visibility, opacity, blending and transforms;
- editable text creation, content, color and character styling;
- placed and replaceable smart objects;
- rectangle, ellipse and polygon selections;
- reveal-selection masks and destructive mask application;
- brightness/contrast, hue/saturation, exposure and curves adjustment layers;
- Gaussian blur, unsharp mask, noise and motion blur;
- editable PSD copy and PNG/JPG review exports.

Creativity remains in the approved art direction, prompt/asset generation and command composition. Photoshop provides precise reconstruction, editable structure and production output.

## Governance boundary

- Raw BatchPlay descriptors, JavaScript, JSX, `eval`, shell commands and direct paths remain forbidden in jobs.
- Every operation derives risk, capability ID, Tool Intent and host verification state from the registry.
- V3 requires all actually used capabilities to have matching declared Tool Intent IDs.
- Asset reads and outputs require explicit UXP file picker entries.
- Writes require a task/document-bound human confirmation.
- SAVE/EXPORT nodes must be terminal and every output runs technical preflight first.
- Runtime Adapter independently validates the normalized V3 job before interactive dispatch.
- Default builds remain offline; production and deployment flags remain false.

## Open-source intake decision

| Project | Decision | Reason |
| --- | --- | --- |
| photoshop-mcp | Optional future external adapter, not bundled | Broad control surface, but arbitrary scripts, analytics, AppleScript and separate server runtime conflict with default Studio governance. |
| Alchemist | Development/reference tool | Best fit for recording and inspecting Action Manager descriptors. |
| UXP Toolkit | Design reference for typed translators | Useful typed mask/adjustment patterns; ANKSEN keeps a smaller CommonJS-compatible static executor. |
| PhotoshopAPI | Future offline PSD/PSB adapter | Strong layered file support, but incomplete adjustment/vector-mask writing and invalid merged composite in written PSDs. |
| psd-tools | Future independent QA parser | Mature PSD inspection; limited editing. |

Pinned commits and licenses are recorded in `packages/photoshop-uxp-plugin/THIRD_PARTY_NOTICES.md`.

## Acceptance ladder

1. Offline contract: capability registry, graph compilation, raw-execution rejection and intent parity tests.
2. Offline executor: mocked DOM/BatchPlay descriptors, layer-output references, create-document path, rollback and output preflight tests.
3. Build: Manifest v5 validation and UXP bundle generation.
4. Host smoke test: load `dist/manifest.json` in UXP Developer Tool and run `capability-graph-v3.example.json`.
5. Host operation matrix: verify every `HOST_ACCEPTANCE_REQUIRED` operation against Photoshop 2026 and promote its registry state only with evidence.
6. Complex artifact: inspect editable text, smart object, mask and adjustment layer in PSD; verify PNG dimensions and result manifest checksums.
7. Human visual review: typography, hierarchy, contrast, spacing and brand quality remain a human/Reviewer decision rather than a technical pass claim.

## Photoshop 2026 host acceptance

On 2026-08-04, the 24-node `editorial-poster-production-02` command graph completed in Adobe Photoshop 2026 v27.9 on macOS. Evidence set: `anksen-capability-v3-20260804-002631`.

- PSD and PNG are both 2400 × 3600 px; PSD signature is `8BPS`.
- Result preflight is READY with score 100; PSD, PNG and canonical manifest SHA-256 values all match.
- Independent `psd-tools` parsing confirms seven semantic top-level layers: solid fill, two smart objects, curves adjustment and three editable type layers.
- Both hero smart objects retain reveal-selection masks. The glow smart object contains an enabled Gaussian smart filter with a 28 px radius and remains editable.
- The final visual was inspected after the target-layer selection bug was fixed; the earlier technically successful but semantically wrong artifact was rejected.

The registry now marks only the operations exercised by this and earlier evidence as `VERIFIED`. Ellipse/polygon selections, rotation, rasterization, smart-object conversion, destructive mask application and other unexercised paths remain `HOST_ACCEPTANCE_REQUIRED`.

## Current non-claims

- V3 does not claim that every registered operation has real-host evidence; the registry is the source of truth for the remaining acceptance matrix.
- External Studio Bridge/Runtime activation remains disabled.
- PhotoshopAPI and photoshop-mcp are not production dependencies.
- Technical preflight does not certify aesthetic quality.
