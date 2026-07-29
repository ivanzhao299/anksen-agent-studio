# MEDIA-007 AI Orbit Reference Calibration

## Purpose

This path turns an approved high-resolution front image into a governed
multi-angle calibration source for geometry-first character modeling. It uses
an AI-generated orbit only to expose directional evidence. It does not treat
generated pixels as a metric scan and it never overwrites the authoritative
front identity or the current master model automatically.

## Authority order

1. The approved high-resolution front image is the identity and front
   proportion authority.
2. Owner-approved side and rear references are directional hidden-geometry
   evidence.
3. AI-generated orbit frames are non-metric observations.
4. A parametric model is a review candidate until it improves reprojection
   metrics and passes owner review.
5. Material, topology, slicer and physical proof gates remain independent.

## Workflow

1. Lock the approved front master.
2. Generate a fixed-camera, fixed-pose, 360-degree orbit plan.
3. Extract evenly spaced frames and map them to expected angles.
4. Reject frames with identity, pose, framing or rotation drift.
5. Segment semantic parts instead of fitting the whole silhouette as one body.
6. Record normalized part bounds, centers and endpoint observations.
7. Fit geometric projections across all accepted angles.
8. Build an isolated review candidate; keep the master unchanged.
9. Render the candidate from the canonical eight orthographic views.
10. Compare normalized silhouettes and require improvement over the baseline.
11. Calibrate materials and local details only after geometry promotion.

For an ellipsoidal part, the horizontal half-width at angle `theta` is fitted
as:

```text
q(theta) = A * cos(theta)^2 + B * sin(theta)^2
```

The fit uses accepted observations and confidence weights. Residual error,
coverage and semantic-mask confidence determine whether a parameter is
eligible for review.

## Commands

Prepare the governed provider plan without making a paid external call:

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  prepare-orbit-reference \
  --config packages/3d-modeling-domain/examples/huihui-ai-orbit-calibration.example.json \
  --output runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1
```

Extract and observe a returned continuous orbit:

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  extract-orbit-frames \
  --config packages/3d-modeling-domain/examples/huihui-ai-orbit-calibration.example.json \
  --video /absolute/path/to/provider-orbit.mp4 \
  --output runtime/workspaces/media/huihui-printable-v3/orbit-frames

node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  observe-orbit-reference \
  --config packages/3d-modeling-domain/examples/huihui-ai-orbit-calibration.example.json \
  --frames-manifest runtime/workspaces/media/huihui-printable-v3/orbit-frames/orbit-frames-manifest.json \
  --output runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/orbit-frame-observations.json
```

Fit review-only geometry parameters:

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  fit-orbit-parameters \
  --observations runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/orbit-frame-observations.json \
  --spec packages/3d-modeling-domain/examples/huihui-parametric-character.example.json \
  --output runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/geometry-parameter-proposal.json
```

Evaluate candidate promotion:

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  evaluate-orbit-candidate \
  --baseline runtime/artifacts/media/huihui-printable-v3/parametric-v1-geometry-first/silhouette-report.json \
  --candidate runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/geometry-review-candidate/silhouette-report.json \
  --proposal runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/geometry-parameter-proposal.json \
  --output runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/candidate-promotion-report.json
```

## Current evidence

The existing sparse eight-view bundle was used as an offline fixture. It is not
a continuous provider video, so durable optical tracks are intentionally
reported as zero. Semantic observations and all-angle projection fitting are
available, but the candidate failed promotion:

- baseline mean IoU: `0.752019`;
- candidate mean IoU: `0.744337`;
- mean delta: `-0.007682`;
- right-view delta: `-0.024015`;
- left-view delta: `-0.022075`;
- decision: `REJECTED_KEEP_BASELINE`.

This result proves that a plausible parameter proposal is not enough. The
candidate must improve the actual rendered evidence.

## Remaining work

1. Run an approved continuous orbit so adjacent-frame feature tracking can be
   measured.
2. Add separate arm, glove, lower-leg and boot-pair observations.
3. Fit joint anchors and semantic interfaces, not only part envelopes.
4. Rebuild the face screen, limbs, gloves and boots with reference-specific
   primitives.
5. Add color/material-region reprojection after geometry passes.
6. Require visual-owner, slicer and 60 mm physical proof before print release.

No paid model call or credential-value read was performed while establishing
this path.
