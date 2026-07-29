# MEDIA-010 Gauge-Driven Multiview Geometry Calibration

## Purpose

This capability replaces prompt-only reconstruction and whole-mesh smoothing with a
measurable geometry workflow. It follows the same principle as a key-duplication
gauge: lock a datum, measure named control points against an authoritative reference,
fit explicit geometry, and modify only the part or interface that failed.

V15 remains the immutable geometry baseline. This workflow produces calibration
evidence and a local patch work order; it does not overwrite the master mesh.

## Coordinate Authority

- Unit: millimeter.
- Target height: 180 mm.
- Ground datum: `Z=0`.
- Symmetry datum: `X=0`.
- Front datum: `Y=0`.
- Authoritative front image: identity, scale, X and Z coordinates.
- AI-generated side and rear images: non-metric depth priors only.

Missing metric depth is a `HOLD`, never a guessed dimension.

## Semantic Gauges

The front reference carries owner-reviewable pixel probes for:

- body shell;
- face screen;
- helmet crown and brim;
- left and right ear pods;
- shoulder, elbow and wrist chains;
- palms and fingertips;
- hips and ankles;
- toe, heel and sole points;
- helmet and chest branding centers.

Each pixel probe is converted into the 180 mm model coordinate system and retains
its source. Body and helmet contours additionally produce horizontal control
sections suitable for superellipsoid or cubic Bezier profile fitting.

## Geometry Construction Rules

1. Fit one semantic primitive at a time.
2. Use superellipsoids and Bezier profiles for the body and helmet.
3. Use rounded prisms for hard face-screen boundaries.
4. Use cylinders or capsules for ears, arms and legs.
5. Keep hands, boots and branding as editable composite parts.
6. Use named interfaces with explicit tolerances.
7. Preserve hard edges and component boundaries.
8. Defer manufacturing union until geometry and physical proof gates pass.

Global smoothing, global voxel remeshing and automatic master replacement are
forbidden because they recreate the membrane-like adhesion seen in earlier
candidates.

## Current Result

The gauge builder produces:

- `gauge-coordinate-system.json`;
- `semantic-anchor-proposal.json`;
- `local-patch-work-order.json`;
- `front-gauge-overlay.png`;
- `calibration-report.json`.

The authoritative front now resolves the part-level X/Z probes. The workflow remains
`HOLD_OWNER_REVIEW` because the available side and rear views were AI-generated and
cannot establish millimeter depth. The helmet rear brim and chest relief depth also
remain unresolved.

## V15 Depth Transfer

The second stage raycasts every available front X/Z anchor through the immutable V15
Blender baseline. It records the first front and rear surface intersections as a
provisional Y-depth prior, then writes the measurements and colored gauge cages into
a separate Blender copy.

This stage produces:

- `v15-gauge-depth-transfer.blend`;
- `v15-depth-front.png`;
- `v15-depth-right.png`;
- `v15-depth-transfer-report.json`.

The source `.blend` is SHA-256 checked before and after execution. A changed hash
fails the run. The transfer does not smooth, voxel-remesh, weld or boolean-union any
geometry.

The transferred Y values are not metric truth. They describe what V15 currently
contains and expose where the provider base is fused. They are suitable for selecting
the next semantic part to rebuild, not for promoting a manufacturing master.

## Resume

```bash
node packages/3d-modeling-domain/bin/3d-modeling-domain.mjs plan \
  --config packages/3d-modeling-domain/examples/huihui-v15-gauge-calibration.example.json

node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  build-gauge-calibration \
  --config packages/3d-modeling-domain/examples/huihui-v15-gauge-calibration.example.json \
  --output runtime/artifacts/media/huihui-printable-v3/gauge-calibration-v1

node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  build-gauge-depth-transfer \
  --config packages/3d-modeling-domain/examples/huihui-v15-gauge-calibration.example.json \
  --output runtime/artifacts/media/huihui-printable-v3/gauge-calibration-v1/v15-depth-transfer
```

## Next Fine-Geometry Stage

1. Review the V15 front/right gauge transfer and select one semantic part for local
   parametric reconstruction.
2. Capture or owner-approve true orthographic right, rear and left references with
   the same pose, scale and focal model.
3. Add depth probes for brim front/back, face-screen setback, ear thickness, limb
   radii, palm thickness, boot toe/heel depth and branding relief.
4. Fit semantic primitives and Bezier control cages from the locked probes.
5. Create local Blender patches only for named failed parts or interfaces.
6. Reproject the candidate into all views and compare silhouette, edges and
   component seams against V15 and the authoritative reference.
7. Promote only when identity does not regress and every assembly interface passes
   tolerance review.
