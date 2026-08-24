#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const store = resolve(root, 'runtime/autonomous-development');
const apply = process.argv.includes('--apply-safe');
const archiveDirty = process.argv.includes('--archive-dirty');
const archiveDate = new Date().toISOString().slice(0, 10);
const onlyProject = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;
const protectedStatuses = new Set([
  'PENDING_APPROVAL', 'QUEUED', 'RUNNING', 'RECOVERY_REQUIRED',
  'AWAITING_DIFF_APPROVAL', 'PAUSED',
]);

function git(repo, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${repo}: git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function jobsById() {
  const { readdir } = await import('node:fs/promises');
  const dir = resolve(store, 'jobs');
  const rows = new Map();
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.json')) continue;
    const job = await json(resolve(dir, name));
    rows.set(job.id, job);
  }
  return rows;
}

function classify(repo, taskId, workspace, job) {
  const path = resolve(workspace.worktreePath || '');
  if (workspace.status !== 'ACTIVE') return { action: 'IGNORE_RELEASED', reason: workspace.status };
  if (!existsSync(path)) return { action: 'RECONCILE_MISSING', reason: 'worktree path is missing' };
  if (protectedStatuses.has(job?.status)) return { action: 'KEEP_ACTIVE', reason: job.status };
  const status = git(path, ['status', '--porcelain=v1', '--untracked-files=all']).stdout;
  if (status) return { action: 'QUARANTINE_DIRTY', reason: `${status.split('\n').length} changed path(s)` };
  const branch = git(path, ['branch', '--show-current']).stdout;
  if (!branch || branch !== workspace.branch) return { action: 'QUARANTINE_BRANCH', reason: `expected ${workspace.branch}, found ${branch || 'detached'}` };
  const merged = git(repo, ['merge-base', '--is-ancestor', branch, 'origin/main'], { allowFailure: true }).ok;
  if (!merged) return { action: 'KEEP_UNMERGED', reason: 'branch has commits not in origin/main' };
  return { action: 'RELEASE_SAFE', reason: 'clean and merged into origin/main', branch, path, taskId };
}

async function main() {
  const manifest = await json(resolve(root, 'runtime/global/project-independence.json'));
  const jobs = await jobsById();
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), apply, archiveDirty, projects: [] };
  for (const project of manifest.projects) {
    if (onlyProject && project.projectId !== onlyProject) continue;
    const repo = resolve(project.repoPath);
    const ownershipPath = resolve(store, 'workspace-ownership', `${project.projectId}.json`);
    if (!existsSync(ownershipPath) || !existsSync(repo)) continue;
    git(repo, ['fetch', '--prune', '--no-tags', 'origin', 'main']);
    const ownership = await json(ownershipPath);
    const rows = [];
    for (const [taskId, workspace] of Object.entries(ownership.workspaces || {})) {
      const result = classify(repo, taskId, workspace, jobs.get(taskId));
      rows.push({ taskId, status: workspace.status, jobStatus: jobs.get(taskId)?.status || null, path: workspace.worktreePath, branch: workspace.branch, ...result });
      if (archiveDirty && result.action === 'QUARANTINE_DIRTY') {
        const archiveTag = `archive/worktrees/${archiveDate}/${project.projectId}/${taskId}`;
        const tagExists = git(repo, ['show-ref', '--verify', '--quiet', `refs/tags/${archiveTag}`], { allowFailure: true }).ok;
        if (!tagExists) {
          git(workspace.worktreePath, ['stash', 'push', '--include-untracked', '--message', archiveTag]);
          const stash = git(repo, ['rev-parse', '--verify', 'refs/stash']).stdout;
          git(repo, ['tag', archiveTag, stash]);
          git(repo, ['stash', 'drop', 'stash@{0}']);
        }
        git(repo, ['cat-file', '-e', `${archiveTag}^{commit}`]);
        git(repo, ['worktree', 'remove', '--force', workspace.worktreePath]);
        const merged = git(repo, ['merge-base', '--is-ancestor', workspace.branch, 'origin/main'], { allowFailure: true }).ok;
        if (merged) git(repo, ['branch', '-d', workspace.branch]);
        workspace.status = 'ARCHIVED';
        workspace.archivedAt = new Date().toISOString();
        workspace.archiveTag = archiveTag;
        workspace.archiveReason = 'STALE_DIRTY_WORKTREE_PRESERVED_LOCALLY';
        for (const [claimPath, claim] of Object.entries(ownership.claims || {})) {
          if (claim.taskId === taskId || claim.workspacePath === workspace.worktreePath) delete ownership.claims[claimPath];
        }
        result.action = 'ARCHIVED_DIRTY';
        result.archiveTag = archiveTag;
      }
      if (archiveDirty && result.action === 'KEEP_UNMERGED') {
        const archiveTag = `archive/branches/${archiveDate}/${project.projectId}/${taskId}`;
        if (!git(repo, ['show-ref', '--verify', '--quiet', `refs/tags/${archiveTag}`], { allowFailure: true }).ok) {
          git(repo, ['tag', archiveTag, workspace.branch]);
        }
        git(repo, ['cat-file', '-e', `${archiveTag}^{commit}`]);
        git(repo, ['worktree', 'remove', workspace.worktreePath]);
        git(repo, ['branch', '-D', workspace.branch]);
        workspace.status = 'ARCHIVED';
        workspace.archivedAt = new Date().toISOString();
        workspace.archiveTag = archiveTag;
        workspace.archiveReason = 'STALE_UNMERGED_BRANCH_PRESERVED_LOCALLY';
        for (const [claimPath, claim] of Object.entries(ownership.claims || {})) {
          if (claim.taskId === taskId || claim.workspacePath === workspace.worktreePath) delete ownership.claims[claimPath];
        }
        result.action = 'ARCHIVED_UNMERGED';
        result.archiveTag = archiveTag;
      }
      if (archiveDirty && result.action === 'RECONCILE_MISSING') {
        const archiveTag = `archive/worktrees/${archiveDate}/${project.projectId}/${taskId}`;
        if (git(repo, ['show-ref', '--verify', '--quiet', `refs/tags/${archiveTag}`], { allowFailure: true }).ok) {
          workspace.status = 'ARCHIVED';
          workspace.archivedAt ||= new Date().toISOString();
          workspace.archiveTag = archiveTag;
          workspace.archiveReason = 'STALE_DIRTY_WORKTREE_PRESERVED_LOCALLY';
          for (const [claimPath, claim] of Object.entries(ownership.claims || {})) {
            if (claim.taskId === taskId || claim.workspacePath === workspace.worktreePath) delete ownership.claims[claimPath];
          }
          result.action = 'ARCHIVED_MISSING_RECONCILED';
        } else {
          const branchExists = git(repo, ['show-ref', '--verify', '--quiet', `refs/heads/${workspace.branch}`], { allowFailure: true }).ok;
          const merged = branchExists
            ? git(repo, ['merge-base', '--is-ancestor', workspace.branch, 'origin/main'], { allowFailure: true }).ok
            : true;
          if (merged) {
            if (branchExists) git(repo, ['branch', '-d', workspace.branch]);
            workspace.status = 'RELEASED';
            workspace.releasedAt = new Date().toISOString();
            workspace.releaseReason = branchExists
              ? 'MISSING_WORKTREE_BRANCH_MERGED_INTO_ORIGIN_MAIN'
              : 'MISSING_WORKTREE_AND_BRANCH';
            for (const [claimPath, claim] of Object.entries(ownership.claims || {})) {
              if (claim.taskId === taskId || claim.workspacePath === workspace.worktreePath) delete ownership.claims[claimPath];
            }
            result.action = 'RELEASED_MISSING_RECONCILED';
          } else {
            result.action = 'KEEP_MISSING_UNMERGED';
            result.reason = 'worktree is missing but branch has commits not in origin/main';
          }
        }
      }
      if (!apply || result.action !== 'RELEASE_SAFE') continue;
      git(repo, ['worktree', 'remove', result.path]);
      git(repo, ['branch', '-d', result.branch]);
      workspace.status = 'RELEASED';
      workspace.releasedAt = new Date().toISOString();
      workspace.releaseReason = 'CLEAN_AND_MERGED_INTO_ORIGIN_MAIN';
      for (const [claimPath, claim] of Object.entries(ownership.claims || {})) {
        if (claim.taskId === taskId || claim.workspacePath === result.path) delete ownership.claims[claimPath];
      }
    }
    if (apply || archiveDirty) await writeFile(ownershipPath, `${JSON.stringify(ownership, null, 2)}\n`, 'utf8');
    report.projects.push({ projectId: project.projectId, repo, counts: Object.fromEntries([...new Set(rows.map(row => row.action))].sort().map(action => [action, rows.filter(row => row.action === action).length])), rows });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
