# ANKSEN Digital Human Pipeline

This package is a governed media capability used by the existing Studio
Professional Runner. It does not add another planner, worker, queue, or runtime.

The pipeline turns reusable manifests into:

1. identity-stable 3D character assets;
2. a reusable 3D scene;
3. script and audio aligned viseme tracks;
4. deterministic camera and performance animation;
5. turntable evidence, GLB assets, a Blender source scene, and an MP4 render.

It now has three distinct fidelity paths:

- `render-fidelity`: procedural Blender proof for rig, scene, export, and 3D asset
  validation. It must not be presented as an exact identity reconstruction.
- `render-reference-lock`: a reference-derived 2.5D proof that preserves the
  approved front-view identity, composites it into consecutive frames from the
  supplied location video, and adds entrance, breathing, local wave deformation,
  blink, and viseme motion.
- `prepare-ai-video`: a governed first/end-frame route for providers such as
  Kling AI. It keeps the approved character and real location in both boundary
  frames, attaches front/side/back identity references, and writes a provider
  dispatch plan without reading a credential value or calling the provider.
- `kling-submit`, `kling-status`, and `kling-poll`: the overseas Kling Open
  Platform execution boundary. Submission uses Kling Video 3.0 start/end
  frames, status polling uses the task API, and successful output can be
  downloaded into the governed artifact directory.

The Blender runner is disabled by default. Studio must pass the existing
Professional Runner activation, fencing, artifact, and audit gates before it can
execute.

## AI orbit calibration

The geometry-first route can use a governed AI orbit as a directional
calibration source. The fixed-pose orbit is sampled into angular observations,
semantic parts are measured in normalized character coordinates, and
ellipsoidal projections are fitted across all accepted angles. Generated orbit
frames are never metric truth.

Every fitted spec is written as an isolated review candidate. The
`evaluate-orbit-candidate` command compares its eight-view reprojection report
with the current baseline and rejects any candidate that fails to improve the
mean, regresses the authoritative front, or materially regresses an individual
view. The master is never overwritten automatically.

## Commands

```bash
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs doctor
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs validate \
  --project runtime/workspaces/media/<project>
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs prepare \
  --project runtime/workspaces/media/<project>
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs render \
  --project runtime/workspaces/media/<project> \
  --output runtime/artifacts/media/<project>
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs turntables \
  --project runtime/workspaces/media/<project> \
  --output runtime/artifacts/media/<project>
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs render-reference-lock \
  --project runtime/workspaces/media/<project> \
  --output runtime/artifacts/media/<project>-reference-lock
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs extract-reference-assets \
  --project runtime/workspaces/media/<project> \
  --source /absolute/path/to/character-sheet.png
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs prepare-ai-video \
  --project runtime/workspaces/media/<project> \
  --provider kling-ai \
  --output runtime/artifacts/media/<project>-ai-video-plan
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs kling-submit \
  --plan runtime/artifacts/media/<project>-ai-video-plan/ai-video-dispatch-plan.json \
  --dry-run
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs kling-credential-status \
  --dry-run
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs kling-submit \
  --plan runtime/artifacts/media/<project>-ai-video-plan/ai-video-dispatch-plan.json \
  --apply --cost-approved
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs kling-status \
  --audit runtime/artifacts/media/<project>-ai-video-plan/provider-submission-audit.json \
  --apply
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs kling-poll \
  --audit runtime/artifacts/media/<project>-ai-video-plan/provider-submission-audit.json \
  --apply --download
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs reconstruction-providers \
  --dry-run
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs prepare-orbit-reference \
  --config packages/3d-modeling-domain/examples/huihui-ai-orbit-calibration.example.json \
  --output runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs observe-orbit-reference \
  --config packages/3d-modeling-domain/examples/huihui-ai-orbit-calibration.example.json \
  --manifest runtime/workspaces/media/huihui-printable-v3/multiview-manifest.json \
  --output runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/orbit-frame-observations.json
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs fit-orbit-parameters \
  --observations runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/orbit-frame-observations.json \
  --spec packages/3d-modeling-domain/examples/huihui-parametric-character.example.json \
  --output runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/geometry-parameter-proposal.json
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs prepare-ai-3d \
  --manifest runtime/workspaces/media/huihui-printable-v3/multiview-manifest.json \
  --depth-manifest runtime/workspaces/media/huihui-printable-v3/depth-manifest.json \
  --provider meshy-multi-image \
  --output runtime/artifacts/media/huihui-printable-v3/meshy-plan
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs meshy-credential-status \
  --dry-run
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs meshy-3d-submit \
  --plan runtime/artifacts/media/huihui-printable-v3/meshy-plan/ai-3d-reconstruction-plan.json \
  --dry-run
node packages/digital-human-pipeline/bin/digital-human-pipeline.mjs refine-printable \
  --mesh runtime/artifacts/media/huihui-printable-v3/meshy-plan/provider-candidate.glb \
  --manifest runtime/workspaces/media/huihui-printable-v3/multiview-manifest.json \
  --asset-id huihui-printable-v3 \
  --target-height-mm 180 \
  --output runtime/artifacts/media/huihui-printable-v3/refined
```

`render` never publishes. It writes only inside the requested artifact root.
`turntables` reuses the saved Blender master, freezes every rig in a neutral
pose, isolates one character at a time, and renders eight identity-check angles
without rerendering the story.

## Fidelity boundary

`render-reference-lock` proves the short-form story path without replacing the
character with a generic model. It is appropriate for a five-to-eight-second
identity and motion test. It is not a production 360-degree digital human.

A production 3D asset still requires separately approved high-resolution front,
side, and back views, clean silhouettes, modeled hidden surfaces, retopology,
UVs, material authoring, a facial/viseme rig, a body rig, and turntable approval.
The pipeline records this boundary in `reference-lock-report.json`.

The extracted tri-view images reduce identity setup work for an AI video
provider, but they do not infer hidden geometry or become a production 3D model.
Provider submission remains blocked until Studio receives an approved cost gate
and an external credential reference. Secret values are never written into the
project, plan, or artifact manifest.

## Kling overseas API boundary

The overseas Kling web session and the Open Platform API credential are
different authentication boundaries. Studio never reads Chrome cookies,
localStorage, or the signed-in Kling web session. The executor resolves only
the `kling-api-key-ref` credential reference, whose local execution binding is
the `KLING_API_KEY` environment variable or the macOS Keychain item with service
`com.anksen.agent-studio.kling-api` and account `kling-api-key`.

On macOS, bind the key without placing it on the command line:

```bash
security add-generic-password -U \
  -a kling-api-key \
  -s com.anksen.agent-studio.kling-api \
  -w
```

The final `-w` opens the hidden password prompt. The status command checks only
whether the reference exists; it never prints or reads the stored value.

Do not paste that value into source files, plans, audit logs, or chat. Configure
it in the process secret environment or a future external secret backend.
`kling-submit --dry-run` deliberately does not read the variable. A real paid
submission requires both `--apply` and `--cost-approved`.

Audit records contain task IDs and result availability, but never contain the
Bearer header, API key, Base64 image data, or temporary provider result URL.
Provider output URLs expire, so `kling-poll --apply --download` should download
an approved successful result into the artifact directory.

Current protocol references:

- [Kling API overview](https://kling.ai/document-api/guides/get-started/overview)
- [Kling API quick start](https://kling.ai/document-api/guides/get-started/quick-start)
- [Kling Video 3.0 image-to-video](https://kling.ai/document-api/api/video/3-0-omni/image-to-video)

## High-fidelity 3D reconstruction boundary

The printable reconstruction route has separate evidence and execution stages:

1. the approved front master remains the identity authority;
2. AI-derived same-canvas views constrain hidden geometry but are not metric scans;
3. relative depth maps constrain curvature but do not define millimetres;
4. the local visual hull proves scale, silhouette, watertightness and reprojection only;
5. a high-fidelity provider candidate must still pass eight-view identity, depth,
   topology, material and printability gates.

The current 16 GB Mac is not treated as a production Hunyuan3D or Stable Fast 3D
worker. `reconstruction-providers` reports those constraints instead of silently
downloading large models. Meshy Multi-Image is the preferred executable candidate
route on this machine because it accepts cardinal-view references and returns a
textured GLB. Submission is disabled unless both `--apply` and `--cost-approved`
are present.

Meshy credential binding follows the same reference-only rule as Kling:

```bash
security add-generic-password -U \
  -a meshy-api-key \
  -s com.anksen.agent-studio.meshy-api \
  -w
```

Studio status checks report only whether `meshy-api-key-ref` is available.
Provider authorization headers, API keys, Base64 images and expiring result URLs
must never be persisted in plans or audit records.

Current protocol references:

- [Meshy Multi-Image to 3D](https://docs.meshy.ai/en/api/multi-image-to-3d)
- [Stable Fast 3D](https://github.com/Stability-AI/stable-fast-3d)
- [Hunyuan3D 2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2)

`refine-printable` is the repeatable local closure stage after a provider model
has been downloaded. It never calls an external model and never reads a
credential. The command preserves the provider GLB, creates a reversible Blender
source scene, removes micro-islands, reconstructs a continuous printable body,
applies measured broad and regional vertex fairing to the torso and helmet,
BVH-conforms the approved face and `水泥二厂` relief details to their local parent
curvature, exports a watertight base STL and a multicolor assembly STL, renders
color and clay turntables, compares eight normalized silhouettes, and writes
conservative printability and release reports. Wall thickness, self-intersection
and support checks remain explicit slicer/physical-proof gates rather than
fabricated PASS claims.

The package can be resumed and checked without rerunning Meshy:

```bash
pnpm media:printable:status -- \
  --package runtime/artifacts/media/huihui-printable-v3/refined-v15-modeling-domain/printable-asset-package.json
```

`printable-status` verifies the reversible Blender source, GLB/STL outputs,
turntables and QA reports. It advances a package only to
`READY_FOR_VISUAL_AND_PHYSICAL_PROOF` until a slicer review and a 60 mm proof are
provided. The same operation is available to the governed professional runner as
`REFINE_PRINTABLE` under the `character_3d_print_refinement` skill.

Final release evidence uses the machine-readable template at
`examples/printable-release-evidence.example.json`. Visual owner review, slicer
review and the 60 mm physical proof must all be `PASS`; a legacy physical-proof
file alone cannot release the asset:

```bash
pnpm media:printable:status -- \
  --package runtime/artifacts/media/huihui-printable-v3/refined-v15-modeling-domain/printable-asset-package.json \
  --release-evidence /absolute/path/to/printable-release-evidence.json
```

The durable provider bakeoff, DCC closure and print-validation protocol is
documented in
`docs/autonomous-development/MEDIA-005-HIGH-FIDELITY-CHARACTER-3D-PRINT-PIPELINE.md`
and recorded for new-session recovery in
`runtime/global/high-fidelity-character-3d-pipeline.json`.

The orbit calibration contract, authority rules and current rejected candidate
are documented in
`docs/autonomous-development/MEDIA-007-AI-ORBIT-REFERENCE-CALIBRATION.md`.
