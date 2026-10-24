# Branch Lifecycle Governor

## Requirement

Studio creates isolated task branches and worktrees, but a completed task must not leave an
unbounded remote-branch tail. Branch cleanup is therefore a project-connector capability, not a
second Planner, Worker, queue, or task state machine.

The governor must:

- fetch and pin the configured remote default branch before classifying anything;
- preserve the default branch, configured protected branches, open-PR branches, and every branch
  currently checked out by a worktree;
- classify old branches that are ancestors of the default branch as deletion candidates;
- distinguish recent unmerged work from expired unmerged work requiring review;
- report content-equivalent squash/rebase candidates without deleting them automatically;
- make audit the default and require an exact plan fingerprint to apply a deletion;
- expire an audit plan after 15 minutes so PR/worktree evidence cannot be reused indefinitely;
- re-fetch and verify the default head and every candidate tip before the first remote write;
- stop the whole operation on drift and use one atomic remote push instead of partially applying a
  stale plan.

The task workspace lifecycle must also:

- keep an isolated worktree after commit until the target branch contains the result;
- re-fetch and rebase a clean paused task onto the current remote default branch when it resumes;
- refuse resume when the task worktree is dirty or when remote history was rewritten;
- accept post-merge ancestry or exact per-path blob equivalence as merge evidence;
- remove the worktree and local task branch only after that evidence passes;
- delete a remote task branch only when explicitly requested and its observed tip still matches;
- assign every workspace an expiry time and report expired, dirty, and missing workspaces for
  deterministic governance instead of silently deleting them.

## Data model

An audit plan contains the project and repository identity, remote URL hash, default branch and
head, policy, protected/open/worktree branch sets, every classified branch with its observed tip,
and a SHA-256 plan fingerprint. It contains no credentials or remote URL values.

## Execution and migration

`branch-lifecycle:audit` is read-only except for `git fetch --prune`. `branch-lifecycle:apply`
requires a saved plan and `--confirm-fingerprint`; it accepts only branches classified as
`DELETE_CANDIDATE_MERGED_EXPIRED`. Existing worktree reconciliation remains unchanged.

`AutonomousDevelopmentJobs.approve()` realigns a paused isolated task before re-queueing it.
`approveCommit()` records `AWAITING_MERGE`; it does not release the workspace. The release or PR
integration layer calls `finalizeMergedWorkspace()` after the merge, which verifies evidence,
recycles the worktree, and records `WORKSPACE_POST_MERGE_RECYCLED` in the job event stream.

Adoption order:

1. Run audit and review the JSON plan.
2. Back up all refs outside this command.
3. Apply one remote in a bounded maintenance window.
4. Re-audit and verify CI/project lifecycle health.
5. Repeat for a second remote only under separate release approval.

## Acceptance criteria

- Audit performs no branch deletion.
- Protected, open-PR, worktree, recent, and unmerged branches cannot enter the automatic deletion
  set.
- A changed default head, changed candidate tip, or changed worktree occupancy blocks apply.
- A valid unchanged plan deletes only its explicit candidate set.
- Paused clean workspaces realign to the latest remote default head; dirty or rewritten histories
  fail closed.
- A committed workspace remains available until ancestry or content-equivalence evidence passes.
- Unit tests cover safe classification, resume alignment, post-merge recycling, expiration
  reporting, and all fail-closed checks.

