# MEDIA-001 — Governed HyperFrames Artifact Execution

## Outcome

Studio now has one real local professional media adapter. It reuses the existing Task, Attempt, Lease, Fencing, Worker and Runner capability gates; it does not introduce a second scheduler or execution state machine.

## Closed loop

`Goal → Planner → existing Task Graph → Scheduler → Resident Worker claim → active Lease/Fencing → professional capability preflight → HyperFrames check → single-use render approval → HyperFrames render → FFprobe QA → Artifact Manifest/Audit → existing Kernel releaseLease → Console projection`

## Enforced boundaries

- HyperFrames is pinned to `0.7.65`; Node, FFmpeg and FFprobe versions are probed.
- Projects are restricted to `runtime/workspaces/media/`; artifacts to `runtime/artifacts/media/`.
- External URLs and CSS imports are rejected, telemetry is disabled, and publish is not exposed by the adapter.
- The process is spawned without a shell, commands are fixed, logs are bounded, and timeout/cancellation terminate the process group.
- `check` must pass before a separate render Attempt can use a consumed approval bound to its Task, Attempt and Runner profile.
- Kernel fencing is validated before execution and again before result writeback; stale leases cannot write a result.
- Production Runner activation remains false. The smoke command activates only its own process environment.

## Verification

Run `pnpm media:hyperframes:smoke`. It produces a two-second local MP4, an FFprobe report, hashed manifests, chained audit records and a session report. It performs no publish, push, merge or deploy operation.

The My Work Runner panel exposes only sanitized manifest summaries. It does not expose artifact paths, lease tokens, fencing tokens, credentials, stdout or stderr.
