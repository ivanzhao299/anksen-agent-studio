"use strict";

const { CAPABILITIES, capabilityProfile, getCapability } = require("./capability-registry.cjs");

const OPERATION_DEFINITIONS = CAPABILITIES;

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
  const hasNodeOutput = typeof value.nodeOutput === "string" && value.nodeOutput.trim().length > 0;
  assert(Number(hasId) + Number(hasName) + Number(hasNodeOutput) === 1, "provide exactly one of layerId, layerName, or nodeOutput", path);
  if (hasId) return { layerId: value.layerId };
  if (hasName) return { layerName: text(value.layerName, `${path}.layerName`, 255) };
  const nodeOutput = text(value.nodeOutput, `${path}.nodeOutput`, 128);
  assert(SAFE_ID.test(nodeOutput), "must contain only safe identifier characters", `${path}.nodeOutput`);
  return { nodeOutput };
}

function normalizeRgb(value, path) {
  assert(value && typeof value === "object" && !Array.isArray(value), "must be an RGB object", path);
  const channel = name => {
    assert(Number.isInteger(value[name]) && value[name] >= 0 && value[name] <= 255, "must be an integer from 0 to 255", `${path}.${name}`);
    return value[name];
  };
  return { red: channel("red"), green: channel("green"), blue: channel("blue") };
}

function normalizePoint(value, path) {
  assert(value && typeof value === "object" && !Array.isArray(value), "must be a point object", path);
  return { x: finite(value.x, `${path}.x`), y: finite(value.y, `${path}.y`) };
}

function normalizeBounds(value, path) {
  assert(value && typeof value === "object" && !Array.isArray(value), "must be a bounds object", path);
  const left = finite(value.left, `${path}.left`);
  const top = finite(value.top, `${path}.top`);
  const right = finite(value.right, `${path}.right`);
  const bottom = finite(value.bottom, `${path}.bottom`);
  assert(right > left, "must be greater than left", `${path}.right`);
  assert(bottom > top, "must be greater than top", `${path}.bottom`);
  return { left, top, right, bottom };
}

function optionalBoolean(value, path) {
  if (value == null) return null;
  assert(typeof value === "boolean", "must be a boolean", path);
  return value;
}

function normalizeSelectionOptions(value, path) {
  return {
    feather: finite(value.feather ?? 0, `${path}.feather`, { min: 0, max: 1000 }),
    antialias: value.antialias !== false
  };
}

function normalizeAdjustment(value, path) {
  const type = String(value.type || "").toUpperCase();
  assert(["BRIGHTNESS_CONTRAST", "HUE_SATURATION", "EXPOSURE", "CURVES"].includes(type), "must be BRIGHTNESS_CONTRAST, HUE_SATURATION, EXPOSURE, or CURVES", `${path}.type`);
  const name = value.name ? text(value.name, `${path}.name`, 255) : `ADJ_${type}`;
  const settings = value.settings || {};
  assert(settings && typeof settings === "object" && !Array.isArray(settings), "must be an object", `${path}.settings`);
  if (type === "BRIGHTNESS_CONTRAST") return { type, name, settings: { brightness: finite(settings.brightness ?? 0, `${path}.settings.brightness`, { min: -150, max: 150 }), contrast: finite(settings.contrast ?? 0, `${path}.settings.contrast`, { min: -100, max: 100 }), useLegacy: settings.useLegacy === true } };
  if (type === "HUE_SATURATION") return { type, name, settings: { hue: finite(settings.hue ?? 0, `${path}.settings.hue`, { min: -180, max: 180 }), saturation: finite(settings.saturation ?? 0, `${path}.settings.saturation`, { min: -100, max: 100 }), lightness: finite(settings.lightness ?? 0, `${path}.settings.lightness`, { min: -100, max: 100 }), colorize: settings.colorize === true } };
  if (type === "EXPOSURE") return { type, name, settings: { exposure: finite(settings.exposure ?? 0, `${path}.settings.exposure`, { min: -20, max: 20 }), offset: finite(settings.offset ?? 0, `${path}.settings.offset`, { min: -0.5, max: 0.5 }), gammaCorrection: finite(settings.gammaCorrection ?? 1, `${path}.settings.gammaCorrection`, { min: 0.01, max: 9.99 }) } };
  const points = settings.points || [{ input: 0, output: 0 }, { input: 255, output: 255 }];
  assert(Array.isArray(points) && points.length >= 2 && points.length <= 32, "must contain 2 to 32 curve points", `${path}.settings.points`);
  return { type, name, settings: { points: points.map((point, index) => ({ input: finite(point.input, `${path}.settings.points.${index}.input`, { min: 0, max: 255 }), output: finite(point.output, `${path}.settings.points.${index}.output`, { min: 0, max: 255 }) })) } };
}

function normalizeFilter(value, path) {
  const type = String(value.type || "").toUpperCase();
  assert(["GAUSSIAN_BLUR", "UNSHARP_MASK", "ADD_NOISE", "MOTION_BLUR"].includes(type), "unsupported production filter", `${path}.type`);
  if (type === "GAUSSIAN_BLUR") return { type, radius: finite(value.radius, `${path}.radius`, { min: 0.1, max: 1000 }) };
  if (type === "UNSHARP_MASK") return { type, amount: finite(value.amount, `${path}.amount`, { min: 1, max: 500 }), radius: finite(value.radius, `${path}.radius`, { min: 0.1, max: 1000 }), threshold: finite(value.threshold ?? 0, `${path}.threshold`, { min: 0, max: 255 }) };
  if (type === "ADD_NOISE") {
    const distribution = String(value.distribution || "GAUSSIAN").toUpperCase();
    assert(["GAUSSIAN", "UNIFORM"].includes(distribution), "must be GAUSSIAN or UNIFORM", `${path}.distribution`);
    return { type, amount: finite(value.amount, `${path}.amount`, { min: 0.1, max: 400 }), distribution, monochromatic: value.monochromatic !== false };
  }
  return { type, angle: finite(value.angle ?? 0, `${path}.angle`, { min: -360, max: 360 }), distance: finite(value.distance, `${path}.distance`, { min: 1, max: 2000 }) };
}

function normalizeParameters(type, value = {}, path = "parameters") {
  assert(value && typeof value === "object" && !Array.isArray(value), "must be an object", path);
  if (type === "RENAME_LAYER") return { name: text(value.name, `${path}.name`, 255) };
  if (type === "SET_VISIBILITY") {
    assert(typeof value.visible === "boolean", "must be a boolean", `${path}.visible`);
    return { visible: value.visible };
  }
  if (type === "SET_OPACITY") return { opacity: finite(value.opacity, `${path}.opacity`, { min: 0, max: 100 }) };
  if (type === "SET_BLEND_MODE") {
    const blendMode = String(value.blendMode || "").toUpperCase();
    assert(["NORMAL", "MULTIPLY", "SCREEN", "OVERLAY", "SOFT_LIGHT", "HARD_LIGHT", "COLOR_DODGE", "COLOR_BURN", "LINEAR_DODGE", "LINEAR_BURN", "DARKEN", "LIGHTEN", "DIFFERENCE", "EXCLUSION", "HUE", "SATURATION", "COLOR", "LUMINOSITY"].includes(blendMode), "unsupported blend mode", `${path}.blendMode`);
    return { blendMode };
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
  if (type === "ROTATE_LAYER") return { angle: finite(value.angle, `${path}.angle`, { min: -360, max: 360 }) };
  if (type === "REPLACE_TEXT") return { text: text(value.text, `${path}.text`, 2000) };
  if (type === "SET_TEXT_COLOR") return { color: normalizeRgb(value.color, `${path}.color`) };
  if (type === "SET_TEXT_STYLE") {
    const alignment = value.alignment == null ? null : String(value.alignment).toUpperCase();
    if (alignment) assert(["LEFT", "CENTER", "RIGHT", "JUSTIFY"].includes(alignment), "unsupported alignment", `${path}.alignment`);
    return {
      fontSize: value.fontSize == null ? null : finite(value.fontSize, `${path}.fontSize`, { min: 1, max: 2000 }),
      fontFamily: value.fontFamily == null ? null : text(value.fontFamily, `${path}.fontFamily`, 255),
      tracking: value.tracking == null ? null : finite(value.tracking, `${path}.tracking`, { min: -1000, max: 10000 }),
      leading: value.leading == null ? null : finite(value.leading, `${path}.leading`, { min: 0, max: 5000 }),
      horizontalScale: value.horizontalScale == null ? null : finite(value.horizontalScale, `${path}.horizontalScale`, { min: 1, max: 1000 }),
      verticalScale: value.verticalScale == null ? null : finite(value.verticalScale, `${path}.verticalScale`, { min: 1, max: 1000 }),
      fauxBold: optionalBoolean(value.fauxBold, `${path}.fauxBold`),
      fauxItalic: optionalBoolean(value.fauxItalic, `${path}.fauxItalic`),
      alignment
    };
  }
  if (type === "CREATE_GROUP") return { name: text(value.name, `${path}.name`, 255) };
  if (type === "CREATE_PIXEL_LAYER") return { name: text(value.name, `${path}.name`, 255), opacity: finite(value.opacity ?? 100, `${path}.opacity`, { min: 0, max: 100 }) };
  if (type === "CREATE_TEXT_LAYER") return { name: text(value.name, `${path}.name`, 255), text: text(value.text, `${path}.text`, 10000), position: normalizePoint(value.position, `${path}.position`), fontSize: finite(value.fontSize, `${path}.fontSize`, { min: 1, max: 2000 }), color: normalizeRgb(value.color, `${path}.color`), fontFamily: value.fontFamily == null ? null : text(value.fontFamily, `${path}.fontFamily`, 255) };
  if (type === "CREATE_SOLID_FILL_LAYER") return { name: text(value.name, `${path}.name`, 255), color: normalizeRgb(value.color, `${path}.color`), opacity: finite(value.opacity ?? 100, `${path}.opacity`, { min: 0, max: 100 }) };
  if (type === "DUPLICATE_LAYER") return value.newName == null ? {} : { newName: text(value.newName, `${path}.newName`, 255) };
  if (type === "RASTERIZE_LAYER" || type === "CONVERT_TO_SMART_OBJECT" || type === "CREATE_REVEAL_SELECTION_MASK" || type === "APPLY_LAYER_MASK" || type === "DESELECT") return {};
  if (type === "PLACE_AS_SMART_OBJECT") {
    assert(typeof value.assetRef === "string" && SAFE_ID.test(value.assetRef), "must be a safe asset reference", `${path}.assetRef`);
    return { assetRef: value.assetRef, name: value.name == null ? null : text(value.name, `${path}.name`, 255), linked: value.linked === true };
  }
  if (type === "REPLACE_SMART_OBJECT") {
    assert(typeof value.assetRef === "string" && SAFE_ID.test(value.assetRef), "must be a safe asset reference", `${path}.assetRef`);
    const fitMode = value.fitMode || "ORIGINAL";
    const preserveTransform = value.preserveTransform !== false;
    assert(fitMode === "ORIGINAL", "only verified ORIGINAL fit mode is supported in V2", `${path}.fitMode`);
    assert(preserveTransform === true, "must be true in V2", `${path}.preserveTransform`);
    return { assetRef: value.assetRef, fitMode, preserveTransform };
  }
  if (type === "CREATE_RECT_SELECTION" || type === "CREATE_ELLIPSE_SELECTION") return { bounds: normalizeBounds(value.bounds, `${path}.bounds`), ...normalizeSelectionOptions(value, path) };
  if (type === "CREATE_POLYGON_SELECTION") {
    assert(Array.isArray(value.points) && value.points.length >= 3 && value.points.length <= 128, "must contain 3 to 128 points", `${path}.points`);
    return { points: value.points.map((point, index) => normalizePoint(point, `${path}.points.${index}`)), ...normalizeSelectionOptions(value, path) };
  }
  if (type === "CREATE_WORK_PATH_FROM_SELECTION") return { tolerance: finite(value.tolerance ?? 2, `${path}.tolerance`, { min: 0.5, max: 10 }) };
  if (type === "LOAD_WORK_PATH_AS_SELECTION") return normalizeSelectionOptions(value, path);
  if (type === "CREATE_ADJUSTMENT_LAYER") return normalizeAdjustment(value, path);
  if (type === "APPLY_FILTER") return normalizeFilter(value, path);
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
  const definition = getCapability(operation);
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
    }),
    capabilityProfile: capabilityProfile(operations)
  });
}

module.exports = {
  OPERATION_DEFINITIONS,
  OperationValidationError,
  assertNoRawExecution,
  validateOperation,
  validateOperationPlan
};
