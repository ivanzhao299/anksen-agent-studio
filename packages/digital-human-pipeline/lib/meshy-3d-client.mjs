import { createWriteStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

export const MESHY_API_BASE = "https://api.meshy.ai";
export const MESHY_MULTI_IMAGE_PATH = "/openapi/v1/multi-image-to-3d";
export const MESHY_TEXT_TO_3D_PATH = "/openapi/v2/text-to-3d";
export const MESHY_API_KEY_ENV = "MESHY_API_KEY";
export const MESHY_KEYCHAIN_SERVICE = "com.anksen.agent-studio.meshy-api";
export const MESHY_KEYCHAIN_ACCOUNT = "meshy-api-key";

const supportedExtensions = new Set([".jpg", ".jpeg", ".png"]);
const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

function fail(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function runSecurity(args) {
  return spawnSync("/usr/bin/security", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
}

export function getMeshyCredentialAvailability(env = process.env, options = {}) {
  const environmentConfigured = Boolean(env[MESHY_API_KEY_ENV]?.trim());
  const keychainConfigured =
    options.keychainProbe?.() ??
    (process.platform === "darwin" &&
      runSecurity(["find-generic-password", "-s", MESHY_KEYCHAIN_SERVICE, "-a", MESHY_KEYCHAIN_ACCOUNT]).status === 0);
  return {
    credentialReferenceId: "meshy-api-key-ref",
    available: environmentConfigured || keychainConfigured,
    environmentConfigured,
    keychainConfigured,
    credentialValueRead: false
  };
}

function readMeshyKeychainApiKey() {
  if (process.platform !== "darwin") return null;
  const result = runSecurity([
    "find-generic-password",
    "-s",
    MESHY_KEYCHAIN_SERVICE,
    "-a",
    MESHY_KEYCHAIN_ACCOUNT,
    "-w"
  ]);
  return result.status === 0 && result.stdout?.trim() ? result.stdout.trim() : null;
}

export function resolveMeshyApiKey(env = process.env, options = {}) {
  const value = env[MESHY_API_KEY_ENV];
  if (value && String(value).trim()) return String(value).trim();
  const allowKeychain = options.allowKeychain ?? env === process.env;
  const keychainValue = allowKeychain ? (options.keychainReader?.() ?? readMeshyKeychainApiKey()) : null;
  if (keychainValue) return String(keychainValue).trim();
  throw fail("MESHY_API_KEY_REFERENCE_UNRESOLVED", {
    credentialReferenceId: "meshy-api-key-ref",
    environmentVariable: MESHY_API_KEY_ENV,
    keychainReference: {
      service: MESHY_KEYCHAIN_SERVICE,
      account: MESHY_KEYCHAIN_ACCOUNT
    }
  });
}

export function assertMeshyPlan(plan) {
  if (!plan || plan.provider?.providerId !== "meshy-multi-image") {
    throw fail("MESHY_3D_PLAN_REQUIRED", { providerId: plan?.provider?.providerId ?? null });
  }
  if (!Array.isArray(plan.input?.views) || plan.input.views.length < 1 || plan.input.views.length > 4) {
    throw fail("MESHY_3D_VIEW_COUNT_INVALID", { count: plan.input?.views?.length ?? 0 });
  }
  if (!plan.governance?.requiresCostApproval || !plan.governance?.requiresCredentialReference) {
    throw fail("MESHY_3D_PLAN_GOVERNANCE_INCOMPLETE");
  }
  return plan;
}

export function assertMeshyTextPlan(plan) {
  if (!plan || plan.provider?.providerId !== "meshy-text-to-3d" || plan.mode !== "preview") {
    throw fail("MESHY_TEXT_3D_PLAN_REQUIRED", {
      providerId: plan?.provider?.providerId ?? null,
      mode: plan?.mode ?? null
    });
  }
  const prompt = String(plan.prompt ?? "").trim();
  if (!prompt || prompt.length > 600) {
    throw fail("MESHY_TEXT_3D_PROMPT_INVALID", { length: prompt.length, maximum: 600 });
  }
  if (!plan.governance?.requiresCostApproval || !plan.governance?.requiresCredentialReference) {
    throw fail("MESHY_TEXT_3D_PLAN_GOVERNANCE_INCOMPLETE");
  }
  return plan;
}

export function buildMeshyTextSubmissionPreview(plan, options = {}) {
  assertMeshyTextPlan(plan);
  return {
    provider: "meshy-text-to-3d",
    endpoint: `${options.apiBase ?? MESHY_API_BASE}${MESHY_TEXT_TO_3D_PATH}`,
    method: "POST",
    authentication: {
      type: "bearer_api_key",
      credentialReferenceId: plan.credentialReference.reference,
      environmentVariable: MESHY_API_KEY_ENV,
      keychainReference: {
        service: MESHY_KEYCHAIN_SERVICE,
        account: MESHY_KEYCHAIN_ACCOUNT
      },
      credentialValueIncluded: false
    },
    payload: {
      mode: "preview",
      prompt: plan.prompt,
      model_type: options.modelType ?? plan.generation?.modelType ?? "standard",
      ai_model: options.model ?? plan.generation?.aiModel ?? "meshy-6",
      should_remesh: options.remesh ?? plan.generation?.shouldRemesh ?? false,
      pose_mode: options.poseMode ?? plan.generation?.poseMode ?? "",
      target_formats: options.targetFormats ?? plan.generation?.targetFormats ?? ["glb"],
      alpha_thumbnail: options.alphaThumbnail ?? plan.generation?.alphaThumbnail ?? true,
      auto_size: options.autoSize ?? plan.generation?.autoSize ?? true,
      origin_at: options.originAt ?? plan.generation?.originAt ?? "bottom"
    },
    referenceAnalysis: plan.referenceAnalysis,
    governance: {
      risk: plan.governance.risk,
      costApprovalRequired: true,
      externalModelCall: true,
      secretPersistence: "forbidden"
    }
  };
}

export function buildMeshySubmissionPreview(plan, options = {}) {
  assertMeshyPlan(plan);
  const mapping = plan.providerRequestMapping ?? {};
  const targetFormats = options.targetFormats ?? mapping.targetFormats ?? ["glb"];
  return {
    provider: "meshy-multi-image",
    endpoint: `${options.apiBase ?? MESHY_API_BASE}${MESHY_MULTI_IMAGE_PATH}`,
    method: "POST",
    authentication: {
      type: "bearer_api_key",
      credentialReferenceId: plan.credentialReference.reference,
      environmentVariable: MESHY_API_KEY_ENV,
      keychainReference: {
        service: MESHY_KEYCHAIN_SERVICE,
        account: MESHY_KEYCHAIN_ACCOUNT
      },
      credentialValueIncluded: false
    },
    payload: {
      imageCount: plan.input.views.length,
      images: plan.input.views.map(view => ({
        angle: view.angle,
        view: view.view,
        source: basename(view.imagePath),
        transport: "base64_data_uri_at_execution_boundary"
      })),
      ai_model: options.model ?? "meshy-6",
      should_texture: options.texture ?? mapping.shouldTexture ?? false,
      enable_pbr: options.pbr ?? mapping.enablePbr ?? false,
      should_remesh: options.remesh ?? mapping.shouldRemesh ?? false,
      image_enhancement: options.imageEnhancement ?? mapping.imageEnhancement ?? false,
      target_formats: targetFormats
    },
    governance: {
      risk: plan.governance.risk,
      costApprovalRequired: true,
      externalModelCall: true,
      secretPersistence: "forbidden"
    }
  };
}

async function encodeImageDataUri(path) {
  const absolutePath = resolve(path);
  const extension = extname(absolutePath).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw fail("MESHY_3D_IMAGE_FORMAT_UNSUPPORTED", {
      path: absolutePath,
      supportedExtensions: [...supportedExtensions]
    });
  }
  await access(absolutePath).catch(() => {
    throw fail("MESHY_3D_IMAGE_MISSING", { path: absolutePath });
  });
  const metadata = await stat(absolutePath);
  if (metadata.size > 20 * 1024 * 1024) {
    throw fail("MESHY_3D_IMAGE_TOO_LARGE", { path: absolutePath, bytes: metadata.size });
  }
  const mime = extension === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${(await readFile(absolutePath)).toString("base64")}`;
}

export async function buildMeshyCreatePayload(plan, options = {}) {
  const preview = buildMeshySubmissionPreview(plan, options);
  const imageUrls = await Promise.all(plan.input.views.map(view => encodeImageDataUri(view.imagePath)));
  return {
    image_urls: imageUrls,
    ai_model: preview.payload.ai_model,
    should_texture: preview.payload.should_texture,
    enable_pbr: preview.payload.enable_pbr,
    should_remesh: preview.payload.should_remesh,
    image_enhancement: preview.payload.image_enhancement,
    target_formats: preview.payload.target_formats
  };
}

async function requestJson(url, options, fetchImpl) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw fail("MESHY_3D_RESPONSE_INVALID", { status: response.status, responseText: text.slice(0, 300) });
  }
  if (!response.ok) {
    throw fail("MESHY_3D_API_REQUEST_FAILED", {
      status: response.status,
      providerMessage: body.message ?? body.error ?? "Unknown provider error"
    });
  }
  return body;
}

export async function submitMeshyMultiImage(plan, options = {}) {
  assertMeshyPlan(plan);
  if (!options.costApproved) throw fail("MESHY_3D_COST_APPROVAL_REQUIRED");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw fail("MESHY_3D_FETCH_UNAVAILABLE");
  const apiKey = resolveMeshyApiKey(options.env, {
    allowKeychain: options.allowKeychain,
    keychainReader: options.keychainReader
  });
  const payload = await buildMeshyCreatePayload(plan, options);
  const apiBase = options.apiBase ?? MESHY_API_BASE;
  const response = await requestJson(
    `${apiBase}${MESHY_MULTI_IMAGE_PATH}`,
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
  if (!response.result) throw fail("MESHY_3D_TASK_ID_MISSING");
  return {
    taskId: String(response.result),
    status: "PENDING"
  };
}

export async function submitMeshyTextPreview(plan, options = {}) {
  assertMeshyTextPlan(plan);
  if (!options.costApproved) throw fail("MESHY_3D_COST_APPROVAL_REQUIRED");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw fail("MESHY_3D_FETCH_UNAVAILABLE");
  const apiKey = resolveMeshyApiKey(options.env, {
    allowKeychain: options.allowKeychain,
    keychainReader: options.keychainReader
  });
  const preview = buildMeshyTextSubmissionPreview(plan, options);
  const response = await requestJson(
    preview.endpoint,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(preview.payload)
    },
    fetchImpl
  );
  if (!response.result) throw fail("MESHY_3D_TASK_ID_MISSING");
  return {
    taskId: String(response.result),
    status: "PENDING"
  };
}

export async function getMeshyTask(taskId, options = {}) {
  if (!taskId) throw fail("MESHY_3D_TASK_ID_REQUIRED");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw fail("MESHY_3D_FETCH_UNAVAILABLE");
  const apiKey = resolveMeshyApiKey(options.env, {
    allowKeychain: options.allowKeychain,
    keychainReader: options.keychainReader
  });
  const apiBase = options.apiBase ?? MESHY_API_BASE;
  const taskPath = options.taskPath ?? MESHY_MULTI_IMAGE_PATH;
  const body = await requestJson(
    `${apiBase}${taskPath}/${encodeURIComponent(taskId)}`,
    { method: "GET", headers: { authorization: `Bearer ${apiKey}` } },
    fetchImpl
  );
  return {
    taskId: String(body.id ?? taskId),
    status: String(body.status ?? "UNKNOWN").toUpperCase(),
    progress: Number(body.progress ?? 0),
    modelUrls: body.model_urls ?? {},
    thumbnailUrl: body.thumbnail_url ?? null,
    taskError: body.task_error ?? null
  };
}

export function getMeshyTextTask(taskId, options = {}) {
  return getMeshyTask(taskId, { ...options, taskPath: MESHY_TEXT_TO_3D_PATH });
}

export async function pollMeshyTask(taskId, options = {}) {
  const intervalMs = Number(options.intervalMs ?? 10_000);
  const timeoutMs = Number(options.timeoutMs ?? 20 * 60_000);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const task = await getMeshyTask(taskId, options);
    if (terminalStatuses.has(task.status)) return task;
    await new Promise(resolvePromise => setTimeout(resolvePromise, intervalMs));
  }
  throw fail("MESHY_3D_TASK_POLL_TIMEOUT", { taskId: String(taskId), timeoutMs });
}

export async function pollMeshyTextTask(taskId, options = {}) {
  return pollMeshyTask(taskId, { ...options, taskPath: MESHY_TEXT_TO_3D_PATH });
}

export async function downloadMeshyModel(task, outputPath, options = {}) {
  const url = task.modelUrls?.glb;
  if (!url) throw fail("MESHY_3D_GLB_OUTPUT_MISSING", { taskId: task.taskId, status: task.status });
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(url);
  if (!response.ok || !response.body) {
    throw fail("MESHY_3D_MODEL_DOWNLOAD_FAILED", { taskId: task.taskId, status: response.status });
  }
  const absolutePath = resolve(outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await pipeline(response.body, createWriteStream(absolutePath));
  return { path: absolutePath, format: "glb" };
}

export function createMeshySubmissionAudit(plan, preview, submission) {
  return {
    schemaVersion: 1,
    provider: "meshy-multi-image",
    jobId: plan.jobId,
    action: "PROVIDER_SUBMITTED",
    occurredAt: new Date().toISOString(),
    endpoint: preview.endpoint,
    governance: preview.governance,
    credential: {
      credentialReferenceId: preview.authentication.credentialReferenceId,
      environmentVariable: preview.authentication.environmentVariable,
      credentialValuePersisted: false
    },
    request: {
      payloadSummary: preview.payload,
      imageBytesPersisted: false,
      authorizationHeaderPersisted: false
    },
    providerResult: submission,
    output: {
      resultUrlPersisted: false,
      localModel: null
    }
  };
}

export function createMeshyTextSubmissionAudit(plan, preview, submission) {
  return {
    schemaVersion: 1,
    provider: "meshy-text-to-3d",
    jobId: plan.jobId,
    action: "PROVIDER_SUBMITTED",
    occurredAt: new Date().toISOString(),
    endpoint: preview.endpoint,
    governance: preview.governance,
    credential: {
      credentialReferenceId: preview.authentication.credentialReferenceId,
      environmentVariable: preview.authentication.environmentVariable,
      credentialValuePersisted: false
    },
    request: {
      payloadSummary: preview.payload,
      referenceAnalysis: preview.referenceAnalysis,
      authorizationHeaderPersisted: false
    },
    providerResult: submission,
    output: {
      resultUrlPersisted: false,
      localModel: null
    }
  };
}

export function updateMeshyTaskAudit(audit, task, download = null) {
  return {
    ...audit,
    updatedAt: new Date().toISOString(),
    providerResult: {
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      taskError: task.taskError,
      modelAvailable: Boolean(task.modelUrls?.glb),
      modelUrlsPersisted: false
    },
    output: {
      resultUrlPersisted: false,
      localModel: download?.path ?? null
    }
  };
}

export async function writeMeshyAudit(path, audit) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(audit, null, 2)}\n`);
  return absolutePath;
}
