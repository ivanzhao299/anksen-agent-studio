# Autonomous Development Implementation Task Graph

```text
AD-001 readiness audit
  -> AD-002 Goal/task graph
       -> AD-003 scheduler/dependencies
            -> AD-004 worker daemon protocol
                 -> AD-004.5 correct-repository extraction
                      -> AD-005 authenticated API/activation adapter
                           -> AD-006 real PostgreSQL contention suite
                                -> AD-007 shadow scheduler/claim
                                     -> AD-008 outbox projection/console
                                          -> AD-009 controlled runtime execution
                                               -> AD-010 recovery operations
                                                    -> AD-011 managed-project pilot
                                                         -> AD-012 production readiness
```

Shortest safe path is AD-005 -> AD-006 -> AD-007 -> AD-008 -> AD-009. No later task may bypass authenticated scope, database contention evidence, shadow reconciliation or the no-runtime safety boundary.
