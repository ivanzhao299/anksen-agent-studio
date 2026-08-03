"use strict";

const OPERATION_DEFINITIONS = Object.freeze({
  INSPECT_DOCUMENT: { risk: "READ_ONLY", target: "document", write: false },
  SELECT_LAYER: { risk: "READ_ONLY", target: "layer", write: false },
  RENAME_LAYER: { risk: "MEDIUM", target: "layer", write: true },
  SET_VISIBILITY: { risk: "MEDIUM", target: "layer", write: true },
  MOVE_LAYER: { risk: "MEDIUM", target: "layer", write: true },
  RESIZE_LAYER: { risk: "MEDIUM", target: "layer", write: true },
  REPLACE_TEXT: { risk: "MEDIUM", target: "layer", write: true },
  SET_TEXT_COLOR: { risk: "MEDIUM", target: "layer", write: true },
  CREATE_GROUP: { risk: "MEDIUM", target: "document", write: true },
  DUPLICATE_LAYER: { risk: "MEDIUM", target: "layer", write: true },
  REPLACE_SMART_OBJECT: { risk: "HIGH", target: "layer", write: true },
  SAVE_COPY: { risk: "HIGH", target: "document", write: true },
  EXPORT_DOCUMENT: { risk: "HIGH", target: "document", write: true }
});

const RAW_EXECUTION_KEYS = /^(?:batchplay|descriptor|javascript|script|eval|_obj|_target|_path)$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

class OperationValidationError extends Error {
  constructor(message, path) {
    super(path ? `${path}: ${message}` : message);
    this.name = "OperationValidationError";
    this.path = path || null;
  }
}

function assert(condition, message, path) {
  if (!condition) throw new OperationValidationError(message, path);
}

function text(value, path, maxLength = 2000) {
  assert(typeof value === "string", "must be a string", path);
  const normalized = value.trim();
  assert(normalized.length > 0, "must not be empty", path);
  assert(normalized.length <= maxLength, `must be at most ${maxLength} characters`, path);
  assert(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized), "contains control characters", path);
  return normalized;
}

function finite(value, path, { min = -100000, max = 100000 } = {}) {
  assert(Number.isFinite(value), "must be a finite number", path);
  assert(value >= min && value <= max, `must be between ${min} and ${max}`, path);
  return Number(value);
}

function assertNoRawExecution(value, path = "operation") {
  if (!value || typeof value !== "object") {
    if (typeof value === "string") assert(!/(?:batchPlay\s*\(|eval\s*\(|new\s+Function\s*\()/i.test(value), "raw execution is forbidden", path);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert(!RAW_EXECUTION_KEYS.test(key), `raw execution field is forbidden: ${key}`, `${path}.${key}`);
    assertNoRawExecution(child, `${path}.${key}`);
  }
}

function normalizeTarget(value, required, path) {
  if (!required) return null;
  assert(value && typeof value === "object" && !Array.isArray(value), "must be an object", path);
  const hasId = Number.isInteger(value.layerId) && value.layerId > 0;
  const hasName = typeof value.layerName === "string" && value.layerName.trim().length > 0;
  assert(hasId !== hasName, "provide exactly one of layerId or layerName", path);
  return hasId ? { layerId: value.layerId } : { layerName: text(value.layerName, `${path}.layerName`, 255) };
}

function normalizeRgb(value, path) {
  assert(value && typeof value === "object" && !Array.isArray(value), "must be an RGB object", path);
  const channel = name => {
    assert(Number.isInteger(value[name]) && value[name] >= 0 && value[name] <= 255, "must be an integer from 0 to 255", `${path}.${name}`);
    return value[name];
  };
  return { red: channel("red"), green: channel("green"), blue: channel("blue") };
}

function normalizeParameters(type, value = {}, path = "parameters") {
  assert(value && typeof value === "object" && !Array.isArray(value), "must be an object", path);
  if (type === "RENAME_LAYER") return { name: text(value.name, `${path}.name`, 255) };
  if (type === "SET_VISIBILITY") {
    assert(typeof value.visible === "boolean", "must be a boolean", `${path}.visible`);
    return { visible: value.visible };
  }
  if (type === "MOVE_LAYER") return {
    deltaX: finite(value.deltaX, `${path}.deltaX`),
    deltaY: finite(value.deltaY, `${path}.deltaY`)
  };
  if (type === "RESIZE_LAYER") {
    const scaleX = finite(value.scaleX, `${path}.scaleX`, { min: 1, max: 1000 });
    const preserveAspect = value.preserveAspect !== false;
    const scaleY = preserveAspect ? scaleX : finite(value.scaleY, `${path}.scaleY`, { min: 1, max: 1000 });
    return { scaleX, scaleY, preserveAspect };
  }
  if (type === "REPLACE_TEXT") return { text: text(value.text, `${path}.text`, 2000) };
  if (type === "SET_TEXT_COLOR") return { color: normalizeRgb(value.color, `${path}.color`) };
  if (type === "CREATE_GROUP") return { name: text(value.name, `${path}.name`, 255) };
  if (type === "DUPLICATE_LAYER") return value.newName == null ? {} : { newName: text(value.newName, `${path}.newName`, 255) };
  if (type === "REPLACE_SMART_OBJECT") {
    assert(typeof value.assetRef === "string" && SAFE_ID.test(value.assetRef), "must be a safe asset reference", `${path}.assetRef`);
    const fitMode = value.fitMode || "ORIGINAL";
    const preserveTransform = value.preserveTransform !== false;
    assert(fitMode === "ORIGINAL", "only verified ORIGINAL fit mode is supported in V2", `${path}.fitMode`);
    assert(preserveTransform === true, "must be true in V2", `${path}.preserveTransform`);
    return { assetRef: value.assetRef, fitMode, preserveTransform };
  }
  if (type === "SAVE_COPY") {
    const format = String(value.format || "psd").toLowerCase();
    assert(["psd"].includes(format), "only verified PSD copy output is supported", `${path}.format`);
    return { format, suggestedName: value.suggestedName ? text(value.suggestedName, `${path}.suggestedName`, 128) : "anksen-design-copy.psd" };
  }
  if (type === "EXPORT_DOCUMENT") {
    const format = String(value.format || "png").toLowerCase();
    assert(["png", "jpg"].includes(format), "must be png or jpg", `${path}.format`);
    return {
      format,
      suggestedName: value.suggestedName ? text(value.suggestedName, `${path}.suggestedName`, 128) : `anksen-design-preview.${format}`,
      quality: format === "jpg" ? finite(value.quality ?? 12, `${path}.quality`, { min: 1, max: 12 }) : null
    };
  }
  return {};
}

function validateOperation(input, index = 0) {
  const path = `operations.${index}`;
  assert(input && typeof input === "object" && !Array.isArray(input), "must be an object", path);
  assertNoRawExecution(input, path);
  const operation = String(input.operation || "").toUpperCase();
  const definition = OPERATION_DEFINITIONS[operation];
  assert(definition, `unsupported operation: ${operation || "(empty)"}`, `${path}.operation`);
  const operationId = text(input.operationId || `op-${index + 1}`, `${path}.operationId`, 128);
  assert(SAFE_ID.test(operationId), "must contain only safe identifier characters", `${path}.operationId`);
  const idempotencyKey = text(input.idempotencyKey || operationId, `${path}.idempotencyKey`, 128);
  assert(SAFE_ID.test(idempotencyKey), "must contain only safe identifier characters", `${path}.idempotencyKey`);
  assert(input.timeoutMs == null, "per-operation timeout is not supported because Photoshop host calls cannot be safely interrupted", `${path}.timeoutMs`);
  const target = normalizeTarget(input.target, definition.target === "layer", `${path}.target`);
  const parameters = normalizeParameters(operation, input.parameters || {}, `${path}.parameters`);
  if (input.risk != null) assert(String(input.risk).toUpperCase() === definition.risk, `must match derived risk ${definition.risk}`, `${path}.risk`);
  return Object.freeze({
    operationId,
    operation,
    target,
    parameters: Object.freeze(parameters),
    risk: definition.risk,
    write: definition.write,
    idempotencyKey,
    expectedResult: input.expectedResult ? text(input.expectedResult, `${path}.expectedResult`, 500) : null
  });
}

function validateOperationPlan(input, options = {}) {
  assert(Array.isArray(input), "operations must be an array", "operations");
  assert(input.length > 0, "must contain at least one operation", "operations");
  assert(input.length <= (options.maxOperations || 100), `must contain at most ${options.maxOperations || 100} operations`, "operations");
  const operations = input.map(validateOperation);
  const ids = new Set();
  const idempotencyKeys = new Set();
  let outputPhase = false;
  for (const operation of operations) {
    assert(!ids.has(operation.operationId), "operationId must be unique", `operations.${operation.operationId}`);
    assert(!idempotencyKeys.has(operation.idempotencyKey), "idempotencyKey must be unique", `operations.${operation.operationId}`);
    ids.add(operation.operationId);
    idempotencyKeys.add(operation.idempotencyKey);
    const isOutput = operation.operation === "SAVE_COPY" || operation.operation === "EXPORT_DOCUMENT";
    if (!isOutput) assert(!outputPhase, "all output operations must form the terminal suffix of the plan", `operations.${operation.operationId}`);
    else outputPhase = true;
  }
  const writes = operations.filter(item => item.write);
  return Object.freeze({
    schemaVersion: 1,
    operations: Object.freeze(operations),
    summary: Object.freeze({
      total: operations.length,
      reads: operations.length - writes.length,
      writes: writes.length,
      highRisk: operations.filter(item => item.risk === "HIGH").length,
      requiresApproval: writes.length > 0
    })
  });
}

module.exports = {
  OPERATION_DEFINITIONS,
  OperationValidationError,
  assertNoRawExecution,
  validateOperation,
  validateOperationPlan
};
