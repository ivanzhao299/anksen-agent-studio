import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { runProfessionalProcess } from "./professional-process.mjs";

const fail = code => Object.assign(new Error(code), { code });

function assertConsumedApproval(approval, request) {
  if (
    !approval ||
    approval.status !== "CONSUMED" ||
    approval.taskId !== request.taskId ||
    approval.attemptId !== request.attemptId ||
    approval.profileId !== request.profileId
  ) {
    throw fail("KLING_PROVIDER_COST_APPROVAL_REQUIRED");
  }
}

export function createKlingAiVideoAdapter({ repoRoot = process.cwd(), run = runProfessionalProcess } = {}) {
  const root = resolve(repoRoot);
  const artifactRoot = resolve(root, "runtime/artifacts/media");
  const cli = resolve(root, "packages/digital-human-pipeline/bin/digital-human-pipeline.mjs");
  return async ({ request, outputRoot }) => {
    const operation = String(request.operation ?? "CHECK").toUpperCase();
    const timeoutMs = Math.min(Number(request.maxRuntimeMs ?? 900_000), 900_000);
    const env = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      KLING_API_KEY: process.env.KLING_API_KEY ?? "",
      DO_NOT_TRACK: "1",
      CI: "1"
    };
    if (operation === "CHECK" || operation === "SUBMIT") {
      if (!request.planPath) throw fail("KLING_PLAN_PATH_REQUIRED");
      const plan = await realpath(resolve(root, request.planPath));
      const allowed = await realpath(artifactRoot);
      if (!(plan === allowed || plan.startsWith(`${allowed}/`))) throw fail("KLING_PLAN_PATH_BLOCKED");
      if (operation === "CHECK") {
        const result = await run(process.execPath, [cli, "kling-submit", "--plan", plan, "--dry-run"], {
          cwd: root,
          timeoutMs,
          signal: request.signal,
          env
        });
        if (result.code !== 0) throw fail("KLING_PROVIDER_PREVIEW_FAILED");
        return {
          status: "CHECKED_AWAITING_PROVIDER_APPROVAL",
          artifacts: [{ name: "kling-submission-preview.json", mediaType: "application/json", content: result.stdout }]
        };
      }
      assertConsumedApproval(request.externalProviderApproval, request);
      const auditPath = resolve(outputRoot, "provider-submission-audit.json");
      const result = await run(
        process.execPath,
        [cli, "kling-submit", "--plan", plan, "--apply", "--cost-approved", "--output", auditPath],
        { cwd: root, timeoutMs, signal: request.signal, env }
      );
      if (result.code !== 0) throw fail("KLING_PROVIDER_SUBMISSION_FAILED");
      return {
        status: "SUBMITTED",
        artifacts: [
          { name: "kling-submission-result.json", mediaType: "application/json", content: result.stdout },
          { name: "provider-submission-audit.json", mediaType: "application/json", sourcePath: auditPath }
        ]
      };
    }
    if (operation === "STATUS" || operation === "POLL") {
      if (!request.auditPath) throw fail("KLING_AUDIT_PATH_REQUIRED");
      const audit = await realpath(resolve(root, request.auditPath));
      const allowed = await realpath(artifactRoot);
      if (!(audit === allowed || audit.startsWith(`${allowed}/`))) throw fail("KLING_AUDIT_PATH_BLOCKED");
      const args = [cli, operation === "POLL" ? "kling-poll" : "kling-status", "--audit", audit, "--apply"];
      if (operation === "POLL" && request.download === true) {
        args.push("--download", resolve(outputRoot, "provider-result.mp4"));
      }
      const result = await run(process.execPath, args, { cwd: root, timeoutMs, signal: request.signal, env });
      if (result.code !== 0) throw fail("KLING_PROVIDER_STATUS_FAILED");
      const artifacts = [
        { name: "kling-status-result.json", mediaType: "application/json", content: result.stdout },
        { name: "provider-submission-audit.json", mediaType: "application/json", content: await readFile(audit) }
      ];
      if (operation === "POLL" && request.download === true) {
        artifacts.push({ name: "provider-result.mp4", mediaType: "video/mp4", sourcePath: resolve(outputRoot, "provider-result.mp4") });
      }
      return { status: "SUCCEEDED", artifacts };
    }
    throw fail("KLING_PROVIDER_OPERATION_BLOCKED");
  };
}
