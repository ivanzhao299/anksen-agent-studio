"use strict";

const { validateOperationPlan } = require("./operation-dsl.cjs");

const TEMPLATE_ID = "jinhu-park-64x144-v1";
const ALLOWED_OUTPUTS = new Set(["psd", "png", "jpg"]);
const LEGACY_OPERATIONS = new Set([
  "create_document",
  "create_layer_groups",
  "place_approved_logo",
  "create_text_layers",
  "create_brand_background",
  "save_psd",
  "export_preview"
]);

class JobValidationError extends Error {
  constructor(message, path) {
    super(path ? `${path}: ${message}` : message);
    this.name = "JobValidationError";
    this.path = path || null;
  }
}

function assert(condition, message, path) {
  if (!condition) throw new JobValidationError(message, path);
}

function safeText(value, path, maxLength) {
  assert(typeof value === "string", "must be a string", path);
  const text = value.trim();
  assert(text.length > 0, "must not be empty", path);
  assert(text.length <= maxLength, `must be at most ${maxLength} characters`, path);
  assert(!/[<>\u0000-\u001f]/.test(text), "contains forbidden control or markup characters", path);
  return text;
}

function validateGovernance(input, jobId) {
  assert(input.requireApproval === true, "must be true", "requireApproval");
  const governance = input.governance || {};
  assert(governance.executionMode === "human_confirmed", "must be human_confirmed", "governance.executionMode");
  assert(governance.production === false, "production execution is forbidden", "governance.production");
  assert(governance.deploy === false, "deployment is forbidden", "governance.deploy");
  assert(governance.approvedJobId === jobId, "must match jobId", "governance.approvedJobId");
  assert(typeof governance.approvalId === "string" && governance.approvalId.trim(), "is required", "governance.approvalId");
  assert(["STUDIO", "LOCAL_DEMO"].includes(governance.approvalSource), "must be STUDIO or LOCAL_DEMO", "governance.approvalSource");
  return Object.freeze({
    executionMode: "human_confirmed",
    production: false,
    deploy: false,
    approvedJobId: governance.approvedJobId,
    approvalId: safeText(governance.approvalId, "governance.approvalId", 128),
    approvalSource: governance.approvalSource
  });
}

function validateDocument(document, { requirePhysical = false } = {}) {
  assert(document && typeof document === "object", "must be an object", "document");
  if (requirePhysical) {
    assert(document.widthMm === 640, "must be 640", "document.widthMm");
    assert(document.heightMm === 1440, "must be 1440", "document.heightMm");
    assert(document.bleedMm === 0, "must be 0 for the exact-size roll-up template", "document.bleedMm");
  }
  if (document.widthMm != null) assert(Number.isFinite(document.widthMm) && document.widthMm > 0 && document.widthMm <= 10000, "must be a valid physical width", "document.widthMm");
  if (document.heightMm != null) assert(Number.isFinite(document.heightMm) && document.heightMm > 0 && document.heightMm <= 10000, "must be a valid physical height", "document.heightMm");
  if (document.widthPx != null) assert(Number.isInteger(document.widthPx) && document.widthPx > 0 && document.widthPx <= 100000, "must be a valid pixel width", "document.widthPx");
  if (document.heightPx != null) assert(Number.isInteger(document.heightPx) && document.heightPx > 0 && document.heightPx <= 100000, "must be a valid pixel height", "document.heightPx");
  if (document.bleedMm != null) assert(Number.isFinite(document.bleedMm) && document.bleedMm >= 0 && document.bleedMm <= 100, "must be a valid bleed", "document.bleedMm");
  if (document.safeMarginPx != null) assert(Number.isInteger(document.safeMarginPx) && document.safeMarginPx >= 0, "must be a non-negative integer", "document.safeMarginPx");
  assert([72, 96, 120, 150, 200, 240, 300, 600].includes(document.resolution), "must be an approved resolution", "document.resolution");
  assert(["RGB", "CMYK"].includes(document.colorMode), "must be RGB or CMYK", "document.colorMode");
  return Object.freeze({ ...document });
}

function validateLegacyJob(input, jobId) {
  assert(input.templateId === TEMPLATE_ID, `unsupported template; expected ${TEMPLATE_ID}`, "templateId");
  assert(input.templateVersion === "1.0.0", "unsupported template version", "templateVersion");
  const document = validateDocument(input.document || {}, { requirePhysical: true });
  const content = input.content || {};
  assert(Array.isArray(content.features) && content.features.length === 3, "must contain exactly three items", "content.features");
  const normalizedContent = {
    title: safeText(content.title, "content.title", 24),
    subtitle: safeText(content.subtitle, "content.subtitle", 40),
    features: content.features.map((value, index) => safeText(value, `content.features.${index}`, 12)),
    slogan: safeText(content.slogan, "content.slogan", 40)
  };
  const operations = input.operations || [...LEGACY_OPERATIONS];
  assert(Array.isArray(operations) && operations.length > 0, "must be a non-empty array", "operations");
  for (const operation of operations) assert(LEGACY_OPERATIONS.has(operation), `operation is not allowed: ${operation}`, "operations");
  const outputs = input.outputs || ["psd", "png"];
  assert(Array.isArray(outputs) && outputs.length > 0, "must be a non-empty array", "outputs");
  for (const output of outputs) assert(ALLOWED_OUTPUTS.has(output), `output is not allowed: ${output}`, "outputs");
  return Object.freeze({
    schemaVersion: 1,
    jobId,
    executionMode: "CREATE_TEMPLATE",
    templateId: TEMPLATE_ID,
    templateVersion: "1.0.0",
    document,
    content: Object.freeze(normalizedContent),
    operations: Object.freeze([...new Set(operations)]),
    outputs: Object.freeze([...new Set(outputs)]),
    requireApproval: true,
    governance: validateGovernance(input, jobId)
  });
}

function validateOutputSpecs(outputs) {
  assert(Array.isArray(outputs) && outputs.length > 0, "must be a non-empty array", "outputs");
  return Object.freeze(outputs.map((item, index) => {
    assert(item && typeof item === "object", "must be an object", `outputs.${index}`);
    const format = String(item.format || "").toLowerCase();
    assert(ALLOWED_OUTPUTS.has(format), "must be psd, png, or jpg", `outputs.${index}.format`);
    return Object.freeze({
      format,
      purpose: item.purpose ? safeText(item.purpose, `outputs.${index}.purpose`, 160) : format === "psd" ? "editable_source" : "preview",
      required: item.required !== false,
      preserveLayers: format === "psd" ? item.preserveLayers !== false : false
    });
  }));
}

function validateV2Job(input, jobId) {
  const executionMode = String(input.executionMode || "MODIFY_ACTIVE_DOCUMENT").toUpperCase();
  assert(executionMode === "MODIFY_ACTIVE_DOCUMENT", "V2 supports MODIFY_ACTIVE_DOCUMENT only; use the governed legacy template path for document creation", "executionMode");
  const plan = validateOperationPlan(input.operations);
  const outputs = validateOutputSpecs(input.outputs);
  const plannedOutputFormats = new Set(plan.operations.filter(operation => operation.operation === "SAVE_COPY" || operation.operation === "EXPORT_DOCUMENT").map(operation => operation.parameters.format));
  for (const output of outputs.filter(item => item.required)) assert(plannedOutputFormats.has(output.format), `required ${output.format} output has no matching SAVE_COPY or EXPORT_DOCUMENT operation`, "outputs");
  const sourceAssetRefs = input.sourceAssetRefs || [];
  assert(Array.isArray(sourceAssetRefs), "must be an array", "sourceAssetRefs");
  const assets = sourceAssetRefs.map((value, index) => safeText(value, `sourceAssetRefs.${index}`, 128));
  const brief = input.brief || {};
  const minimumFontSizePt = Number(input.reviewCriteria?.minimumFontSizePt ?? 18);
  assert(Number.isFinite(minimumFontSizePt) && minimumFontSizePt >= 6 && minimumFontSizePt <= 400, "must be between 6 and 400", "reviewCriteria.minimumFontSizePt");
  return Object.freeze({
    schemaVersion: 2,
    jobId,
    title: safeText(input.title || jobId, "title", 160),
    executionMode,
    templateId: input.templateId ? safeText(input.templateId, "templateId", 128) : null,
    templateVersion: input.templateVersion ? safeText(input.templateVersion, "templateVersion", 40) : null,
    document: validateDocument(input.document || {}),
    brief: Object.freeze({
      goal: safeText(brief.goal || input.title || jobId, "brief.goal", 500),
      audience: brief.audience ? safeText(brief.audience, "brief.audience", 240) : null,
      requiredElements: Object.freeze((brief.requiredElements || []).map((value, index) => safeText(value, `brief.requiredElements.${index}`, 160))),
      forbiddenElements: Object.freeze((brief.forbiddenElements || []).map((value, index) => safeText(value, `brief.forbiddenElements.${index}`, 160)))
    }),
    sourceAssetRefs: Object.freeze(assets),
    operations: plan.operations,
    operationSummary: plan.summary,
    outputs,
    reviewCriteria: Object.freeze({
      minimumFontSizePt,
      requireEditableText: input.reviewCriteria?.requireEditableText !== false,
      requireSemanticLayerNames: input.reviewCriteria?.requireSemanticLayerNames !== false
    }),
    requireApproval: true,
    governance: validateGovernance(input, jobId)
  });
}

function validateJob(input) {
  assert(input && typeof input === "object" && !Array.isArray(input), "job must be an object");
  const jobId = safeText(input.jobId, "jobId", 80);
  const version = Number(input.schemaVersion || 1);
  if (version === 1) return validateLegacyJob(input, jobId);
  if (version === 2) return validateV2Job(input, jobId);
  throw new JobValidationError(`unsupported schema version: ${version}`, "schemaVersion");
}

module.exports = { TEMPLATE_ID, ALLOWED_OUTPUTS, LEGACY_OPERATIONS, JobValidationError, validateJob };
