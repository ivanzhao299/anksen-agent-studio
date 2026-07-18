const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "BLOCKED"]);
const STRONG = new Set(["FINISH_TO_START", "SUCCESS_REQUIRED", "ARTIFACT_REQUIRED"]);

export function validateGraph(graph) {
  const errors = [];
  if (!graph.tasks.length) errors.push({ code: "EMPTY_GRAPH" });
  const keys = new Set();
  for (const task of graph.tasks) { if (keys.has(task.key)) errors.push({ code: "DUPLICATE_TASK_KEY", taskKey: task.key }); keys.add(task.key); }
  const edges = new Set();
  for (const dependency of graph.dependencies) {
    if (!keys.has(dependency.taskKey) || !keys.has(dependency.dependsOnTaskKey)) errors.push({ code: "MISSING_DEPENDENCY_TASK" });
    if (dependency.taskKey === dependency.dependsOnTaskKey) errors.push({ code: "SELF_DEPENDENCY" });
    const edge = `${dependency.taskKey}:${dependency.dependsOnTaskKey}:${dependency.dependencyType}`;
    if (edges.has(edge)) errors.push({ code: "DUPLICATE_DEPENDENCY" }); edges.add(edge);
  }
  if (!errors.length) { try { topologicalSort(graph); } catch { errors.push({ code: "CYCLE_DETECTED" }); } }
  return { valid: errors.length === 0, errors };
}

export function topologicalSort(graph) {
  const degree = new Map(graph.tasks.map((task) => [task.key, 0]));
  const children = new Map(graph.tasks.map((task) => [task.key, []]));
  for (const edge of graph.dependencies) { degree.set(edge.taskKey, (degree.get(edge.taskKey) ?? 0) + 1); children.get(edge.dependsOnTaskKey)?.push(edge.taskKey); }
  const queue = [...degree].filter(([, value]) => value === 0).map(([key]) => key).sort(); const output = [];
  while (queue.length) { const key = queue.shift(); output.push(graph.tasks.find((task) => task.key === key)); for (const child of children.get(key) ?? []) { degree.set(child, degree.get(child) - 1); if (degree.get(child) === 0) queue.push(child); } queue.sort(); }
  if (output.length !== graph.tasks.length) throw new Error("CYCLE_DETECTED"); return output;
}
export const getRootTasks = (graph) => graph.tasks.filter((task) => !graph.dependencies.some((edge) => edge.taskKey === task.key));
export const getLeafTasks = (graph) => graph.tasks.filter((task) => !graph.dependencies.some((edge) => edge.dependsOnTaskKey === task.key));

export function resolveDependency(edge, upstream, attempts = []) {
  const base = { dependencyId: edge.id, upstreamTaskId: edge.dependsOnTaskId, dependencyType: edge.dependencyType, currentUpstreamStatus: upstream?.status ?? null };
  if (!upstream) return { ...base, status: edge.dependencyType === "OPTIONAL" ? "SATISFIED" : "INVALID", reasonCode: "UPSTREAM_MISSING" };
  if (edge.dependencyType === "OPTIONAL") return { ...base, status: "SATISFIED", reasonCode: "OPTIONAL_NON_BLOCKING" };
  if (edge.dependencyType === "FINISH_TO_START") return upstream.status === "SUCCEEDED" ? { ...base, status: "SATISFIED", reasonCode: "UPSTREAM_FINISHED" } : TERMINAL.has(upstream.status) ? { ...base, status: "BLOCKED", reasonCode: "UPSTREAM_UNSUCCESSFUL" } : { ...base, status: "WAITING", reasonCode: "UPSTREAM_ACTIVE" };
  if (upstream.status !== "SUCCEEDED") return TERMINAL.has(upstream.status) ? { ...base, status: "BLOCKED", reasonCode: "UPSTREAM_UNSUCCESSFUL" } : { ...base, status: "WAITING", reasonCode: "UPSTREAM_ACTIVE" };
  if (edge.dependencyType === "ARTIFACT_REQUIRED" && !upstream.output?.artifactRef && !attempts.some((attempt) => attempt.taskId === upstream.id && attempt.artifactRefs?.length)) return { ...base, status: "BLOCKED", reasonCode: "ARTIFACT_MISSING" };
  return { ...base, status: "SATISFIED", reasonCode: "UPSTREAM_SUCCEEDED" };
}

export function evaluateReadiness({ task, goalStatus, resolutions, attemptCount = 0, activeLease = false }) {
  if (!["PENDING", "BLOCKED"].includes(task.status)) return { ready: false, nextStatus: null, blockingReasons: ["TASK_STATE"] };
  const reasons = [];
  if (!["PLANNED", "RUNNING", "BLOCKED"].includes(goalStatus)) reasons.push(`GOAL_${goalStatus}`);
  if (resolutions.some((item) => item.status === "WAITING")) reasons.push("DEPENDENCY_WAITING");
  if (resolutions.some((item) => ["BLOCKED", "INVALID"].includes(item.status))) reasons.push("DEPENDENCY_BLOCKED");
  if (attemptCount >= task.maxAttempts) reasons.push("ATTEMPT_LIMIT"); if (activeLease) reasons.push("ACTIVE_LEASE");
  if (task.riskLevel === "CRITICAL" && task.metadata?.approvalStatus !== "APPROVED") reasons.push("APPROVAL_REQUIRED");
  return { ready: !reasons.length, nextStatus: !reasons.length ? "READY" : reasons.some((value) => !["DEPENDENCY_WAITING"].includes(value)) ? "BLOCKED" : null, blockingReasons: reasons };
}
export const sortQueue = (tasks) => [...tasks].sort((a, b) => ({ P0: 0, P1: 1, P2: 2, P3: 3 }[a.priority] - { P0: 0, P1: 1, P2: 2, P3: 3 }[b.priority]) || new Date(a.readyAt ?? 8640000000000000) - new Date(b.readyAt ?? 8640000000000000) || a.key.localeCompare(b.key));
export function aggregateGoalStatus(current, tasks, optionalIds = new Set()) { if (["PAUSED", "CANCELLED"].includes(current)) return current; if (tasks.every((task) => task.status === "SUCCEEDED" || optionalIds.has(task.id) && ["FAILED", "CANCELLED"].includes(task.status))) return "SUCCEEDED"; if (tasks.some((task) => task.status === "FAILED" && !optionalIds.has(task.id))) return "FAILED"; if (tasks.some((task) => task.status === "BLOCKED")) return "BLOCKED"; if (tasks.some((task) => task.status === "VALIDATING")) return "VALIDATING"; if (tasks.some((task) => ["READY", "QUEUED", "CLAIMED", "RUNNING"].includes(task.status))) return "RUNNING"; return "PLANNED"; }
export function recoveryDecision(attempt) { if (attempt.status !== "RUNNING") return "QUEUED"; if (attempt.commitHash || attempt.artifactRefs?.length || attempt.metadata?.sideEffectsPossible !== false) return "BLOCKED"; return "QUEUED"; }
export const strongDependency = (edge) => STRONG.has(edge.dependencyType);
