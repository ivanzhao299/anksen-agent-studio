# Professional Runner Capability Closure

## Outcome

Studio now separates a Skill definition, an Agent responsibility, a Runtime adapter and a concrete Runner node. A professional Runner is selectable only when its registered Skill manifests, local tool dependencies and credential reference identifiers pass the live node probe. Static JSON registration is not treated as proof of executable capacity.

## Registered media capability chain

| Responsibility | Agent | Runtime profile | Runner | Current local readiness |
| --- | --- | --- | --- | --- |
| Generated video and motion | `agent-media-generator` | `media-generative-hyperframes` | `local-media-hyperframes-1` | READY |
| Programmatic video fallback | `agent-media-generator` | `media-programmatic-remotion` | `local-media-remotion-1` | READY |
| Authorized footage editing | `agent-media-editor` | `media-footage-video-use` | `local-media-editor-1` | NOT_READY until `media-transcription-provider-ref` is configured |
| Technical animation | `agent-media-generator` | `media-technical-manim` | registered capability profile | READY locally; no dedicated Worker node yet |
| Media quality control | `agent-media-qa` | `media-quality-control` | `local-media-qa-1` | READY |

OpenMontage is not registered as an embedded Runner. It is an AGPL-3.0 complete production system with its own orchestration model, so embedding it would create both licensing and duplicate-kernel risk. It remains an isolated integration candidate.

## Enforcement

- Skills are discovered from a node-local Skill root and represented only by `skill://` references.
- Tool versions are collected using bounded, non-network version probes.
- Credential values are never inspected. Only approved reference identifiers are supplied to the registry.
- Generated outputs are limited to `runtime/artifacts/media`; publishing, deployment, SSH and infrastructure commands remain blocked.
- Exact capability evidence and its SHA-256 hash are copied into the immutable business capability protocol before a task graph can be approved.
- Production nodes without installed Skills or tools report `NOT_READY`; local installation does not make production ready.

## Operator interfaces

- `pnpm runner-capabilities:check`
- `pnpm runner-capabilities:check -- --require-ready video_generation`
- `GET /api/business/runner-capabilities` for authorized workspace managers
- My Work → Professional Runner Capabilities

## Next long task

`MEDIA-001 Governed Media Artifact Execution` should add the actual isolated media job workspace, a versioned Media Brief and Artifact manifest, HyperFrames/Remotion execution adapters, FFprobe QA, Attempt artifact references, cancellation/timeouts, approval before any footage or provider use, and a smoke video that never publishes. Until that task is accepted, `READY` means the node has the declared tools and Skills; it does not claim that Studio has already rendered or published a production video.
