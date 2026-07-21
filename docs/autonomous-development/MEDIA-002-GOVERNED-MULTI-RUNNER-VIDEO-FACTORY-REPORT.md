# MEDIA-002 — Governed Multi-Runner Video Factory Report

## Conclusion

MEDIA-002 establishes a real local multi-Runner video production path using the existing Planner, Autonomous Kernel contract, Scheduler, Resident Worker claim model, professional execution Gate and Artifact/Audit projection. It does not add a second Planner, queue, Worker or state machine.

## Planner Task Graph

The existing rule-based Planner now owns a `VIDEO_FACTORY` template:

1. `planning` — define the governed creative strategy.
2. `programmatic_video` — route to the version-pinned Remotion Runner.
3. `technical_animation` — route to the Manim Runner.
4. `video_editing` — route to the local video-use editing Runner.
5. `media_validation` — route every final artifact to FFprobe QA.

The five tasks form one standard acyclic Task Graph with four `SUCCESS_REQUIRED` dependencies and are submitted through the existing Kernel port without translation.

## Runner governance

| Profile | Real local status | Production activation | Boundary |
| --- | --- | --- | --- |
| Remotion 4.0.495 | Rendered and QA verified | OFF | isolated React source, no external URL/fetch, consumed render approval |
| Manim CE 0.20.1 | Rendered and QA verified | OFF | isolated plan/script, unsafe process/network imports blocked, consumed render approval |
| video-use offline editor | Rendered and QA verified | OFF | confirmed strategy, isolated input, non-speech fixture, 30ms audio fades |
| video-use transcription | Not ready | OFF | separate credential-scoped Profile; missing Credential Reference remains blocking |
| FFprobe QA | Verified three outputs | OFF | read-only sanitized media metadata |

## Functional smoke evidence

Command: `pnpm media:multi-runner:smoke`

- Planner: `VIDEO_FACTORY`, 5 tasks, 4 dependencies.
- Remotion MP4: 111,700 bytes; SHA-256 `37df4268d3b2c36edd333f5c2c1ab68d2fd742ada97936d8affd9c2d0c3a7eb7`.
- Manim MP4: 20,740 bytes; SHA-256 `2b2f9963adb45b1569906a28af3bccacd0e3a3661c97387131f34e36fb024a25`.
- video-use edited MP4: 12,230 bytes; SHA-256 `26e47a20636f3c01dcb39545d916b692ae82849b2fbf453e1dd54e82ed76793b`.
- FFprobe QA: all three artifacts `SUCCEEDED`.
- Existing Kernel bridge: 6 claims and 6 terminal writebacks; every pre-write and post-execution Fencing validation passed.
- Every execution produced a hashed Artifact Manifest and chained audit records.

## Safety findings

- No channel registration, publishing, upload, push, merge or deployment command is exposed to a media Adapter.
- Production Runner activation flags remain false.
- Smoke activation exists only inside the test process environment.
- No transcription provider was called and no credential value was used or persisted.
- Runtime workspaces and binary artifacts are test-only and are removed before commit.
- Console visibility continues to use the existing sanitized professional Artifact projection and does not expose paths, logs, approvals, Lease tokens, Fencing tokens or credentials.

## Remaining production gates

Before enabling any production media Runner, provision a dedicated Worker host, OS-level network isolation, durable single-use approval persistence, capacity/queue limits, artifact retention policy and monitoring. Transcription additionally requires an approved Credential Reference. Publishing remains a separate future platform with human approval and is not part of MEDIA-002.
