# AD-005 Cancellation and Timeout

User, Worker, lease revoke, Goal cancellation, timeout and shutdown drain use one cancellation record. The transition is RUNNING -> CANCELLING -> SIGTERM -> grace period -> SIGKILL -> CANCELLED; timeout retains TIMED_OUT. A process already exited is not signalled, and repeated cancel returns the same in-flight cancellation promise.

The caller must revoke the lease/fence before accepting late writes. `collectResult` revalidates fencing, so an old execution cannot publish its result or commit hash after cancellation ownership changes.
