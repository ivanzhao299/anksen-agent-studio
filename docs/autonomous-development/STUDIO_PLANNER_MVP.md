# Studio Planner MVP

## Outcome

Planning Center now turns a Goal into a deterministic standard Task Graph using a local Rule Engine and three templates: `SOFTWARE_DELIVERY`, `DOCUMENTATION`, and `GENERIC`. It does not call an LLM and does not construct a long prompt.

## Internal API

```js
const planner = new PlannerService({ kernel });
const graph = planner.planGoal(goal, { now });
const { graph, submission } = await planner.planAndSubmit(goal, { now });
```

`goal` requires `id` and `title`; `description` and `metadata.riskLevel` are optional. The injected Kernel port must implement `submitPlan(goalId, input)`. No new external HTTP API is exposed, so existing Gateway behavior is unchanged.

## Data flow

```text
Goal -> RulePlannerEngine -> StandardTaskGraph JSON
     -> PlannerService.planAndSubmit -> Autonomous Kernel submitPlan
     -> ad_task / ad_task_dependency -> Scheduler Tick
```

The JSON contract is `packages/planning-center/schemas/task-graph.schema.json`; a concrete payload is in `examples/task-graph.example.json`. Tasks use `taskKey`, priority, risk, required capabilities, attempts and metadata. Dependencies use `taskKey`, `dependsOnTaskKey`, type and required status.

Planner versions are deterministic SHA-256-derived identifiers over the Goal, selected template, tasks and dependencies. Replanning the same Goal produces the same Kernel idempotency identity even when `generatedAt` changes.

## Safety and limits

The MVP only plans and persists. It does not claim tasks, start a Runtime, modify production configuration or approve critical-risk work. A CRITICAL Goal emits `approvalStatus: REQUIRED`, which keeps the Scheduler guard active.
