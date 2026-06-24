# Autopilot Batch Efficiency Report

- batch_id: batch-plan-f761fb471d
- goal: 继续推进 Pilot
- execution_strategy: true_parallel_executor_parallel_4
- parallel_requested: 4
- actual_parallelism: 4
- true_parallel: yes
- parallel_mode: real_child_process
- validation_status: PASS

## Task Counts

- planned_task_count: 5
- executable_task_count: 5
- proposal_only_task_count: 0
- split_parent_count: 1
- split_child_count: 1

## Parallel Batches

- batch-1: pilot-batch-agent-1-runtime-chain-evidence, pilot-batch-agent-2-worker-pool-evidence, pilot-batch-agent-3-credential-policy-evidence, pilot-batch-agent-4-console-action-evidence
- batch-2: pilot-batch-agent-5-remote-worker-readiness-readonly

## Path Overlap

- none

## High Risk Decomposition

- agent-5: SPLIT_TO_SAFE_SUBTASKS; children=pilot-batch-agent-5-remote-worker-readiness-readonly

## Real Child Process Evidence

- parallel_mode: real_child_process
- independent_workspaces: yes
- independent_run_logs: yes
- independent_processes: yes
- time_overlap_detected: yes
- sequential_simulation_detected: no
- run_root: autopilot-runs/parallel-batch/batch-plan-f761fb471d

### Agent PIDs

| Agent | PID |
| --- | --- |
| agent-1 | 58173 |
| agent-2 | 58175 |
| agent-3 | 58174 |
| agent-4 | 58176 |
| agent-5 | 58264 |

### Workspaces

| Agent | Workspace |
| --- | --- |
| agent-1 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-1/pilot-batch-agent-1-runtime-chain-evidence |
| agent-2 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-2/pilot-batch-agent-2-worker-pool-evidence |
| agent-3 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-3/pilot-batch-agent-3-credential-policy-evidence |
| agent-4 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-4/pilot-batch-agent-4-console-action-evidence |
| agent-5 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-5/pilot-batch-agent-5-remote-worker-readiness-readonly |

### Run Logs

| Agent | Run Log |
| --- | --- |
| agent-1 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-1/pilot-batch-agent-1-runtime-chain-evidence/run-log.json |
| agent-2 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-2/pilot-batch-agent-2-worker-pool-evidence/run-log.json |
| agent-3 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-3/pilot-batch-agent-3-credential-policy-evidence/run-log.json |
| agent-4 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-4/pilot-batch-agent-4-console-action-evidence/run-log.json |
| agent-5 | autopilot-runs/parallel-batch/batch-plan-f761fb471d/workspaces/agent-5/pilot-batch-agent-5-remote-worker-readiness-readonly/run-log.json |

### Time Overlap Matrix

| Agent | agent-1 | agent-2 | agent-3 | agent-4 | agent-5 |
| --- | --- | --- | --- | --- | --- |
| agent-1 | self | yes | yes | yes | no |
| agent-2 | yes | self | yes | yes | no |
| agent-3 | yes | yes | self | yes | no |
| agent-4 | yes | yes | yes | self | no |
| agent-5 | no | no | no | no | self |


## Safety

- deploy: disabled
- production_operations: disabled
- credential_values: disabled
- managed_project_writes: disabled
- local_child_process_worker: enabled
- remote_worker_execution: disabled
- external_model_call: disabled
