# MEDIA-009 Meshy Text Assembly Experiment

## Purpose

Test whether a reference-derived geometry prompt can make Meshy-6 produce a
clear, product-like assembly without the fused, membrane-covered appearance of
the current provider base mesh.

This is a governed geometry experiment. It does not replace the authoritative
Huihui reference image, the locked multiview evidence, or the protected V15
baseline.

## Input And Prompt

- Authoritative front reference:
  `runtime/workspaces/media/huihui-printable-v3/references/normalized/huihui-angle-000-front.png`
- Prompt plan:
  `packages/3d-modeling-domain/examples/huihui-meshy6-assembly-prompt.example.json`
- Provider: Meshy text-to-3D, Meshy-6 preview
- Geometry mode: no remesh, no provider texture purchase
- Governance: MEDIUM, explicit cost approval, credential reference only

The prompt described the wide concrete body, recessed face screen, hardhat,
ear pods, short articulated limbs, large boots, chest badge, waving hand and
explicitly prohibited fused parts, melted joints, membrane surfaces, blobs and
global smoothing.

## Real Provider Result

- Provider task:
  `019fab28-28fe-7cfe-8e2a-296f5dd34644`
- Candidate:
  `runtime/artifacts/media/huihui-printable-v3/meshy-text-assembly-v1/meshy-text-assembly-candidate.glb`
- Submission audit:
  `runtime/artifacts/media/huihui-printable-v3/meshy-text-assembly-v1/provider-submission-audit.json`
- Clay review:
  `runtime/artifacts/media/huihui-printable-v3/meshy-text-assembly-v1/clay-turntable-contact-sheet.jpg`
- Color review:
  `runtime/artifacts/media/huihui-printable-v3/meshy-text-assembly-v1/color-turntable-contact-sheet.jpg`

The provider returned a generic astronaut-like robot. It has clearer visual
seams than the fused provider base, but it does not preserve Huihui's identity:
the body is too narrow, the head is too large, the limbs are exposed and too
long, the boots and waving pose are wrong, and the concrete, branding and
material language are absent.

## Quantitative Fidelity Result

Report:
`runtime/artifacts/media/huihui-printable-v3/meshy-text-assembly-v1/inverse-render-fidelity/high-resolution-fidelity-report.json`

| Metric | V15 baseline | Text candidate |
| --- | ---: | ---: |
| Mean silhouette IoU | 0.782298 | 0.647367 |
| Front silhouette IoU | 0.866048 | 0.626928 |
| Front edge similarity | 0.421265 | 0.298821 |
| Front structural similarity | 0.104306 | 0.074556 |
| Front material/color similarity | 0.380358 | 0.163413 |
| Front composite score | 0.491563 | 0.337281 |
| Weighted semantic score | 0.197380 | 0.127659 |
| Minimum semantic score | 0.103507 | 0.010810 |

All promotion gates are `HOLD`. The candidate is rejected and V15 remains the
protected baseline.

## Assembly Inspection

The reusable inspection command is:

```bash
pnpm --filter @anksen/digital-human-pipeline mesh:inspect -- \
  --mesh <candidate.glb> \
  --output <mesh-assembly-report.json>
```

Text candidate report:
`runtime/artifacts/media/huihui-printable-v3/meshy-text-assembly-v1/mesh-assembly-report.json`

- Mesh objects: 1
- Welded connected shells: 3
- Material slots: 0
- Duplicate vertex ratio before in-memory welding: 0.833284
- Interpretation: `ONE_OBJECT_MULTIPLE_SHELLS`

V15 report:
`runtime/artifacts/media/huihui-printable-v3/refined-v15-modeling-domain/mesh-assembly-report.json`

- Mesh objects: 12
- Welded connected shells: 21
- Material slots: 11
- Duplicate vertex ratio before in-memory welding: 0.015496
- Interpretation: `SEPARATE_OBJECTS`

The experiment therefore improves visual separation cues, not authorable
assembly structure. A visible groove is not sufficient evidence that parts are
independent, editable or printable.

## Decision

`REJECT_TEXT_CANDIDATE_KEEP_V15`

Text-to-3D is retained as a low-cost semantic decomposition probe only. It must
not become the identity geometry source for a reference-locked character.

The production path is hybrid:

1. Lock identity and proportions to the authoritative front and multiview
   images.
2. Keep V15 as the geometry baseline.
3. Convert prompt semantics into explicit part masks and interface constraints
   for hardhat, face screen, ear pods, shoulders, wrists, gloves, ankles,
   boots and branding.
4. Split and locally retopologize those regions as separate Blender objects;
   preserve designed hard edges and apply smoothing only to organic concrete
   shell zones.
5. Require both inverse-render fidelity and assembly inspection to pass before
   promotion.

No further paid text-to-3D generation should run until the semantic part masks
and feature-aware local refinement stage are ready.
