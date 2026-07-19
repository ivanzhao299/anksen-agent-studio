# Software Engineering Domain Automation

ANKSEN Studio's first professional-domain pack turns a bounded software objective into the existing standard Task Graph. It does not introduce another Planner, Scheduler, Worker, state store, or Runtime.

## Contract and flow

The versioned contract records the objective, project-root reference, allowed and blocked paths, constraints, acceptance criteria, validation commands, expected artifacts, risk, and attempt limit. `SoftwareEngineeringPlanner` validates that contract, calls the existing rule Planner, enriches its standard three-task software-delivery graph, and submits it through the existing Autonomous Kernel port.

```text
Software Engineering Contract
  -> existing RulePlannerEngine
  -> standard ANALYZE / IMPLEMENT / VALIDATE Task Graph
  -> existing Kernel / Scheduler / Claim / Lease / Fencing
  -> CONTROLLED_STUB by default
  -> domain acceptance report
```

The acceptance gate returns `PASS`, `FAIL`, or `BLOCKED`. Missing validation or artifact evidence fails. A changed path outside the contract, an extra Attempt, or an unapproved side effect blocks the result.

## Isolated verification

Run:

```sh
pnpm software-domain:smoke
```

The smoke uses the versioned contract and execution-evidence fixtures. It passes the compiled graph through the existing in-memory Kernel Scheduler, Worker claim, Lease, Fencing, Attempt, and Goal aggregation protocols. Runtime remains `CONTROLLED_STUB`; no repository is modified and no external service is contacted.

## Product boundary

- Existing `code_development` skill routing is reused.
- Real CODEX still requires the separate Activation Gate, scoped policy, credential reference, online authorized Worker, and single-use Approval.
- Push, merge, deploy, production credentials, and production database access remain outside this domain pack.
- The next pilot should use a separate minimal Git fixture and one allowed file before applying the contract to a managed project.
