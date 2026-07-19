# Autonomous State Machines

Goal: `DRAFT -> PLANNED -> RUNNING -> SUCCEEDED | FAILED | CANCELLED`; aggregation remains RUNNING while terminal outcomes are unresolved.

Task: `PENDING <-> BLOCKED -> READY -> QUEUED -> CLAIMED -> RUNNING -> SUCCEEDED | FAILED | CANCELLED`. Scheduler transitions use CAS; terminal Tasks are immutable without an explicit recovery command.

Attempt: `CLAIMED -> RUNNING -> SUCCEEDED | FAILED | LOST | CANCELLED`.

Lease: `ACTIVE -> RELEASED | EXPIRED | REVOKED`. Only one ACTIVE lease exists per Task. A later fencing token invalidates all earlier ownership even if a stale process resumes.

Worker: `IDLE -> CLAIMED -> IDLE`; `DRAINING` rejects new claims and remains until active claims reach zero; `OFFLINE` and `ERROR` are non-claimable. Session: `ACTIVE -> CLOSED | EXPIRED`.
