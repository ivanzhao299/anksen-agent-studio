# MEDIA-008 V15 Inverse-Render Fidelity Baseline

## Decision

V15 remains the protected baseline. Its volume, silhouette and character
proportions are close enough to the approved Huihui identity that another
whole-model reconstruction would add more risk than value.

The next candidate must be produced by semantic-region refinement and proved
by high-resolution render-to-reference alignment. No candidate may overwrite
V15 automatically.

## Why V15 Is Close But Not Complete

The legacy silhouette evaluator confirms that the outer geometry is useful:

- mean silhouette IoU: `0.781711`;
- front silhouette IoU: `0.868259`;
- minimum view IoU: `0.600826`;
- topology: watertight;
- quality grade: `REFINED_PROTOTYPE`.

The new inverse-render evaluator exposes the remaining visual gap:

- mean silhouette IoU: `0.782298`;
- authoritative front silhouette IoU: `0.866048`;
- front edge similarity: `0.421265`;
- front structural similarity: `0.104306`;
- front material/color similarity: `0.380358`;
- front composite score: `0.491563`;
- weighted front semantic score: `0.197380`;
- minimum required semantic score: `0.103507`.

The candidate therefore has the right broad body but does not yet reconstruct
the approved high-resolution image at product-asset quality.

## Semantic Findings

| Region | Composite | Interpretation |
| --- | ---: | --- |
| Helmet | 0.195799 | Broad mass exists; brim, plate and boundary hierarchy need rebuilding. |
| Face screen | 0.276357 | Shape is recognizable; face geometry and black-screen material boundary are weak. |
| Torso shell | 0.264647 | Body volume is useful; concrete texture and front relief are incomplete. |
| Left arm/hand | 0.120188 | Short-limb silhouette and glove anatomy need reference-specific geometry. |
| Right arm/hand | 0.140567 | Raised hand/finger structure and wrist interface need rebuilding. |
| Boots | 0.267855 | Oversized proportion is retained; sole, cuff and lace boundaries need hard-surface detail. |
| Branding | 0.103507 | Lowest score; helmet wordmark and chest emblem must be independent controlled geometry. |

## Combined High-Fidelity Method

The production path combines the useful parts of the earlier experiments:

1. **V15 provider prior**: retain its body volume, short limbs, oversized boots
   and validated watertight topology.
2. **Feature-aware continuity**: keep organic curvature reconstruction, but
   never smooth the full model globally again.
3. **Geometry-first semantic parts**: rebuild helmet plate/brim, face screen,
   gloves, cuffs, boots, chest medallion and branding with editable primitives
   and explicit joins.
4. **Orbit evidence**: use AI-generated angles only for hidden geometry and
   endpoint direction; generated frames remain non-metric.
5. **Inverse-render fitting**: render canonical views into the same normalized
   frame as the references and measure silhouette, edges, structure, color and
   semantic regions.
6. **Fail-closed promotion**: reject any candidate that regresses the
   authoritative front or a required semantic region.
7. **Manufacturing proof**: visual fidelity does not replace watertight,
   thickness, slicer, support and physical-print gates.

This workflow is an evaluation and refinement capability inside the existing
Skill Router. It creates no second planner, scheduler, worker, runtime, queue or
state machine.

## V16 Refinement Order

1. Rebuild helmet and chest branding as independent vector/relief geometry.
2. Rebuild left/right arms, wrists, gloves and visible finger groups.
3. Rebuild helmet brim/plate and face-screen interface with controlled hard
   edges.
4. Refine boot cuffs, soles and laces without changing the oversized boot
   proportion.
5. Assign concrete, black screen, yellow painted metal/rubber and dark joint
   material classes.
6. Tune local geometry and material parameters against the front semantic
   scores.
7. Render all canonical views and run the promotion gate.
8. Only after visual promotion, run topology, slicer and 60 mm proof review.

## Promotion Targets

The next candidate is eligible for owner review only when all configured gates
pass:

- mean silhouette IoU at least `0.82`;
- authoritative front silhouette IoU at least `0.90`;
- front edge similarity at least `0.72`;
- front structural similarity at least `0.72`;
- front material/color similarity at least `0.80`;
- front composite score at least `0.78`;
- every required semantic region at least `0.65`;
- no front or semantic regression against V15.

These are intentionally stricter than the prototype surface gate because the
goal is high-granularity image reconstruction, not merely a printable shape.

## Evidence

- Configuration:
  `packages/3d-modeling-domain/examples/huihui-v15-inverse-render-fidelity.example.json`
- Schema:
  `packages/3d-modeling-domain/schemas/inverse-render-fidelity.schema.json`
- Machine report:
  `runtime/artifacts/media/huihui-printable-v3/refined-v15-modeling-domain/inverse-render-fidelity/high-resolution-fidelity-report.json`
- Visual contact sheet:
  `runtime/artifacts/media/huihui-printable-v3/refined-v15-modeling-domain/inverse-render-fidelity/inverse-render-contact-sheet.jpg`

No paid provider call, real secret read, master overwrite, push or deployment
was performed in this implementation.
