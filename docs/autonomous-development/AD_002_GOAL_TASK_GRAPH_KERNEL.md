# AD-002 Goal to Task Graph Kernel

Goal creation is idempotent within organization/workspace/project by key and canonical request fingerprint. A conflicting replay is rejected. `submitPlan` validates a real acyclic graph before opening a transaction, locks the Goal, enforces planner-version/fingerprint idempotency, inserts Tasks and same-Goal Dependencies atomically, changes the Goal to PLANNED, and writes its outbox event.

Pure `validateGraph`, `topologicalSort`, `getRootTasks` and `getLeafTasks` rules are independent of persistence. Database constraints are the final guard against duplicate Tasks, dependencies and cross-Goal edges. Planning-center data enters only through the normalization adapter.
