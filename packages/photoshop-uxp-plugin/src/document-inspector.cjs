"use strict";

function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value.value === "number") return Number.isFinite(value.value) ? value.value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeRead(fn, fallback = null) {
  try {
    const value = fn();
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function layerType(layer) {
  const kind = String(safeRead(() => layer.kind, "")).toLowerCase();
  const constructorName = String(safeRead(() => layer.constructor.name, "")).toLowerCase();
  const value = `${kind} ${constructorName}`;
  if (value.includes("group")) return "GROUP";
  if (value.includes("text")) return "TEXT";
  if (value.includes("smart") || safeRead(() => layer.isSmartObject, false)) return "SMART_OBJECT";
  if (value.includes("adjust")) return "ADJUSTMENT";
  if (value.includes("shape") || value.includes("solidfill")) return "SHAPE";
  return "PIXEL";
}

function boundsOf(layer) {
  const bounds = safeRead(() => layer.bounds, null);
  if (!bounds) return null;
  const left = number(bounds.left);
  const top = number(bounds.top);
  const right = number(bounds.right);
  const bottom = number(bounds.bottom);
  if ([left, top, right, bottom].some(value => value == null)) return null;
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function textDetails(layer) {
  const contents = safeRead(() => layer.textItem.contents, safeRead(() => layer.textItem.text, null));
  if (contents == null) return null;
  const style = safeRead(() => layer.textItem.characterStyle, {});
  return {
    contents: String(contents).slice(0, 500),
    font: safeRead(() => style.fontName, safeRead(() => layer.textItem.font, null)),
    fontSize: number(safeRead(() => style.size, safeRead(() => style.fontSize, safeRead(() => layer.textItem.fontSize, null)))),
    horizontalScale: number(safeRead(() => style.horizontalScale, 100)) ?? 100,
    verticalScale: number(safeRead(() => style.verticalScale, 100)) ?? 100,
    missingFont: Boolean(safeRead(() => style.missingFont, false))
  };
}

function supportedOperations(type, editable) {
  if (!editable) return ["SELECT_LAYER"];
  const common = ["SELECT_LAYER", "RENAME_LAYER", "SET_VISIBILITY", "MOVE_LAYER", "RESIZE_LAYER", "DUPLICATE_LAYER"];
  if (type === "TEXT") return [...common, "REPLACE_TEXT", "SET_TEXT_COLOR"];
  if (type === "SMART_OBJECT") return [...common, "REPLACE_SMART_OBJECT"];
  return common;
}

function inspectLayer(layer, parentId = null, depth = 0) {
  const type = layerType(layer);
  const id = Number(safeRead(() => layer.id, 0));
  const editable = safeRead(() => layer.locked, false) !== true;
  const children = Array.from(safeRead(() => layer.layers, []) || []).map(child => inspectLayer(child, id || null, depth + 1));
  return {
    id: id || null,
    name: String(safeRead(() => layer.name, "Unnamed Layer")),
    type,
    parentId,
    depth,
    visible: safeRead(() => layer.visible, true) !== false,
    opacity: number(safeRead(() => layer.opacity, 100)) ?? 100,
    blendMode: String(safeRead(() => layer.blendMode, "normal")),
    bounds: boundsOf(layer),
    text: type === "TEXT" ? textDetails(layer) : null,
    smartObject: type === "SMART_OBJECT" ? { linked: Boolean(safeRead(() => layer.linked, false)) } : null,
    hasMask: Boolean(safeRead(() => layer.mask, null)),
    editable,
    supportedOperations: supportedOperations(type, editable),
    children
  };
}

function flattenLayerTree(nodes) {
  const result = [];
  const visit = node => {
    result.push(node);
    for (const child of node.children || []) visit(child);
  };
  for (const node of nodes || []) visit(node);
  return result;
}

function inspectDocument(document) {
  if (!document) throw new Error("An open Photoshop document is required.");
  const sourceLayers = safeRead(() => document.layerTree, null) || safeRead(() => document.layers, []);
  const layers = Array.from(sourceLayers || []).map(layer => inspectLayer(layer));
  const width = number(safeRead(() => document.width, null));
  const height = number(safeRead(() => document.height, null));
  return {
    schemaVersion: 1,
    document: {
      id: Number(safeRead(() => document.id, 0)) || null,
      name: String(safeRead(() => document.name, "Untitled")),
      width,
      height,
      resolution: number(safeRead(() => document.resolution, null)),
      colorMode: String(safeRead(() => document.mode, "UNKNOWN")).toUpperCase(),
      profile: safeRead(() => document.colorProfileName, null),
      saved: Boolean(safeRead(() => document.saved, false)),
      layerCount: flattenLayerTree(layers).length
    },
    layers
  };
}

function findLayer(document, target) {
  const all = [];
  const visit = layer => {
    all.push(layer);
    for (const child of Array.from(safeRead(() => layer.layers, []) || [])) visit(child);
  };
  const roots = safeRead(() => document.layerTree, null) || safeRead(() => document.layers, []);
  for (const layer of Array.from(roots || [])) visit(layer);
  if (target?.layerId) return all.find(layer => Number(safeRead(() => layer.id, 0)) === target.layerId) || null;
  if (target?.layerName) {
    const matches = all.filter(layer => String(safeRead(() => layer.name, "")) === target.layerName);
    if (matches.length > 1) throw new Error(`Layer name is ambiguous: ${target.layerName}`);
    return matches[0] || null;
  }
  return null;
}

module.exports = { boundsOf, findLayer, flattenLayerTree, inspectDocument, inspectLayer, layerType, safeRead };
