"use strict";

const TEMPLATE_ID = "jinhu-park-64x144-v1";
const ALLOWED_OUTPUTS = new Set(["psd", "png", "jpg"]);
const ALLOWED_OPERATIONS = new Set([
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

function validateJob(input) {
  assert(input && typeof input === "object" && !Array.isArray(input), "job must be an object");
  const jobId = safeText(input.jobId, "jobId", 80);
  assert(input.templateId === TEMPLATE_ID, `unsupported template; expected ${TEMPLATE_ID}`, "templateId");
  assert(input.templateVersion === "1.0.0", "unsupported template version", "templateVersion");

  const document = input.document || {};
  assert(document.widthMm === 640, "must be 640", "document.widthMm");
  assert(document.heightMm === 1440, "must be 1440", "document.heightMm");
  assert(document.bleedMm === 3, "must be 3", "document.bleedMm");
  assert([150, 200, 300].includes(document.resolution), "must be 150, 200, or 300", "document.resolution");
  assert(["RGB", "CMYK"].includes(document.colorMode), "must be RGB or CMYK", "document.colorMode");

  const content = input.content || {};
  const features = content.features;
  assert(Array.isArray(features) && features.length === 3, "must contain exactly three items", "content.features");
  const normalizedContent = {
    title: safeText(content.title, "content.title", 24),
    subtitle: safeText(content.subtitle, "content.subtitle", 40),
    features: features.map((value, index) => safeText(value, `content.features.${index}`, 12)),
    slogan: safeText(content.slogan, "content.slogan", 40)
  };

  const operations = input.operations || [...ALLOWED_OPERATIONS];
  assert(Array.isArray(operations) && operations.length > 0, "must be a non-empty array", "operations");
  for (const operation of operations) assert(ALLOWED_OPERATIONS.has(operation), `operation is not allowed: ${operation}`, "operations");

  const outputs = input.outputs || ["psd", "png"];
  assert(Array.isArray(outputs) && outputs.length > 0, "must be a non-empty array", "outputs");
  for (const output of outputs) assert(ALLOWED_OUTPUTS.has(output), `output is not allowed: ${output}`, "outputs");

  assert(input.requireApproval === true, "must be true", "requireApproval");
  const governance = input.governance || {};
  assert(governance.executionMode === "human_confirmed", "must be human_confirmed", "governance.executionMode");
  assert(governance.production === false, "production execution is forbidden", "governance.production");
  assert(governance.deploy === false, "deployment is forbidden", "governance.deploy");

  return Object.freeze({
    schemaVersion: 1,
    jobId,
    templateId: TEMPLATE_ID,
    templateVersion: "1.0.0",
    document: Object.freeze({ ...document }),
    content: Object.freeze(normalizedContent),
    operations: Object.freeze([...new Set(operations)]),
    outputs: Object.freeze([...new Set(outputs)]),
    requireApproval: true,
    governance: Object.freeze({ executionMode: "human_confirmed", production: false, deploy: false })
  });
}

module.exports = { TEMPLATE_ID, ALLOWED_OPERATIONS, JobValidationError, validateJob };
