"use strict";

const { findLayer, inspectDocument, inspectLayer, layerType } = require("./document-inspector.cjs");
const { validateOperationPlan } = require("./operation-dsl.cjs");

function resolvePhotoshop(dependencies = {}) {
  return dependencies.photoshop || require("photoshop");
}

function resolveUxp(dependencies = {}) {
  return dependencies.uxp || require("uxp");
}

function toPhotoshopMode(constants, mode) {
  return mode === "CMYK" ? constants.NewDocumentMode.CMYK : constants.NewDocumentMode.RGB;
}

function solidColor(app, rgb) {
  const color = new app.SolidColor();
  color.rgb.red = rgb.red;
  color.rgb.green = rgb.green;
  color.rgb.blue = rgb.blue;
  return color;
}

function describeError(error) {
  if (error && typeof error.message === "string" && error.message) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

async function createTextLayer(doc, spec, text, name, app) {
  const layer = await doc.createTextLayer({
    name,
    contents: text,
    fontSize: spec.fontSize,
    position: { x: spec.x, y: spec.y },
    textColor: solidColor(app, spec.color)
  });
  return layer;
}

async function createBrandBackground(action, width, height) {
  await action.batchPlay([
    {
      _obj: "make",
      _target: [{ _ref: "contentLayer" }],
      using: {
        _obj: "contentLayer",
        type: {
          _obj: "gradientLayer",
          angle: { _unit: "angleUnit", _value: 90 },
          type: { _enum: "gradientType", _value: "linear" },
          gradient: {
            _obj: "gradientClassEvent",
            name: "ANKSEN Blue White",
            gradientForm: { _enum: "gradientForm", _value: "customStops" },
            interfaceIconFrameDimmed: 4096,
            colors: [
              { _obj: "colorStop", color: { _obj: "RGBColor", red: 255, green: 255, blue: 255 }, type: { _enum: "colorStopType", _value: "userStop" }, location: 0, midpoint: 50 },
              { _obj: "colorStop", color: { _obj: "RGBColor", red: 222, green: 237, blue: 255 }, type: { _enum: "colorStopType", _value: "userStop" }, location: 4096, midpoint: 50 }
            ],
            transparency: [
              { _obj: "transferSpec", opacity: { _unit: "percentUnit", _value: 100 }, location: 0, midpoint: 50 },
              { _obj: "transferSpec", opacity: { _unit: "percentUnit", _value: 100 }, location: 4096, midpoint: 50 }
            ]
          }
        }
      },
      layerID: 1,
      _isCommand: true
    }
  ], {});
  return { width, height };
}

async function placeLogo(doc, logoEntry, layout, dependencies) {
  if (!logoEntry) return null;
  const { app, action, constants } = resolvePhotoshop(dependencies);
  const token = resolveUxp(dependencies).storage.localFileSystem.createSessionToken(logoEntry);
  await action.batchPlay([
    {
      _obj: "placeEvent",
      null: { _path: token, _kind: "local" },
      linked: false,
      _isCommand: true
    }
  ], {});
  const logo = doc.activeLayers[0];
  if (logo) {
    logo.name = "01_LOGO_金湖科创产业园";
    const bounds = logo.bounds;
    const currentWidth = Number(bounds.right) - Number(bounds.left);
    if (currentWidth > 0) {
      const scale = (layout.logo.width / currentWidth) * 100;
      await logo.scale(scale, scale, constants.AnchorPosition.MIDDLECENTER);
      const next = logo.bounds;
      await logo.translate(layout.logo.x - Number(next.left), layout.logo.y - Number(next.top));
    }
    try { logo.blendMode = constants.BlendMode.MULTIPLY; } catch {
      // Older hosts may not expose BlendMode on placed layers. The source
      // remains editable and the production JSX applies the same correction.
    }
  }
  return logo;
}

async function placeImageAsCover(doc, entry, layout, dependencies) {
  if (!entry) return null;
  const { action, constants } = resolvePhotoshop(dependencies);
  const token = resolveUxp(dependencies).storage.localFileSystem.createSessionToken(entry);
  await action.batchPlay([{ _obj: "placeEvent", null: { _path: token, _kind: "local" }, linked: false, _isCommand: true }], {});
  const layer = doc.activeLayers[0];
  if (!layer) throw new Error("Placed key visual did not create an active layer.");
  layer.name = "00_KEY_VISUAL_AI_主视觉智能对象";
  const bounds = layer.bounds;
  const currentWidth = Number(bounds.right) - Number(bounds.left);
  const currentHeight = Number(bounds.bottom) - Number(bounds.top);
  if (currentWidth <= 0 || currentHeight <= 0) throw new Error("Placed key visual has invalid bounds.");
  const scale = Math.max(layout.width / currentWidth, layout.height / currentHeight) * 100;
  await layer.scale(scale, scale, constants.AnchorPosition.MIDDLECENTER);
  const next = layer.bounds;
  const nextWidth = Number(next.right) - Number(next.left);
  const nextHeight = Number(next.bottom) - Number(next.top);
  await layer.translate((layout.width - nextWidth) / 2 - Number(next.left), (layout.height - nextHeight) / 2 - Number(next.top));
  return layer;
}

async function renderPoster(job, layout, options = {}, dependencies = {}) {
  if (!options.approved) throw new Error("Human approval is required before Photoshop execution.");
  const photoshop = resolvePhotoshop(dependencies);
  const { app, core, action, constants } = photoshop;

  let stage = "execute_modal";
  try {
    return await core.executeAsModal(async executionContext => {
    stage = "create_document";
    const doc = await app.createDocument({
      width: layout.width,
      height: layout.height,
      resolution: job.document.resolution,
      mode: toPhotoshopMode(constants, job.document.colorMode),
      fill: constants.DocumentFill.WHITE,
      name: `${job.jobId}-${job.templateId}`
    });
    let suspension = null;
    try {
      suspension = await executionContext.hostControl.suspendHistory({
        documentID: doc.id,
        name: "ANKSEN：生成金湖创新之门展板"
      });
    } catch {
      // Photoshop 27.9 can reject suspendHistory for a just-created document.
      // The surrounding executeAsModal transaction still governs all writes.
    }
    let commitHistory = false;
    try {
      stage = "create_brand_background";
      if (options.keyVisualEntry) {
        const keyVisual = await placeImageAsCover(doc, options.keyVisualEntry, layout, dependencies);
        await doc.createLayerGroup({ name: "00_VISUAL_主视觉与氛围", fromLayers: [keyVisual] });
      } else {
        await createBrandBackground(action, layout.width, layout.height);
        if (doc.activeLayers[0]) doc.activeLayers[0].name = "00_BACKGROUND_蓝白品牌渐变";
      }

      stage = "place_logo";
      const logo = await placeLogo(doc, options.logoEntry, layout, dependencies);
      stage = "group_brand";
      await doc.createLayerGroup({ name: "01_BRAND_品牌标识", ...(logo ? { fromLayers: [logo] } : {}) });

      stage = "create_copy_layers";
      const copyLayers = [];
      copyLayers.push(await createTextLayer(doc, layout.title, job.content.title, "10_TITLE_园区名称", app));
      copyLayers.push(await createTextLayer(doc, layout.subtitle, job.content.subtitle, "11_SUBTITLE_主题标语", app));
      for (let i = 0; i < job.content.features.length; i += 1) {
        copyLayers.push(await createTextLayer(doc, layout.features[i], job.content.features[i], `20_FEATURE_${i + 1}`, app));
      }
      copyLayers.push(await createTextLayer(doc, layout.slogan, job.content.slogan, "30_SLOGAN_底部口号", app));
      stage = "group_copy";
      await doc.createLayerGroup({ name: "02_COPY_可编辑文字", fromLayers: copyLayers });
      commitHistory = true;
      return doc;
    } catch (error) {
      throw new Error(`${stage}: ${describeError(error)}`);
    } finally {
      try {
        if (suspension) await executionContext.hostControl.resumeHistory(suspension, commitHistory);
      } catch (error) {
        if (commitHistory) throw new Error(`resume_history: ${describeError(error)}`);
      }
    }
    }, { commandName: "生成金湖创新之门展板", interactiveMode: false });
  } catch (error) {
    throw new Error(`${stage}: ${describeError(error)}`);
  }
}

async function saveDocument(doc, format, dependencies = {}) {
  const { core } = resolvePhotoshop(dependencies);
  const fs = resolveUxp(dependencies).storage.localFileSystem;
  const extension = format === "psd" ? "psd" : format === "jpg" ? "jpg" : "png";
  const entry = await fs.getFileForSaving(`jinhu-science-innovation-park.${extension}`, { types: [extension] });
  if (!entry) return null;
  return core.executeAsModal(async () => {
    if (format === "psd") await doc.saveAs.psd(entry, { embedColorProfile: true }, false);
    else if (format === "jpg") await doc.saveAs.jpg(entry, { quality: 12 }, true);
    else await doc.saveAs.png(entry, {}, true);
    return entry;
  }, { commandName: `导出 ${extension.toUpperCase()}` });
}

function snapshotLayer(layer) {
  if (!layer) return null;
  return inspectLayer(layer);
}

function operationEntry(options, operation) {
  const entry = options.outputEntries?.[operation.operationId] || options.assetEntries?.[operation.parameters?.assetRef];
  if (!entry) throw new Error(`A user-selected file entry is required for ${operation.operationId}.`);
  return entry;
}

async function selectLayer(doc, layer, action) {
  try {
    doc.activeLayers = [layer];
  } catch {
    await action.batchPlay([{
      _obj: "select",
      _target: [{ _ref: "layer", _id: layer.id }],
      makeVisible: false,
      _options: { dialogOptions: "dontDisplay" }
    }], {});
  }
}

async function replaceSmartObject(doc, layer, operation, options, dependencies) {
  if (layerType(layer) !== "SMART_OBJECT") throw new Error(`Layer ${layer.name} is not a smart object.`);
  const photoshop = resolvePhotoshop(dependencies);
  const entry = operationEntry(options, operation);
  const token = resolveUxp(dependencies).storage.localFileSystem.createSessionToken(entry);
  await selectLayer(doc, layer, photoshop.action);
  await photoshop.action.batchPlay([{
    _obj: "placedLayerReplaceContents",
    null: { _path: token, _kind: "local" },
    _options: { dialogOptions: "dontDisplay" }
  }], {});
  return { assetRef: operation.parameters.assetRef, fitMode: operation.parameters.fitMode, preserveTransform: operation.parameters.preserveTransform };
}

async function saveToSelectedEntry(doc, operation, options) {
  const entry = operationEntry(options, operation);
  const format = operation.parameters.format;
  if (operation.operation === "SAVE_COPY" && format === "psd") await doc.saveAs.psd(entry, { embedColorProfile: true }, true);
  else if (format === "jpg") await doc.saveAs.jpg(entry, { quality: operation.parameters.quality || 12 }, true);
  else if (format === "png") await doc.saveAs.png(entry, {}, true);
  else throw new Error(`Unsupported selected output format: ${format}`);
  return { name: entry.name, format };
}

async function applyOperation(doc, operation, options = {}, dependencies = {}) {
  const { app, action, constants } = resolvePhotoshop(dependencies);
  if (operation.operation === "INSPECT_DOCUMENT") return inspectDocument(doc);
  if (operation.operation === "CREATE_GROUP") {
    const group = await doc.createLayerGroup({ name: operation.parameters.name });
    return snapshotLayer(group);
  }
  if (operation.operation === "SAVE_COPY" || operation.operation === "EXPORT_DOCUMENT") return saveToSelectedEntry(doc, operation, options);
  const layer = findLayer(doc, operation.target);
  if (!layer) throw new Error(`Target layer was not found for ${operation.operationId}.`);
  if (operation.operation === "SELECT_LAYER") {
    await selectLayer(doc, layer, action);
    return snapshotLayer(layer);
  }
  if (operation.operation === "RENAME_LAYER") layer.name = operation.parameters.name;
  else if (operation.operation === "SET_VISIBILITY") layer.visible = operation.parameters.visible;
  else if (operation.operation === "MOVE_LAYER") await layer.translate(operation.parameters.deltaX, operation.parameters.deltaY);
  else if (operation.operation === "RESIZE_LAYER") await layer.scale(operation.parameters.scaleX, operation.parameters.scaleY, constants.AnchorPosition.MIDDLECENTER);
  else if (operation.operation === "DUPLICATE_LAYER") {
    const copy = await layer.duplicate();
    if (operation.parameters.newName) copy.name = operation.parameters.newName;
    return snapshotLayer(copy);
  }
  else if (operation.operation === "REPLACE_TEXT") {
    if (layerType(layer) !== "TEXT" || !layer.textItem) throw new Error(`Layer ${layer.name} is not an editable text layer.`);
    layer.textItem.contents = operation.parameters.text;
  }
  else if (operation.operation === "SET_TEXT_COLOR") {
    if (layerType(layer) !== "TEXT" || !layer.textItem?.characterStyle) throw new Error(`Layer ${layer.name} does not expose editable character style.`);
    layer.textItem.characterStyle.color = solidColor(app, operation.parameters.color);
  }
  else if (operation.operation === "REPLACE_SMART_OBJECT") return replaceSmartObject(doc, layer, operation, options, dependencies);
  else throw new Error(`No executor is registered for ${operation.operation}.`);
  return snapshotLayer(layer);
}

async function executeOperationPlan(document, inputOperations, options = {}, dependencies = {}) {
  if (!options.approved) throw new Error("Human approval is required before Photoshop execution.");
  const plan = validateOperationPlan(inputOperations);
  const photoshop = resolvePhotoshop(dependencies);
  const { core } = photoshop;
  const results = [];
  const newlyCompletedKeys = [];
  let failedOperation = null;
  try {
    await core.executeAsModal(async executionContext => {
      let suspension = null;
      let commit = false;
      try {
        try {
          suspension = await executionContext.hostControl.suspendHistory({ documentID: document.id, name: options.historyName || "ANKSEN：执行受控设计操作" });
        } catch {
          // A newly created document may reject history suspension. Modal execution remains mandatory.
        }
        for (let index = 0; index < plan.operations.length; index += 1) {
          const operation = plan.operations[index];
          failedOperation = operation;
          if (executionContext.isCancelled || options.isCancelled?.()) throw new Error("USER_CANCELLED");
          const alwaysRewriteOutput = operation.operation === "SAVE_COPY" || operation.operation === "EXPORT_DOCUMENT";
          if (!alwaysRewriteOutput && options.completedIdempotencyKeys?.has(operation.idempotencyKey)) {
            results.push({ operationId: operation.operationId, operation: operation.operation, idempotencyKey: operation.idempotencyKey, status: "SKIPPED_IDEMPOTENT", risk: operation.risk, durationMs: 0, before: null, after: null, rollbackHint: null });
            continue;
          }
          executionContext.reportProgress?.({ value: index / plan.operations.length, commandName: `执行 ${operation.operation}` });
          const layer = operation.target ? findLayer(document, operation.target) : null;
          const before = layer ? snapshotLayer(layer) : operation.operation === "INSPECT_DOCUMENT" ? inspectDocument(document) : null;
          const isOutput = operation.operation === "SAVE_COPY" || operation.operation === "EXPORT_DOCUMENT";
          if (isOutput) {
            if (typeof options.preflightBeforeOutput !== "function") throw new Error("PREFLIGHT_REQUIRED_BEFORE_OUTPUT");
            const preflight = await options.preflightBeforeOutput({ document, operation });
            if (!preflight || preflight.exportAllowed !== true || preflight.disposition === "BLOCKED") throw new Error("PREFLIGHT_BLOCKED_OUTPUT");
          }
          const startedAt = Date.now();
          const output = await applyOperation(document, operation, options, dependencies);
          const durationMs = Date.now() - startedAt;
          results.push({
            operationId: operation.operationId,
            operation: operation.operation,
            idempotencyKey: operation.idempotencyKey,
            status: "COMPLETED",
            risk: operation.risk,
            durationMs,
            before,
            after: output,
            rollbackHint: operation.write ? "Use the single ANKSEN history step or discard the unsaved document copy." : null
          });
          newlyCompletedKeys.push(operation.idempotencyKey);
        }
        executionContext.reportProgress?.({ value: 1, commandName: "完成受控设计操作" });
        commit = true;
      } finally {
        if (suspension) await executionContext.hostControl.resumeHistory(suspension, commit);
      }
    }, { commandName: options.commandName || "ANKSEN 受控设计生产", timeOut: options.modalTimeoutSeconds || 10 });
  } catch (error) {
    const wrapped = new Error(`${failedOperation?.operationId || "operation-plan"}: ${describeError(error)}`);
    wrapped.operationResults = results;
    wrapped.failedOperation = failedOperation;
    throw wrapped;
  }
  for (const key of newlyCompletedKeys) options.onOperationCompleted?.(key);
  return { schemaVersion: 1, status: "COMPLETED", plan: plan.summary, results, inspection: inspectDocument(document) };
}

module.exports = {
  applyOperation,
  createBrandBackground,
  executeOperationPlan,
  renderPoster,
  placeImageAsCover,
  saveDocument,
  selectLayer,
  solidColor
};
