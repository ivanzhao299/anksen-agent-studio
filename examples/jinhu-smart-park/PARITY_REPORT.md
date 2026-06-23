# Jinhu Smart Park Project Adapter Parity Report

Generated from:

```bash
node packages/orchestrator-core/bin/studio.mjs project parity --config examples/jinhu-smart-park/project.config.example.json --dry-run
```

## Summary

- adapter_status: available
- local_status: available
- parity_result: PASS
- mismatch_list: none
- project_id: jinhu-smart-park
- project_path: /Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park
- local_orchestrator_exists: yes
- runtime_memory_exists: yes

## Adapter Status

- repo_branch: main
- repo_head: 7d394bd chore(orchestrator): plan agent studio extraction
- git_clean: yes
- ahead_behind: 0 / 0
- runtime_memory_generated_at: 2026-06-23T04:50:20.808Z

## Local Status

- doctor_can_run: yes
- doctor_status: GO
- check_status_can_run: yes
- check_dispatch_status_can_run: yes
- queue_available: yes
- queue_tasks: 38
- queue_read_model_only: yes
- queue_status_counts:
  - AUDITED: 34
  - BLOCKED: 4
- active_locks: 0
- result_count: 34
- event_store_available: yes
- event_file_count: 174
- event_types:
  - task.created: 38
  - task.claimed: 17
  - task.completed: 39
  - task.reconciled: 24
  - task.integrated: 18
  - task.audited: 34
  - task.failed: 4

## Mismatches

- none

## Recommended Actions

- Continue using `project inspect` and `project parity` as read-only migration gates.
- Keep writes in `jinhu-smart-park` disabled until extracted adapter apply flows have dedicated approval and parity tests.
- Do not execute Agent tasks, deploy, or production operations from the adapter parity command.
