# ANKSEN 3D Modeling Domain

This package extracts high-fidelity, printable 3D asset work from the video
pipeline into a reusable domain capability. It defines the modeling contract,
ordered modeling stages, Skill Router request and release evidence gate.

It does not introduce another Planner, Scheduler, Worker, Runtime, Queue or
State Machine. Execution delegates to the existing
`character_3d_print_refinement` skill and its governed Blender adapter.

The default character workflow covers reference ingestion, multiview identity
locking, provider reconstruction, semantic-region classification, continuous
surface reconstruction, source-feature protection, local curvature fairing,
detail rebuilding, topology/print QA and visual/slicer/physical proof.

`surfaceSubdivisionLevel` is a bounded refinement-intensity preset. For the
default `voxel` method it controls reconstruction density and fairing strength;
it must not be interpreted as a claim that Catmull-Clark alone repaired a rough
provider mesh.

The current reference workflow removes small disconnected provider fragments,
reconstructs one printable base body and applies a different treatment to each
semantic class:

- organic shells use measured fairing;
- hard surfaces and material boundaries preserve source ridges;
- legacy generated relief is locally erased and rebuilt;
- joint interfaces remain a required separation gate for master-grade output.

The chest medallion is rebuilt as a pole-free concentric quad-ring patch
conformed to the torso. This avoids the center-fan pinching and floating rigid
disc failure found in earlier candidates. Smooth shading is presentation-only
and is never accepted as geometry proof.

The surface analyzer has its own dependency manifest. A dedicated environment
can be created with:

```bash
python3 -m venv packages/3d-modeling-domain/.venv
packages/3d-modeling-domain/.venv/bin/pip install \
  -r packages/3d-modeling-domain/requirements.txt
```

`MODELING_PYTHON` may select another governed Python interpreter. For backward
compatibility the command can reuse the existing digital-human reconstruction
environment, but the dependency ownership remains in this package.

## Commands

```bash
pnpm modeling3d:validate
pnpm modeling3d:plan
pnpm modeling3d:surface-quality -- \
  --mesh runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced/huihui-printable-v3-base.stl \
  --source-mesh runtime/artifacts/media/huihui-printable-v3/meshy-plan/provider-candidate.glb \
  --feature-angle-degrees 60 \
  --output runtime/artifacts/media/huihui-printable-v3/refined-v21-feature-balanced/surface-quality-feature-aware-report.json
```

`surface-quality` reads mesh geometry, not render normals. It reports dihedral
angle distribution, sharp-adjacency ratios and triangle quality against separate
prototype and fine-asset thresholds. When `--source-mesh` is supplied, it
separates source hard-feature zones from organic continuity zones. This prevents
real helmet brims, face rims, ear caps and sole edges from being counted as
surface defects while still detecting faceting on the body shell.

Passing prototype continuity does not imply fine-asset release. The fine gate
remains closed until semantic part separation, measured organic curvature,
visual review, slicer review and physical proof all pass.

The plan delegates `REFINE_PRINTABLE` to the existing Skill Router. A completed
local refinement is still `HOLD` for manufacturing release until owner visual
review, slicer wall/self-intersection/support checks and a physical proof are
recorded as `PASS`.

## Geometry-first character construction

Provider reconstruction is no longer the only entry path. The parametric
character contract decomposes a figure into named semantic parts, constructs
each part from controlled primitives, refines each part according to its own
hard-edge policy and records the intended join at every interface.

```bash
node packages/3d-modeling-domain/bin/3d-modeling-domain.mjs validate \
  --config packages/3d-modeling-domain/examples/huihui-parametric-character.example.json

node packages/3d-modeling-domain/bin/3d-modeling-domain.mjs plan \
  --config packages/3d-modeling-domain/examples/huihui-parametric-character.example.json

node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  build-parametric-printable \
  --spec packages/3d-modeling-domain/examples/huihui-parametric-character.example.json
```

The semantic Blend and GLB assembly are authoritative. Global voxel remeshing
is forbidden as a master-building method because it rounds hard features,
closes material seams and destroys controlled interfaces. It may be requested
explicitly as a non-authoritative print-fit preview. Exact boolean union,
slicer review and a physical proof remain separate manufacturing release
gates.

Meshy Text-to-3D, Image-to-3D and Multi-Image-to-3D remain useful for shape
ideation, hidden-view evidence and surface-detail reference. Their generated
mesh is never treated as dimensional or semantic topology authority.

## Orbit-derived reference calibration

`orbit-reference-calibration.schema.json` defines a provider-neutral contract
for a fixed-pose AI orbit. It records the authoritative front master, expected
angles, drift rejection rules, semantic observations, coordinate normalization
and promotion policy. Generated frames remain non-metric and cannot replace the
front identity master.

The digital-human pipeline consumes this contract to extract frames, track
continuous-video features when available, measure semantic parts, fit
all-angle geometric projections and create an isolated review candidate. A
separate baseline-comparison gate must pass before owner review; no candidate
can overwrite the master automatically.

## High-resolution inverse-render alignment

Silhouette agreement is necessary but is not sufficient for a high-fidelity
character asset. `inverse-render-fidelity.schema.json` adds a render-to-reference
evaluation contract that keeps the approved front image authoritative and
measures the candidate's silhouette, edge structure, multiscale gradients,
material/color distribution and named semantic regions.

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  evaluate-render-fidelity \
  --config packages/3d-modeling-domain/examples/huihui-v15-inverse-render-fidelity.example.json \
  --output runtime/artifacts/media/huihui-printable-v3/refined-v15-modeling-domain/inverse-render-fidelity \
  --size 640

node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs \
  promote-render-fidelity \
  --baseline /absolute/path/to/baseline/high-resolution-fidelity-report.json \
  --candidate /absolute/path/to/candidate/high-resolution-fidelity-report.json \
  --output /absolute/path/to/promotion-report.json
```

The evaluator normalizes the reference and candidate into the same framing and
produces a contact sheet plus a machine-readable report. Generated side and
rear references remain low-weight, non-metric evidence. The approved front
image receives the strongest weight and is also split into semantic regions:
helmet, face screen, torso shell, left/right arms and hands, boots and
branding.

Promotion is fail-closed. A candidate is rejected when it regresses the front
view, regresses any required semantic region, misses a target gate or fails to
show a meaningful aggregate gain. It is never allowed to overwrite the master
automatically.

The recommended refinement loop combines the strongest parts of the earlier
iterations:

1. retain the V15 provider geometry as the proportion and volume prior;
2. keep feature-aware surface reconstruction for organic continuity;
3. rebuild hard surfaces, interfaces and branding as semantic parts;
4. use generated orbit views only to resolve hidden geometry;
5. optimize one semantic region at a time against inverse-render evidence;
6. rerun topology, slicer and physical-proof gates after visual fidelity passes.

Do not apply another global smoothing pass. V16 should first rebuild branding,
then arms/hands, helmet/face-screen interfaces, boots and material classes.
