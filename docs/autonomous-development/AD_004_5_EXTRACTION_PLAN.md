# AD-004.5 Autonomous Kernel Extraction Plan

Status: implemented and locally verified on `ad/004-5-autonomous-kernel-extraction`.

The AD-002, AD-003 and AD-004 source implementations were committed to the wrong repository, `jinhu-smart-park` (`5a0e7a5`, `5f0b7a2`, `a06f96f`). This extraction rebuilds their project-independent rules in ANKSEN Agent Studio. Smart Park is an external managed project, never the owner of the kernel.

The sequence was: audit Studio boundaries; inventory source commits; select `orchestrator-core` as the only kernel implementation; translate tenant/park scope to organization/workspace/project; regenerate reversible PostgreSQL DDL; add planning-center and worker-pool adapters; retain runtime as a non-executing port; verify pure rules, SQL protocols and repository regression. No source repository change, deployment, database execution, push, or merge is part of this task.

AD-005 and later autonomous-development work must be implemented only in Agent Studio.
