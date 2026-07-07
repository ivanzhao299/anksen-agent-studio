# Studio Worker Platform Self-Test

- generated_at: 2026-07-07T13:29:27.729Z
- mode: apply
- overall_score: 96/100
- overall_status: READY_FOR_INTERNAL_WORKER_PLATFORM
- worker_as_cross_project_executor: YES_GUARDED
- development_execution_capability: YES_LOCAL_AND_PROPOSAL_GATED
- production_execution_capability: GUARDED_PREVIEW_ONLY
- release_promotion_status: PASS
- release_next_stage: completed

## Capability Scores

| Dimension | Score | Status | Summary |
| --- | ---: | --- | --- |
| Cross Project Attach | 100 | PASS | project_count=3, connected=2, planned=1 |
| Worker Control Plane | 100 | PASS | executor=local_worker_registry, true_parallel=node_child_process_verified, assign=ASSIGNED |
| Runtime Chain | 92 | PASS | providers=6, runtimes=6 |
| Dispatch / Proposal / Queue | 90 | PASS | dispatch=1, proposal=2, audit=1, injected=1 |
| Console Operability | 100 | PASS | console_smoke=PASS, action_server=PASS |
| Release Promotion Gates | 92 | PASS | local=PASS, server=PASS, reviewed=PASS, next=completed |
| Governance / Production Guard | 94 | PASS | production_release_readiness=BLOCKED, critical_gate=CRITICAL |
| Development Execution Readiness | 97 | PASS | owner_direct_execute_max_risk=MEDIUM, worker=local-codex-1, connected_projects=2 |
| Production Execution Readiness | 85 | PASS | release=PASS, next=completed, production_status=PASS |

## Check Commands

| Check | Status | Exit | Command |
| --- | --- | ---: | --- |
| Attached Project Workspace | PASS | 0 | node packages/orchestrator-core/bin/studio.mjs project workspace --dry-run |
| Worker Control Plane | PASS | 0 | node packages/orchestrator-core/bin/studio.mjs worker control-plane --dry-run |
| Worker Assign codex-cli | ASSIGNED | 0 | node packages/orchestrator-core/bin/studio.mjs worker assign --runtime codex-cli --dry-run |
| Runtime Health | PASS | 0 | node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run |
| Access Enforcement | PASS | 0 | node packages/orchestrator-core/bin/studio.mjs access enforcement --dry-run |
| Project Dispatch Plan | PASS | 0 | node packages/orchestrator-core/bin/studio.mjs project dispatch-plan --project jinhu-smart-park --text 跨项目 worker readiness self-test --dry-run |
| Console Smoke | PASS | 0 | node packages/orchestrator-core/bin/studio.mjs console smoke --dry-run |
| Console Action Server Smoke | PASS | 0 | node packages/orchestrator-core/bin/studio.mjs console action-server-smoke --dry-run |
| Production Safety Check | PASS | 0 | node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run |
| Release Consistency | PASS | 0 | node packages/orchestrator-core/bin/studio.mjs release consistency --dry-run |

## Release Promotion Stages

| Stage | Status | Recorded At | Gate Reason |
| --- | --- | --- | --- |
| local_preview | PASS | 2026-07-07T13:29:27.405Z | 本地预览所需一致性检查已通过。 |
| server_preview | PASS | 2026-07-07T13:29:27.508Z | 服务器预览已确认当前一致性快照。 |
| reviewed_publish | PASS | 2026-07-07T13:29:27.610Z | reviewed publish 已确认当前一致性快照。 |

## Dispatch / Proposal / Queue Evidence

- dispatch_plan_count: 1
- proposal_count: 2
- queue_injection_audit_count: 1
- ready_inject: 0
- injected: 1
- pending_approval: 0
- proposal_only: 1
- blocked: 0
- verified_approved_queue_audit: yes

## Enhancement Plan

### P0
- 保持当前直执上限，并为高风险动作继续保留 proposal / approval gate。
- 继续对第二、第三个项目做 attach regression，验证跨项目路由稳定。
- 把 reviewed publish 的结果同步进 Console 发布面板和审计摘要。

### P1
- 为 Claude / Gemini / OpenHands 增加 reference-only live probe，让 Runtime Health 不再长期停在 unknown。
- 把 approved proposal 的 queue injection audit trace 提炼成专门 API / ViewModel，减少页面里对原始 JSON 的依赖。
- 把 attached project onboarding 做成向导化流程：intake → bind → workspace → dispatch plan。

### P2
- 增加多项目 worker 回归包，覆盖 attach / dispatch / proposal / queue / release 的端到端快照测试。
- 为生产操作中心补 reviewed publish 之后的人工发布签收界面，但继续保持 CRITICAL gate。
- 补一套 operator scorecard，把套餐、角色、项目范围、直执上限做成产品化矩阵。

## Safety Boundary

- deploy: disabled
- production_operations: disabled
- server_access: local/read-only evidence only
- credential_values: not_read
- managed_project_writes: proposal / queue injection only

本次自测覆盖的是平台级接入、调度、治理、发布闸门与 Console 闭环，不包含真实服务器部署与生产操作。

