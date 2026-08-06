import { createHash } from "node:crypto";

const lifecycle = [
  ["UNDERSTAND", "理解目标", "intent"],
  ["ROUTE", "领域与项目路由", "routing"],
  ["PLAN", "展开工作流", "planning"],
  ["EXECUTE", "Agent 执行", "execution"],
  ["VERIFY", "自动测试与验收", "verification"],
  ["DELIVER", "成果交付", "delivery"],
  ["RELEASE", "发布与部署", "release"],
  ["CLOSE_LOOP", "监控、反馈与持续修复", "closure"]
];

const engineeringTerms = ["开发", "代码", "前端", "后端", "接口", "页面", "ui", "bug", "修复", "部署", "发布", "仓库", "软件", "需求"];
const normalize = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function softwareFallback(goal) {
  const text = normalize(goal);
  if (!engineeringTerms.some(term => text.includes(term))) return null;
  return {
    sequence: 1,
    applicationId: "software-factory",
    applicationName: "软件工厂",
    domainIds: ["software-engineering"],
    domainNames: ["软件研发"],
    dependsOn: [],
    matchedKeywords: engineeringTerms.filter(term => text.includes(term)),
    status: "READY",
    blockedReasons: []
  };
}

export function buildAutonomousIntakeContract({ goal, projectId, requestedRuntime = "auto", programPlan }) {
  const acceptedGoal = String(goal ?? "").trim();
  if (!acceptedGoal) throw Object.assign(new Error("AUTONOMOUS_INTAKE_GOAL_REQUIRED"), { code: "AUTONOMOUS_INTAKE_GOAL_REQUIRED" });
  const fallback = programPlan?.status === "CLARIFICATION_REQUIRED" ? softwareFallback(acceptedGoal) : null;
  const workstreams = programPlan?.workstreams?.length ? programPlan.workstreams : (fallback ? [fallback] : []);
  const blockedReasons = [...new Set([...(programPlan?.blockedReasons ?? []), ...workstreams.flatMap(item => item.blockedReasons ?? [])])];
  const status = blockedReasons.length
    ? "BLOCKED"
    : workstreams.length
      ? "READY"
      : "CLARIFICATION_REQUIRED";
  const stages = lifecycle.map(([id, label, owner], index) => ({
    sequence: index + 1,
    id,
    label,
    owner,
    status: index === 0 ? "READY" : "PENDING",
    requiredEvidence: id === "VERIFY"
      ? ["tests", "typecheck_or_static_analysis", "acceptance_evidence"]
      : id === "RELEASE"
        ? ["commit", "ci", "deployment", "smoke", "rollback_reference"]
        : id === "CLOSE_LOOP"
          ? ["health_signal", "feedback_channel", "repair_or_completion_decision"]
          : []
  }));
  const core = {
    schemaVersion: 1,
    kind: "autonomous_intake_contract",
    goal: acceptedGoal,
    projectId: String(projectId || "auto"),
    requestedRuntime: String(requestedRuntime || "auto"),
    routing: {
      status,
      dependencyMode: programPlan?.dependencyMode ?? "PARALLEL",
      workstreams,
      clarification: status === "CLARIFICATION_REQUIRED"
        ? (programPlan?.clarification ?? { code: "INTENT_NOT_IDENTIFIED", message: "需要补充预期成果或所属业务领域。" })
        : null,
      blockedReasons
    },
    lifecycle: stages,
    completionDefinition: {
      terminalState: "CLOSED_LOOP",
      requiresArtifact: true,
      requiresVerification: true,
      requiresReleaseDecision: true,
      requiresProductionEvidenceWhenDeployed: true,
      requiresFeedbackDisposition: true
    },
    automation: {
      modelSelection: "AUTO_ROUTE_REGISTERED_RUNTIME",
      workflowExpansion: "DOMAIN_WORKFLOW_AND_SHARED_KERNEL",
      testing: "REQUIRED_BEFORE_DELIVERY",
      delivery: "ARTIFACT_AND_RESULT_REPORT",
      release: "PROJECT_RELEASE_POLICY",
      repair: "BOUNDED_AUTOMATIC_REPAIR",
      unsafeOrUnqualifiedRelease: "FAIL_CLOSED"
    }
  };
  return { ...core, contractHash: digest(core) };
}

export function validateAutonomousIntakeContract(contract) {
  if (!contract || contract.schemaVersion !== 1 || contract.kind !== "autonomous_intake_contract") return { status: "FAIL", reason: "CONTRACT_INVALID" };
  const { contractHash, ...core } = contract;
  if (digest(core) !== contractHash) return { status: "FAIL", reason: "CONTRACT_HASH_MISMATCH" };
  const ids = contract.lifecycle?.map(stage => stage.id) ?? [];
  const missing = lifecycle.map(([id]) => id).filter(id => !ids.includes(id));
  return missing.length ? { status: "FAIL", reason: "LIFECYCLE_INCOMPLETE", missing } : { status: "PASS" };
}
