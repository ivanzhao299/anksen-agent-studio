# Real Multi-Agent Parallel Execution Report

- generated_at: 2026-06-24T05:28:12.052Z
- smoke_run_id: parallel-smoke-2026-06-24T052810783Z-b604fc6b
- parallel_requested: 4
- parallel_mode: real
- independent_processes: yes
- independent_workspaces: yes
- independent_run_logs: yes
- time_overlap_detected: yes
- sequential_simulation_detected: no

## Agents

| Agent | Run ID | PID | Workspace | Run Log | Started | Completed | Status |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| agent-1 | parallel-smoke-2026-06-24T052810783Z-b604fc6b-agent-1 | 40705 | autopilot-runs/parallel-smoke/parallel-smoke-2026-06-24T052810783Z-b604fc6b/workspaces/agent-1 | autopilot-runs/parallel-smoke/parallel-smoke-2026-06-24T052810783Z-b604fc6b/workspaces/agent-1/run-log.json | 2026-06-24T05:28:10.813Z | 2026-06-24T05:28:11.665Z | PASS |
| agent-2 | parallel-smoke-2026-06-24T052810783Z-b604fc6b-agent-2 | 40706 | autopilot-runs/parallel-smoke/parallel-smoke-2026-06-24T052810783Z-b604fc6b/workspaces/agent-2 | autopilot-runs/parallel-smoke/parallel-smoke-2026-06-24T052810783Z-b604fc6b/workspaces/agent-2/run-log.json | 2026-06-24T05:28:10.810Z | 2026-06-24T05:28:11.790Z | PASS |
| agent-3 | parallel-smoke-2026-06-24T052810783Z-b604fc6b-agent-3 | 40704 | autopilot-runs/parallel-smoke/parallel-smoke-2026-06-24T052810783Z-b604fc6b/workspaces/agent-3 | autopilot-runs/parallel-smoke/parallel-smoke-2026-06-24T052810783Z-b604fc6b/workspaces/agent-3/run-log.json | 2026-06-24T05:28:10.810Z | 2026-06-24T05:28:11.915Z | PASS |
| agent-4 | parallel-smoke-2026-06-24T052810783Z-b604fc6b-agent-4 | 40707 | autopilot-runs/parallel-smoke/parallel-smoke-2026-06-24T052810783Z-b604fc6b/workspaces/agent-4 | autopilot-runs/parallel-smoke/parallel-smoke-2026-06-24T052810783Z-b604fc6b/workspaces/agent-4/run-log.json | 2026-06-24T05:28:10.810Z | 2026-06-24T05:28:12.040Z | PASS |

## Time Overlap

| Agent A | Agent B |
| --- | --- |
| agent-1 | agent-2 |
| agent-1 | agent-3 |
| agent-1 | agent-4 |
| agent-2 | agent-3 |
| agent-2 | agent-4 |
| agent-3 | agent-4 |

## Safety

- deploy: disabled
- production_operation: disabled
- server_access: disabled
- credential_values: not_read
- model_invocation: disabled
- managed_project_writes: disabled
- jinhu_smart_park_writes: disabled
- write_allowlist: autopilot-runs/parallel-smoke/**, docs/release/**

## Conclusion

The smoke command uses Node child_process workers with independent PIDs, workspaces, and logs. If any of those checks fail, the report marks the run as simulated.
