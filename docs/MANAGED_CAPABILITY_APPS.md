# Managed Capability Apps

## Purpose

Studio is the control plane for independent professional applications. It does not copy their planner, agents, pipeline, renderer, task queue, or state machine. The first managed application is OpenMontage.

## Ownership boundary

Studio owns application discovery, identity and access, coarse handoff, verified chunk upload, read-only progress projection, authenticated artifact playback, and audit linkage. OpenMontage owns creative planning, project source, stages, checkpoints, media tooling, Remotion/FFmpeg execution, review, and final artifacts.

## Pinned deployment

`runtime/global/managed-capability-app-registry.json` is the release source of truth. Every deployed application must use an HTTPS repository and a full immutable commit SHA. `scripts/deploy-openmontage.sh` checks prerequisites, rejects dirty tracked files, checks out the exact SHA, installs isolated Python and Node dependencies, binds Backlot to `127.0.0.1:4750`, installs a hardened systemd service, and fails the Studio deployment if health checks do not pass.

## End-to-end regression

The included `jinhu-trade-center-film-v1` project is a portable golden regression. It contains the project-owned Remotion composition, copy, timing, visual direction, props, and render contract, but no user media. The production flow is:

1. Sign in to Studio and open `/capability-apps`.
2. Select the eight required, standardized source assets.
3. Studio uploads 512 KiB chunks and verifies file size plus SHA-256 before handing each file to OpenMontage.
4. Start rendering. Studio calls only the application-level `start-render` bridge operation.
5. OpenMontage renders and reviews the project in its own process and project directory.
6. Studio polls the independent project state and serves the declared render through an authenticated, range-capable media endpoint.

The regression proves remote equivalence for the same committed composition and same source bytes. It does not claim that prior footage was newly generated, and it does not reduce future creative work to this contract: a new production gets a new project-local composition authored by the creative agent.

## Acceptance criteria

- Studio and OpenMontage health are both `READY`.
- The deployed OpenMontage Git head equals the pinned registry SHA.
- All eight uploaded assets pass SHA-256 verification.
- The render job reaches `COMPLETE` and its final review is `pass`.
- The declared MP4 is playable through the authenticated Studio media endpoint with HTTP range support.
- Studio contains no duplicate OpenMontage stage runner, renderer, queue, or state machine.
