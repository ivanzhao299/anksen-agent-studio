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

## Governed execution closure

The registry now reports two independent states:

- `installation_readiness`: Skill manifests, minimum tool versions and Credential Reference identifiers are healthy on this node.
- `execution_readiness`: installation is healthy and the exact profile has been explicitly activated for this node.

All media profiles default to not activated. Production deployment therefore reports installed tools honestly but cannot execute them until an operator separately enables the profile-specific environment variable. No activation flag is committed by this change.

Before an adapter can run, `preflight` verifies the profile and capability version, task/attempt/fencing presence, Skill match, exact command allowlist, artifact-root containment, required credential references and HIGH-risk approval. The execution service fails closed when an adapter is absent. Successful adapters write only under the declared artifact root and produce a SHA-256 artifact manifest plus a hash-chained audit record; fencing values and credential values are never copied into either output.

Operator interfaces:

- `pnpm runner-capabilities:check` — installation and activation inventory.
- `pnpm runner-capabilities:check -- --require-ready video_generation` — installation gate only.
- `pnpm runner-capabilities:check -- --require-executable video_generation` — activated execution gate.
- `POST /api/business/runner-capabilities/preflight` — authenticated manager preflight.

`INSTALLED` or an installation `READY` is not a production execution claim. Real media execution additionally requires a registered runtime adapter, a valid Kernel Task/Attempt/Lease fencing context, node activation and any task-specific approval.

## Adapter implementation truth

| Profile | Registration | Adapter implementation | Production activation |
| --- | --- | --- | --- |
| HyperFrames | Skill, route, Agent, Worker and Runtime profile registered | `CONTRACT_ONLY`; authoring requires a confirmed `BRIEF.md` and workflow-specific project state | OFF |
| Remotion | Skill, route, Agent, Worker and Runtime profile registered | `CONTRACT_ONLY`; rendering requires a project-local Remotion composition and render contract | OFF |
| video-use | Skill, route, Agent, Worker and Runtime profile registered | `CONTRACT_ONLY`; editing requires strategy confirmation, authorized footage and transcription Credential Reference | OFF |
| Manim | Skill, route, Agent, Worker and Runtime profile registered | `CONTRACT_ONLY`; execution requires `plan.md`, scene source and project-local render inputs | OFF |
| FFmpeg / FFprobe QA | Skill route, QA Agent, Worker and Runtime profile registered | Implemented read-only adapter; accepts only real paths below `runtime/artifacts/media`, runs fixed `ffprobe` arguments and emits sanitized QA JSON | OFF |

This distinction follows each installed Skill's own workflow contract. Studio does not invoke a creative tool from an underspecified Task merely because its CLI exists. The read-only FFprobe adapter is the first real professional adapter and proves the Gate → Adapter → Artifact Manifest → Audit chain without rendering, publishing or production side effects.
