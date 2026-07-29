# MEDIA-011 Semantic Helmet Candidate

## Purpose

This step turns the gauge-calibration evidence into the first independently
rebuildable semantic part. It does not modify or replace the immutable V15
character baseline.

## Command

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  build-semantic-part-candidate \
  --config packages/3d-modeling-domain/examples/huihui-v15-gauge-calibration.example.json \
  --part helmet-shell \
  --output runtime/artifacts/media/huihui-printable-v3/gauge-calibration-v1/semantic-parts/helmet-shell-v1
```

## Geometry authority

- Front X/Z dimensions come from the metric authoritative front image.
- The crown profile uses monotone cubic interpolation between locked gauge
  sections. Interpolation increases surface resolution without moving the
  measured sections.
- Y depth is a provisional V15 raycast prior. It is not treated as approved
  metric evidence.
- Crown and brim remain separate objects.
- The `helmet-body-interface` remains `KEEP_SEPARATE` with a 0.4 mm tolerance.

## Output

- `helmet-shell-v1.blend`: review scene with the immutable baseline retained.
- `helmet-shell-v1.glb`: selected semantic candidate objects.
- `helmet-front.png`: front geometry review.
- `helmet-right.png`: right geometry review.
- `helmet-geometry-report.json`: hashes, authority, topology and interface
  evidence.

## Safety boundary

The command does not call an external model, read a credential value, apply
global smoothing, use voxel remeshing, weld semantic parts, or overwrite V15.
The result remains `PROVISIONAL_OWNER_REVIEW`.

Branding, reinforcement ribs, shell thickness and manufacturing joins are
separate follow-up parts. They are intentionally excluded from this shell
review so an old fused detail cannot mask a geometry regression.
