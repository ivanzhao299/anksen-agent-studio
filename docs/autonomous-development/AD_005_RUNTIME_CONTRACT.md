# AD-005 Runtime Contract

The TypeScript contract in `packages/runtime-adapters/src/index.ts` defines RuntimeRequest, Context, Execution, Result, LogEvent, Artifact, Error, Cancellation, Health and Capabilities. All state uses CREATED, STARTING, RUNNING, CANCELLING, SUCCEEDED, FAILED, TIMED_OUT, CANCELLED or LOST. Errors are normalized into validation, policy, configuration, fencing, spawn, exit, timeout, cancel, output and lost categories.

Every trusted log/result/artifact identity includes taskId, attemptId, leaseId and fencingToken. AD-006 can consume RuntimeResult without provider-specific parsing.
