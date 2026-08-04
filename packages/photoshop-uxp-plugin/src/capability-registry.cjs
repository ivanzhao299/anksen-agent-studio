"use strict";

// Photoshop capabilities are document-local commands executed inside one
// already-governed Studio task. This registry is not a Planner, Scheduler,
// Runtime, queue, or state machine.
const CAPABILITY_REGISTRY_VERSION = "1.0.0";
const PHOTOSHOP_27_9_ACCEPTANCE = "PHOTOSHOP_27_9_MACOS_2026-08-04:anksen-capability-v3-20260804-002631";

const CAPABILITIES = Object.freeze({
  INSPECT_DOCUMENT: capability("document.inspect", "READ_ONLY", "document", false, "DOCUMENT_ANALYSIS", "DOM", "VERIFIED"),
  SELECT_LAYER: capability("layer.select", "READ_ONLY", "layer", false, "DOCUMENT_ANALYSIS", "DOM", "VERIFIED"),
  RENAME_LAYER: capability("layer.rename", "MEDIUM", "layer", true, "LAYER_STRUCTURE", "DOM", "VERIFIED"),
  SET_VISIBILITY: capability("layer.visibility", "MEDIUM", "layer", true, "LAYER_STRUCTURE", "DOM", "VERIFIED"),
  SET_OPACITY: capability("layer.opacity", "MEDIUM", "layer", true, "SPATIAL_DEPTH", "DOM", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  SET_BLEND_MODE: capability("layer.blend-mode", "MEDIUM", "layer", true, "COLOR_GRADE", "DOM", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  MOVE_LAYER: capability("layer.move", "MEDIUM", "layer", true, "SPATIAL_DEPTH", "DOM", "VERIFIED"),
  RESIZE_LAYER: capability("layer.resize", "MEDIUM", "layer", true, "SPATIAL_DEPTH", "DOM", "VERIFIED"),
  ROTATE_LAYER: capability("layer.rotate", "MEDIUM", "layer", true, "SPATIAL_DEPTH", "DOM", "HOST_ACCEPTANCE_REQUIRED"),
  DUPLICATE_LAYER: capability("layer.duplicate", "MEDIUM", "layer", true, "LAYER_STRUCTURE", "DOM", "VERIFIED"),
  RASTERIZE_LAYER: capability("layer.rasterize", "HIGH", "layer", true, "MATERIAL_DETAIL", "BATCH_PLAY", "HOST_ACCEPTANCE_REQUIRED"),
  CONVERT_TO_SMART_OBJECT: capability("smart-object.convert", "HIGH", "layer", true, "HERO_COMPOSITE", "BATCH_PLAY", "HOST_ACCEPTANCE_REQUIRED"),
  REPLACE_TEXT: capability("text.replace", "MEDIUM", "layer", true, "TYPOGRAPHY", "DOM", "VERIFIED"),
  SET_TEXT_COLOR: capability("text.color", "MEDIUM", "layer", true, "TYPOGRAPHY", "DOM", "VERIFIED"),
  SET_TEXT_STYLE: capability("text.style", "MEDIUM", "layer", true, "TYPOGRAPHY", "DOM", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  CREATE_GROUP: capability("group.create", "MEDIUM", "document", true, "LAYER_STRUCTURE", "DOM", "VERIFIED"),
  CREATE_PIXEL_LAYER: capability("pixel-layer.create", "MEDIUM", "document", true, "LAYER_STRUCTURE", "DOM", "HOST_ACCEPTANCE_REQUIRED"),
  CREATE_TEXT_LAYER: capability("text-layer.create", "MEDIUM", "document", true, "TYPOGRAPHY", "DOM", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  CREATE_SOLID_FILL_LAYER: capability("fill-layer.solid", "MEDIUM", "document", true, "COLOR_GRADE", "BATCH_PLAY", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  PLACE_AS_SMART_OBJECT: capability("smart-object.place", "HIGH", "document", true, "HERO_COMPOSITE", "BATCH_PLAY", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  REPLACE_SMART_OBJECT: capability("smart-object.replace", "HIGH", "layer", true, "HERO_COMPOSITE", "BATCH_PLAY", "VERIFIED"),
  CREATE_RECT_SELECTION: capability("selection.rectangle", "MEDIUM", "document", true, "MASKING", "DOM", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  CREATE_ELLIPSE_SELECTION: capability("selection.ellipse", "MEDIUM", "document", true, "MASKING", "BATCH_PLAY", "HOST_ACCEPTANCE_REQUIRED"),
  CREATE_POLYGON_SELECTION: capability("selection.polygon", "MEDIUM", "document", true, "MASKING", "DOM", "HOST_ACCEPTANCE_REQUIRED"),
  DESELECT: capability("selection.clear", "MEDIUM", "document", true, "MASKING", "DOM", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  CREATE_WORK_PATH_FROM_SELECTION: capability("path.from-selection", "MEDIUM", "document", true, "MASKING", "DOM", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  LOAD_WORK_PATH_AS_SELECTION: capability("path.to-selection", "MEDIUM", "document", true, "MASKING", "DOM", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  CREATE_REVEAL_SELECTION_MASK: capability("mask.reveal-selection", "MEDIUM", "layer", true, "MASKING", "BATCH_PLAY", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  APPLY_LAYER_MASK: capability("mask.apply", "HIGH", "layer", true, "MASKING", "BATCH_PLAY", "HOST_ACCEPTANCE_REQUIRED"),
  CREATE_ADJUSTMENT_LAYER: capability("adjustment.create", "MEDIUM", "document", true, "COLOR_GRADE", "BATCH_PLAY", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  APPLY_FILTER: capability("filter.apply", "HIGH", "layer", true, "MATERIAL_DETAIL", "BATCH_PLAY", "VERIFIED", PHOTOSHOP_27_9_ACCEPTANCE),
  SAVE_COPY: capability("output.psd", "HIGH", "document", true, "PRESS_OUTPUT", "DOM", "VERIFIED"),
  EXPORT_DOCUMENT: capability("output.raster", "HIGH", "document", true, "PRESS_OUTPUT", "DOM", "VERIFIED")
});

function capability(id, risk, target, write, intent, executor, hostStatus, hostEvidence = null) {
  return Object.freeze({ id, risk, target, write, intent, executor, hostStatus, hostEvidence });
}

function getCapability(operation) {
  return CAPABILITIES[String(operation || "").toUpperCase()] || null;
}

function listCapabilities(options = {}) {
  return Object.freeze(Object.entries(CAPABILITIES)
    .filter(([, value]) => !options.intent || value.intent === options.intent)
    .map(([operation, value]) => Object.freeze({ operation, ...value })));
}

function capabilityProfile(operations) {
  const values = operations.map(item => getCapability(item.operation)).filter(Boolean);
  return Object.freeze({
    registryVersion: CAPABILITY_REGISTRY_VERSION,
    operations: Object.freeze([...new Set(operations.map(item => item.operation))]),
    capabilityIds: Object.freeze([...new Set(values.map(item => item.id))]),
    intents: Object.freeze([...new Set(values.map(item => item.intent))]),
    hostEvidence: Object.freeze([...new Set(values.map(item => item.hostEvidence).filter(Boolean))]),
    hostAcceptanceRequired: Object.freeze([...new Set(operations
      .filter(item => getCapability(item.operation)?.hostStatus !== "VERIFIED")
      .map(item => item.operation))])
  });
}

module.exports = {
  CAPABILITIES,
  CAPABILITY_REGISTRY_VERSION,
  capabilityProfile,
  getCapability,
  listCapabilities
};
