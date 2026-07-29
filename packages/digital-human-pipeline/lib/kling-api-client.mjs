import { createWriteStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

export const KLING_OVERSEAS_API_BASE = "https://api-singapore.klingai.com";
export const KLING_IMAGE_TO_VIDEO_PATH = "/image-to-video/kling-3.0";
export const KLING_TASKS_PATH = "/tasks";
export const KLING_API_KEY_ENV = "KLING_API_KEY";
export const KLING_KEYCHAIN_SERVICE = "com.anksen.agent-studio.kling-api";
export const KLING_KEYCHAIN_ACCOUNT = "kling-api-key";

const terminalStatuses = new Set(["succeeded", "failed"]);
const supportedExtensions = new Set([".jpg", ".jpeg", ".png"]);

function fail(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function normalizeResolution(resolution) {
  if (typeof resolution === "string" && ["720p", "1080p", "4k"].includes(resolution)) return resolution;
  const width = Number(resolution?.width ?? 0);
  const height = Number(resolution?.height ?? 0);
  const longestEdge = Math.max(width, height);
  if (longestEdge >= 3840) return "4k";
  if (longestEdge >= 1920) return "1080p";
  return "720p";
}

function normalizeDuration(value) {
  const duration = Math.round(Number(value));
  if (!Number.isFinite(duration) || duration < 3 || duration > 15) {
    throw fail("KLING_DURATION_UNSUPPORTED", { duration: value, supportedRange: "3-15" });
  }
  return duration;
}

function appendNegativePrompt(prompt, negativePrompt) {
  if (!negativePrompt) return prompt;
  return `${prompt} Avoid: ${negativePrompt}.`;
}

async function encodeImage(path) {
  const absolutePath = resolve(path);
  const extension = extname(absolutePath).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw fail("KLING_IMAGE_FORMAT_UNSUPPORTED", {
      path: absolutePath,
      supportedExtensions: [...supportedExtensions]
    });
  }
  await access(absolutePath).catch(() => {
    throw fail("KLING_IMAGE_MISSING", { path: absolutePath });
  });
  const metadata = await stat(absolutePath);
  if (metadata.size > 50 * 1024 * 1024) {
    throw fail("KLING_IMAGE_TOO_LARGE", { path: absolutePath, bytes: metadata.size, maximumBytes: 50 * 1024 * 1024 });
  }
  return (await readFile(absolutePath)).toString("base64");
}

export function buildKlingSubmissionPreview(plan, options = {}) {
  assertKlingPlan(plan);
  return {
    provider: "kling-ai",
    apiProfile: "kling-overseas-v3",
    endpoint: `${options.apiBase ?? KLING_OVERSEAS_API_BASE}${KLING_IMAGE_TO_VIDEO_PATH}`,
    method: "POST",
    authentication: {
      type: "bearer_api_key",
      credentialReferenceId: plan.credentialReference.reference,
      environmentVariable: KLING_API_KEY_ENV,
      keychainReference: {
        service: KLING_KEYCHAIN_SERVICE,
        account: KLING_KEYCHAIN_ACCOUNT
      },
      credentialValueIncluded: false
    },
    payload: {
      contents: [
        { type: "prompt", textLength: appendNegativePrompt(plan.input.prompt, plan.input.negativePrompt).length },
        { type: "first_frame", source: basename(plan.input.startFrame), transport: "base64_at_execution_boundary" },
        { type: "last_frame", source: basename(plan.input.endFrame), transport: "base64_at_execution_boundary" }
      ],
      settings: {
        resolution: normalizeResolution(options.resolution ?? plan.input.resolution),
        duration: normalizeDuration(options.duration ?? plan.input.durationSeconds),
        audio: (options.nativeAudio ?? plan.input.nativeAudio) ? "native" : "off",
        multi_shot: Boolean(options.multiShot)
      },
      options: {
        external_task_id: options.externalTaskId ?? plan.jobId,
        watermark_info: { enabled: Boolean(options.watermark) }
      }
    },
    governance: {
      risk: plan.governance.risk,
      costApprovalRequired: true,
      externalModelCall: true,
      secretPersistence: "forbidden"
    }
  };
}

export async function buildKlingCreatePayload(plan, options = {}) {
  const preview = buildKlingSubmissionPreview(plan, options);
  const [firstFrame, lastFrame] = await Promise.all([
    encodeImage(plan.input.startFrame),
    encodeImage(plan.input.endFrame)
  ]);
  const payload = {
    contents: [
      {
        type: "prompt",
        text: appendNegativePrompt(plan.input.prompt, plan.input.negativePrompt)
      },
      { type: "first_frame", url: firstFrame },
      { type: "last_frame", url: lastFrame }
    ],
    settings: preview.payload.settings,
    options: preview.payload.options
  };
  if (options.callbackUrl) payload.options.callback_url = options.callbackUrl;
  return payload;
}

function runSecurity(args) {
  return spawnSync("/usr/bin/security", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
}

export function getKlingCredentialAvailability(env = process.env, options = {}) {
  const environmentConfigured = Boolean(env[KLING_API_KEY_ENV]?.trim());
  const keychainConfigured =
    options.keychainProbe?.() ??
    (process.platform === "darwin" &&
      runSecurity([
        "find-generic-password",
        "-s",
        KLING_KEYCHAIN_SERVICE,
        "-a",
        KLING_KEYCHAIN_ACCOUNT
      ]).status === 0);
  return {
    credentialReferenceId: "kling-api-key-ref",
    available: environmentConfigured || keychainConfigured,
    environmentConfigured,
    keychainConfigured,
    credentialValueRead: false
  };
}

function readKlingKeychainApiKey() {
  if (process.platform !== "darwin") return null;
  const result = runSecurity([
    "find-generic-password",
    "-s",
    KLING_KEYCHAIN_SERVICE,
    "-a",
    KLING_KEYCHAIN_ACCOUNT,
    "-w"
  ]);
  return result.status === 0 && result.stdout?.trim() ? result.stdout.trim() : null;
}

export function resolveKlingApiKey(env = process.env, options = {}) {
  const apiKey = env[KLING_API_KEY_ENV];
  if (apiKey && String(apiKey).trim()) return String(apiKey).trim();
  const allowKeychain = options.allowKeychain ?? env === process.env;
  const keychainApiKey = allowKeychain ? (options.keychainReader?.() ?? readKlingKeychainApiKey()) : null;
  if (keychainApiKey) return String(keychainApiKey).trim();
  throw fail("KLING_API_KEY_REFERENCE_UNRESOLVED", {
    credentialReferenceId: "kling-api-key-ref",
    environmentVariable: KLING_API_KEY_ENV,
    keychainReference: {
      service: KLING_KEYCHAIN_SERVICE,
      account: KLING_KEYCHAIN_ACCOUNT
    }
  });
}

export function assertKlingPlan(plan) {
  if (!plan || plan.provider?.providerId !== "kling-ai") {
    throw fail("KLING_PLAN_REQUIRED", { providerId: plan?.provider?.providerId ?? null });
  }
  if (!plan.input?.startFrame || !plan.input?.endFrame || !plan.input?.prompt) {
    throw fail("KLING_PLAN_INPUT_INCOMPLETE");
  }
  if (!plan.governance?.requiresCostApproval || !plan.governance?.requiresCredentialReference) {
    throw fail("KLING_PLAN_GOVERNANCE_INCOMPLETE");
  }
  return plan;
}

async function requestJson(url, options, fetchImpl) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw fail("KLING_RESPONSE_INVALID", { status: response.status, responseText: text.slice(0, 300) });
  }
  if (!response.ok || body.code !== 0) {
    throw fail("KLING_API_REQUEST_FAILED", {
      status: response.status,
      providerCode: body.code ?? null,
      providerMessage: body.message ?? "Unknown provider error",
      requestId: body.request_id ?? null
    });
  }
  return body;
}

export async function submitKlingImageToVideo(plan, options = {}) {
  assertKlingPlan(plan);
  if (!options.costApproved) throw fail("KLING_COST_APPROVAL_REQUIRED");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw fail("KLING_FETCH_UNAVAILABLE");
  const apiKey = resolveKlingApiKey(options.env, {
    allowKeychain: options.allowKeychain,
    keychainReader: options.keychainReader
  });
  const payload = await buildKlingCreatePayload(plan, options);
  const apiBase = options.apiBase ?? KLING_OVERSEAS_API_BASE;
  const response = await requestJson(
    `${apiBase}${KLING_IMAGE_TO_VIDEO_PATH}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    fetchImpl
  );
  if (!response.data?.id) throw fail("KLING_TASK_ID_MISSING", { requestId: response.request_id ?? null });
  return {
    requestId: response.request_id ?? null,
    taskId: String(response.data.id),
    externalTaskId: response.data.external_id ?? payload.options.external_task_id,
    status: response.data.status ?? "submitted",
    createTime: response.data.create_time ?? null,
    updateTime: response.data.update_time ?? null
  };
}

export async function getKlingTask(taskId, options = {}) {
  if (!taskId) throw fail("KLING_TASK_ID_REQUIRED");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw fail("KLING_FETCH_UNAVAILABLE");
  const apiKey = resolveKlingApiKey(options.env, {
    allowKeychain: options.allowKeychain,
    keychainReader: options.keychainReader
  });
  const apiBase = options.apiBase ?? KLING_OVERSEAS_API_BASE;
  const query = new URLSearchParams({ task_ids: String(taskId) });
  const response = await requestJson(
    `${apiBase}${KLING_TASKS_PATH}?${query}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      }
    },
    fetchImpl
  );
  const task = Array.isArray(response.data) ? response.data[0] : null;
  if (!task) throw fail("KLING_TASK_NOT_FOUND", { taskId: String(taskId), requestId: response.request_id ?? null });
  return {
    requestId: response.request_id ?? null,
    taskId: String(task.id),
    externalTaskId: task.external_id ?? null,
    status: task.status,
    message: task.message ?? null,
    createTime: task.create_time ?? null,
    updateTime: task.update_time ?? null,
    outputs: Array.isArray(task.outputs) ? task.outputs : [],
    billing: Array.isArray(task.billing) ? task.billing : []
  };
}

export async function pollKlingTask(taskId, options = {}) {
  const intervalMs = Number(options.intervalMs ?? 10_000);
  const timeoutMs = Number(options.timeoutMs ?? 10 * 60_000);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const task = await getKlingTask(taskId, options);
    if (terminalStatuses.has(task.status)) return task;
    await new Promise(resolvePromise => setTimeout(resolvePromise, intervalMs));
  }
  throw fail("KLING_TASK_POLL_TIMEOUT", { taskId: String(taskId), timeoutMs });
}

export function findKlingVideoOutput(task) {
  return (task.outputs ?? []).find(output => output?.type === "video" && (output.url || output.watermark_url)) ?? null;
}

export async function downloadKlingVideo(task, outputPath, options = {}) {
  const output = findKlingVideoOutput(task);
  if (!output) throw fail("KLING_VIDEO_OUTPUT_MISSING", { taskId: task.taskId, status: task.status });
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(output.url ?? output.watermark_url);
  if (!response.ok || !response.body) {
    throw fail("KLING_VIDEO_DOWNLOAD_FAILED", { taskId: task.taskId, status: response.status });
  }
  const absolutePath = resolve(outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await pipeline(response.body, createWriteStream(absolutePath));
  return {
    path: absolutePath,
    source: output.url ? "unwatermarked" : "watermarked",
    duration: output.duration ?? null
  };
}

export function createKlingSubmissionAudit(plan, preview, submission = null) {
  return {
    schemaVersion: 1,
    provider: "kling-ai",
    apiProfile: preview.apiProfile,
    jobId: plan.jobId,
    action: submission ? "PROVIDER_SUBMITTED" : "SUBMISSION_DRY_RUN",
    occurredAt: new Date().toISOString(),
    endpoint: preview.endpoint,
    governance: preview.governance,
    credential: {
      credentialReferenceId: preview.authentication.credentialReferenceId,
      environmentVariable: preview.authentication.environmentVariable,
      credentialValuePersisted: false,
      browserSessionAccessed: false
    },
    request: {
      payloadSummary: preview.payload,
      imageBytesPersisted: false,
      authorizationHeaderPersisted: false
    },
    providerResult: submission
      ? {
          requestId: submission.requestId,
          taskId: submission.taskId,
          externalTaskId: submission.externalTaskId,
          status: submission.status,
          createTime: submission.createTime,
          updateTime: submission.updateTime
        }
      : null
  };
}

export function updateKlingTaskAudit(audit, task, download = null) {
  return {
    ...audit,
    action: task.status === "succeeded" ? "PROVIDER_RESULT_READY" : "PROVIDER_STATUS_CHECKED",
    checkedAt: new Date().toISOString(),
    providerResult: {
      ...(audit.providerResult ?? {}),
      requestId: task.requestId,
      taskId: task.taskId,
      externalTaskId: task.externalTaskId,
      status: task.status,
      message: task.message,
      createTime: task.createTime,
      updateTime: task.updateTime,
      outputCount: task.outputs.length,
      videoOutputAvailable: Boolean(findKlingVideoOutput(task)),
      resultUrlPersisted: false,
      billingRecordCount: task.billing.length
    },
    download: download
      ? {
          path: download.path,
          source: download.source,
          duration: download.duration,
          completedAt: new Date().toISOString()
        }
      : null
  };
}

export async function writeKlingAudit(path, audit) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o600 });
  return absolutePath;
}
