# AD-005 Process Supervisor

The supervisor uses argument-array spawning with `shell:false`, a dedicated process group, separated stdout/stderr capture, bounded redacted logs and normalized exit/signal data. Timeout and cancellation send SIGTERM, wait a bounded grace period and send SIGKILL when necessary. Duplicate cancellation and cleanup are idempotent; orphan cleanup terminates executions absent from the active lease set.

Records bind PID and process group to executionId, attemptId, leaseId and fencingToken. Logs are flushed in batches; individual lines do not create Outbox events. Runtime state transitions can be projected by the calling repository in a later integration task.
