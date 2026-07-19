# Autonomous Development Implementation Task Graph

```text
AD-001 readiness audit
  -> AD-002 Goal/task graph
       -> AD-003 scheduler/dependencies
            -> AD-004 worker daemon protocol
                 -> AD-004.5 correct-repository extraction
                      -> AD-005 hardened runtime adapter protocol
                           -> AD-006 real PostgreSQL contention suite
                                -> AD-007 shadow scheduler/claim
                                     -> AD-008 outbox projection/console
                                          -> AD-009 controlled runtime execution
                                               -> AD-010 recovery operations
                                                    -> AD-011 managed-project pilot
                                                         -> AD-012 production readiness
```

AD-005 is implemented as a disabled-by-default internal execution boundary. Shortest safe path is AD-006 validation pipeline -> AD-007 authenticated/shadow activation -> AD-008 outbox projection -> AD-009 controlled runtime execution. No task may bypass fencing, database contention evidence or shadow reconciliation.

Studio Planner MVP is now the deterministic Goal-to-Task-Graph entry point before Kernel scheduling. Its rule/template output replaces manually authored long prompts; future LLM planning may be added only behind the same standard graph contract and validation boundary.
