# AD-004 Resident Worker Daemon

The kernel supports idempotent worker registration, one renewed active session, heartbeat, max-concurrency checks, drain state, atomic claim, Attempt plus ACTIVE Lease creation, random lease secrets, monotonically allocated fencing tokens, CAS task claims and expiry reaping. Fenced mutations require lease identity, secret, fence, worker, session, version and non-expiry.

Recovery is conservative: safe retry is separated from manual review for side effects. `NoRuntimeAdapter` is the controlled daemon stub and always returns `NOT_EXECUTED`; this extraction installs no resident process and starts no real runtime. A production daemon, lease renewal/release API façade and contention verification remain activation work.
