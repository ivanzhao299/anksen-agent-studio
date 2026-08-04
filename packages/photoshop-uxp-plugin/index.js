"use strict";

const { storage, entrypoints } = require("uxp");
const photoshop = require("photoshop");
const { validateJob } = require("./src/job-contract.cjs");
const { createLayout, sampleJob } = require("./src/jinhu-template.cjs");
const { inspectDocument: inspectPhotoshopDocument, flattenLayerTree } = require("./src/document-inspector.cjs");
const { runPreflight } = require("./src/preflight-review.cjs");
const { buildArtifactManifest } = require("./src/artifact-manifest.cjs");
const { assertApprovalBinding, createApprovalBinding } = require("./src/approval-binding.cjs");
const { assertHighRiskApprovalBinding, createHighRiskApprovalBinding, preflightAllowsOutput, preflightReportSha256 } = require("./src/preflight-approval.cjs");
const { executeOperationPlan, renderPoster, saveDocument } = require("./src/photoshop-executor.cjs");

const state = {
  busy: false,
  job: null,
  jobSource: null,
  approvalBinding: null,
  highRiskBinding: null,
  preflightReportSha256: null,
  document: null,
  inspection: null,
  preflight: null,
  executionResult: null,
  manifest: null,
  logoEntry: null,
  keyVisualEntry: null,
  assetEntries: {},
  outputEntries: {},
  producedEntries: []
};

entrypoints.setup({
  panels: { anksenStudioPanel: { show() {} } },
  commands: { runCapabilityAcceptance: () => runCapabilityAcceptance() }
});

const $ = id => document.getElementById(id);
const setText = (id, value) => { $(id).textContent = value == null ? "—" : String(value); };

function describeError(error) {
  return error && typeof error.message === "string" ? error.message : String(error);
}

async function runCapabilityAcceptance() {
  const createdEntries = [];
  try {
    const jobEntry = await storage.localFileSystem.getEntryWithUrl("plugin:/examples/capability-graph-v3.example.json");
    const job = validateJob(JSON.parse(await jobEntry.read()));
    const heroEntry = await storage.localFileSystem.getEntryWithUrl("plugin:/assets/jinhu-key-visual-v3.png");
    const outputFolder = await storage.localFileSystem.getFolder();
    if (!outputFolder) throw new Error("已取消能力验收输出文件夹选择。");
    const suffix = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
    const psdEntry = await outputFolder.createFile(`anksen-capability-v3-${suffix}.psd`, { overwrite: false });
    createdEntries.push(psdEntry);
    const pngEntry = await outputFolder.createFile(`anksen-capability-v3-${suffix}.png`, { overwrite: false });
    createdEntries.push(pngEntry);
    const manifestEntry = await outputFolder.createFile(`anksen-capability-v3-${suffix}-result.json`, { overwrite: false });
    createdEntries.push(manifestEntry);
    let latestPreflight = null;
    const executionResult = await executeOperationPlan(null, job.operations, {
      approved: true,
      assetEntries: { "hero-image": heroEntry },
      outputEntries: { "save-source": psdEntry, "export-preview": pngEntry },
      createDocument: { width: job.document.widthPx, height: job.document.heightPx, resolution: job.document.resolution, colorMode: job.document.colorMode, name: job.title },
      historyName: `ANKSEN V3 Host Acceptance · ${job.commandGraph.graphId}`,
      preflightBeforeOutput: async ({ document }) => {
        latestPreflight = runPreflight(inspectPhotoshopDocument(document), job);
        if (latestPreflight.disposition === "REQUIRES_CONFIRMATION") throw new Error("HOST_ACCEPTANCE_REQUIRES_REPORT_BOUND_CONFIRMATION");
        return latestPreflight;
      }
    });
    const document = executionResult.document;
    latestPreflight = runPreflight(inspectPhotoshopDocument(document), job);
    const approvalBinding = createApprovalBinding(job, document, { humanConfirmed: true });
    const manifest = await buildArtifactManifest({
      job,
      executionResult,
      preflight: latestPreflight,
      approvalBinding,
      outputEntries: [{ entry: psdEntry, format: "psd" }, { entry: pngEntry, format: "png" }]
    });
    await manifestEntry.write(`${JSON.stringify(manifest, null, 2)}\n`);
    await photoshop.app.showAlert(`ANKSEN V3 能力验收通过\n${job.operationSummary.total} 个命令 · ${manifest.artifacts.length} 个交付文件\n${psdEntry.name}\n${pngEntry.name}`);
    return manifest;
  } catch (error) {
    for (const entry of createdEntries) {
      try { await entry.delete(); } catch { /* Failed acceptance artifacts are best-effort cleaned up. */ }
    }
    await photoshop.app.showAlert(`ANKSEN V3 能力验收失败\n${describeError(error)}`);
    throw error;
  }
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const next = `[${timestamp}] ${message}`;
  setText("lastActivity", message);
  $("activityLog").textContent = `${next}\n${$("activityLog").textContent}`.slice(0, 16000);
}

async function withBusy(message, action) {
  if (state.busy) return null;
  state.busy = true;
  const controls = Array.from(document.querySelectorAll("button, input"));
  const disabledBefore = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  $("workbench").setAttribute("aria-busy", "true");
  $("busyOverlay").hidden = false;
  setText("busyMessage", message);
  try { return await action(); }
  catch (error) {
    log(`失败：${describeError(error)}`);
    $("toggleLog").setAttribute("aria-expanded", "true");
    $("activityLog").hidden = false;
    $("activityLog").setAttribute("role", "alert");
    return null;
  }
  finally {
    $("busyOverlay").hidden = true;
    $("workbench").setAttribute("aria-busy", "false");
    controls.forEach((control, index) => { control.disabled = disabledBefore[index]; });
    state.busy = false;
    updateActions();
  }
}

function switchTab(name) {
  for (const tab of document.querySelectorAll(".tab")) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.setAttribute("tabindex", active ? "0" : "-1");
  }
  for (const panel of document.querySelectorAll(".tab-panel")) {
    const active = panel.id === `panel-${name}`;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  }
}

function activeDocument() {
  const doc = photoshop.app.activeDocument;
  if (!doc) throw new Error("Photoshop 中没有打开的文档。请先打开或创建文档。");
  return doc;
}

function resetDerivedState() {
  state.executionResult = null;
  state.preflight = null;
  state.manifest = null;
  state.assetEntries = {};
  state.outputEntries = {};
  state.producedEntries = [];
  state.approvalBinding = null;
  state.highRiskBinding = null;
  state.preflightReportSha256 = null;
  $("highRiskApproval").checked = false;
  renderPreflight();
}

function outputFormats(job) {
  return (job.outputs || []).map(item => typeof item === "string" ? item : item.format);
}

function taskGoal(job) {
  if (job.schemaVersion >= 2) return job.brief.goal;
  return `${job.content.subtitle} · ${job.content.features.join(" · ")}`;
}

function renderTask() {
  const job = state.job;
  $("taskEmpty").classList.toggle("is-hidden", Boolean(job));
  $("taskSummary").classList.toggle("is-hidden", !job);
  if (!job) return;
  setText("taskTitle", job.title || job.content.title);
  setText("taskVersion", job.practiceContext ? `Schema V${job.schemaVersion} · Practice ${job.practiceContext.protocolVersion}` : `Schema V${job.schemaVersion}`);
  setText("taskGoal", taskGoal(job));
  const dimensions = job.document.widthPx && job.document.heightPx ? `${job.document.widthPx} × ${job.document.heightPx} px` : `${job.document.widthMm} × ${job.document.heightMm} mm`;
  setText("taskCanvas", `${dimensions} · ${job.document.resolution} ppi`);
  setText("taskMode", `${job.executionMode} · ${job.document.colorMode}`);
  setText("taskOperations", job.schemaVersion >= 2 ? `${job.operationSummary.total} 项 / ${job.operationSummary.highRisk} 高风险` : `${job.operations.length} 项模板步骤`);
  setText("taskOutputs", outputFormats(job).map(value => value.toUpperCase()).join(" / "));
  setText("jobStatus", "待人工确认");
}

function operationDescription(operation) {
  if (operation.operation === "INSPECT_DOCUMENT") return "读取文档规格与图层树";
  if (operation.operation === "SAVE_COPY" || operation.operation === "EXPORT_DOCUMENT") return `${operation.parameters.format.toUpperCase()} · ${operation.parameters.suggestedName}`;
  const target = operation.target?.layerName || (operation.target?.layerId ? `图层 #${operation.target.layerId}` : "当前文档");
  return operation.expectedResult || target;
}

function renderOperations() {
  const list = $("operationList");
  list.replaceChildren();
  const operations = state.job?.schemaVersion >= 2 ? state.job.operations : [];
  $("operationsEmpty").classList.toggle("is-hidden", operations.length > 0);
  setText("operationCount", operations.length);
  for (const operation of operations) {
    const item = document.createElement("li");
    item.className = "operation-item";
    const copy = document.createElement("div");
    copy.className = "operation-copy";
    const title = document.createElement("strong");
    title.textContent = operation.operation.replaceAll("_", " ");
    const detail = document.createElement("p");
    detail.textContent = operationDescription(operation);
    copy.append(title, detail);
    const risk = document.createElement("span");
    risk.className = `risk risk-${operation.risk.toLowerCase()}`;
    risk.textContent = operation.risk;
    item.append(copy, risk);
    list.append(item);
  }
  updateActions();
}

function layerCode(type) {
  return ({ GROUP: "GRP", TEXT: "TXT", SMART_OBJECT: "OBJ", ADJUSTMENT: "ADJ", SHAPE: "SHP", PIXEL: "PXL" })[type] || "LYR";
}

function renderLayers() {
  const tree = $("layerTree");
  tree.replaceChildren();
  const layers = state.inspection ? flattenLayerTree(state.inspection.layers) : [];
  $("layersEmpty").classList.toggle("is-hidden", layers.length > 0);
  setText("layerCount", layers.length);
  for (const [index, layer] of layers.entries()) {
    const row = document.createElement("div");
    row.className = `layer-row${layer.visible ? "" : " is-hidden-layer"}`;
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", String(layer.depth + 1));
    row.setAttribute("tabindex", index === 0 ? "0" : "-1");
    row.addEventListener("keydown", event => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const rows = Array.from(tree.querySelectorAll('[role="treeitem"]'));
      const current = rows.indexOf(row);
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
      rows.forEach((item, itemIndex) => item.setAttribute("tabindex", itemIndex === nextIndex ? "0" : "-1"));
      rows[nextIndex]?.focus();
    });
    row.style.paddingLeft = `${4 + layer.depth * 14}px`;
    const main = document.createElement("div");
    main.className = "layer-main";
    const icon = document.createElement("span");
    icon.className = "layer-icon";
    icon.textContent = layerCode(layer.type);
    const name = document.createElement("span");
    name.className = "layer-name";
    name.textContent = layer.name;
    const meta = document.createElement("span");
    meta.className = "layer-meta";
    meta.textContent = layer.editable ? "可编辑" : "锁定";
    main.append(icon, name);
    row.append(main, meta);
    tree.append(row);
  }
}

function dispositionCopy(value) {
  return ({ READY: "技术预检通过", REQUIRES_CONFIRMATION: "存在高风险项，需确认", BLOCKED: "存在阻断项，不应交付" })[value] || value;
}

function renderPreflight() {
  const result = state.preflight;
  $("reviewEmpty").classList.toggle("is-hidden", Boolean(result));
  $("reviewSummary").classList.toggle("is-hidden", !result);
  const list = $("issueList");
  list.replaceChildren();
  if (!result) {
    $("highRiskApprovalBlock").classList.add("is-hidden");
    setText("reviewStatus", "待执行");
    updateActions();
    return;
  }
  $("highRiskApprovalBlock").classList.toggle("is-hidden", result.disposition !== "REQUIRES_CONFIRMATION");
  setText("reviewScore", result.score);
  setText("reviewDisposition", dispositionCopy(result.disposition));
  setText("reviewNote", result.note);
  setText("reviewStatus", result.disposition);
  for (const issue of result.issues) {
    const item = document.createElement("li");
    item.className = "issue-item";
    const head = document.createElement("div");
    head.className = "issue-head";
    const title = document.createElement("strong");
    title.textContent = issue.message;
    const severity = document.createElement("span");
    severity.className = `severity severity-${issue.severity.toLowerCase()}`;
    severity.textContent = issue.severity;
    const suggestion = document.createElement("p");
    suggestion.textContent = issue.suggestion;
    head.append(title, severity);
    item.append(head, suggestion);
    list.append(item);
  }
  updateActions();
}

function setCurrentPreflight(result) {
  const reportSha256 = preflightReportSha256(result);
  const remainsBound = state.highRiskBinding
    && state.highRiskBinding.jobId === state.job?.jobId
    && state.highRiskBinding.documentId === state.document?.id
    && state.highRiskBinding.reportSha256 === reportSha256;
  if (!remainsBound) {
    state.highRiskBinding = null;
    $("highRiskApproval").checked = false;
  }
  state.preflight = result;
  state.preflightReportSha256 = reportSha256;
  renderPreflight();
  return result;
}

function updateActions() {
  const approved = $("approval").checked;
  const bound = Boolean(state.approvalBinding && state.job && state.approvalBinding.jobId === state.job.jobId);
  const executableSource = state.jobSource === "BUNDLED_DEMO" || state.jobSource === "STUDIO_BRIDGE";
  const outputAllowed = state.job?.schemaVersion === 1
    && state.executionResult?.status === "COMPLETED"
    && state.document
    && preflightAllowsOutput(state.preflight, state.highRiskBinding, state.job, state.document);
  $("executePlan").disabled = !(state.job && approved && bound && executableSource) || Boolean(state.busy);
  $("saveManifest").disabled = !state.manifest;
  $("exportLegacyPng").disabled = !(outputAllowed && bound) || Boolean(state.busy);
  setText("exportHint", state.manifest ? `${state.manifest.artifacts.length} 个文件已纳入清单 · ${state.manifest.manifestSha256.slice(0, 12)}…` : "完成任务执行和技术预检后生成交付清单。");
}

function setJob(input, source = "LOCAL_FILE") {
  state.job = validateJob(input);
  state.jobSource = source;
  $("approval").checked = false;
  resetDerivedState();
  state.document = null;
  state.inspection = null;
  setText("documentStatus", "未检查");
  setText("activeDocumentHint", "检查尺寸、色彩模式和可编辑图层。");
  renderLayers();
  renderTask();
  renderOperations();
  if (source === "LOCAL_FILE") {
    setText("jobStatus", "本地审阅模式");
    log(`任务 ${state.job.jobId} 已校验。本地 JSON 不能证明 Studio 审批来源，仅允许审阅。`);
  } else log(`任务 ${state.job.jobId} 校验通过；尚未修改 Photoshop。`);
}

function bindHumanApproval() {
  if (!$("approval").checked) {
    state.approvalBinding = null;
    state.highRiskBinding = null;
    $("highRiskApproval").checked = false;
    updateActions();
    return;
  }
  if (!state.job) throw new Error("请先载入任务。");
  if (state.jobSource === "LOCAL_FILE") throw new Error("本地导入任务只允许审阅；请通过受治理的 Studio Bridge 提交，或使用明确标记的本地演示。");
  const document = state.job.executionMode === "CREATE_DOCUMENT" || state.job.schemaVersion === 1 ? { id: "NEW_DOCUMENT" } : activeDocument();
  state.approvalBinding = createApprovalBinding(state.job, document, { humanConfirmed: true });
  log(`人工确认已绑定任务 ${state.job.jobId} 与文档 #${document.id}。`);
  updateActions();
}

async function loadBundledJson(url) {
  const entry = await storage.localFileSystem.getEntryWithUrl(url);
  return JSON.parse(await entry.read());
}

async function inspectCurrentDocument() {
  state.document = activeDocument();
  if (state.approvalBinding && state.approvalBinding.documentId !== state.document.id) {
    state.approvalBinding = null;
    state.highRiskBinding = null;
    $("highRiskApproval").checked = false;
    $("approval").checked = false;
    log("活动文档已变化，原人工确认已失效。");
  }
  state.preflight = null;
  state.preflightReportSha256 = null;
  state.highRiskBinding = null;
  $("highRiskApproval").checked = false;
  renderPreflight();
  state.inspection = inspectPhotoshopDocument(state.document);
  setText("documentStatus", `${state.inspection.document.width}×${state.inspection.document.height} · ${state.inspection.document.layerCount} 层`);
  setText("activeDocumentHint", `${state.inspection.document.name} · ${state.inspection.document.resolution || "?"} ppi · ${state.inspection.document.colorMode}`);
  renderLayers();
  log(`已检查文档 ${state.inspection.document.name}，共 ${state.inspection.document.layerCount} 个图层。`);
  return state.inspection;
}

async function runReview() {
  if (!state.job) throw new Error("请先载入任务，预检需要目标规格。");
  await inspectCurrentDocument();
  setCurrentPreflight(runPreflight(state.inspection, state.job));
  log(`技术预检完成：${state.preflight.score} 分，${state.preflight.issues.length} 个问题。`);
  return state.preflight;
}

async function prepareOperationFiles() {
  if (!state.job || state.job.schemaVersion < 2) {
    log("当前模板任务无需预先准备操作文件条目。");
    return;
  }
  for (const operation of state.job.operations) {
    if (["REPLACE_SMART_OBJECT", "PLACE_AS_SMART_OBJECT"].includes(operation.operation) && !state.assetEntries[operation.parameters.assetRef]) {
      const entry = await storage.localFileSystem.getFileForOpening({ types: ["png", "jpg", "jpeg", "psd"] });
      if (!entry) throw new Error(`已取消素材 ${operation.parameters.assetRef} 的选择。`);
      state.assetEntries[operation.parameters.assetRef] = entry;
    }
    if ((operation.operation === "SAVE_COPY" || operation.operation === "EXPORT_DOCUMENT") && !state.outputEntries[operation.operationId]) {
      const format = operation.parameters.format;
      const entry = await storage.localFileSystem.getFileForSaving(operation.parameters.suggestedName, { types: [format] });
      if (!entry) throw new Error(`已取消输出 ${operation.operationId} 的选择。`);
      state.outputEntries[operation.operationId] = entry;
    }
  }
  setText("assetStatus", `${Object.keys(state.assetEntries).length} 项素材 · ${Object.keys(state.outputEntries).length} 项输出已授权`);
  log("任务所需素材与输出位置已准备。尚未修改 Photoshop。");
}

async function createManifest() {
  if (!state.preflight) await runReview();
  state.manifest = await buildArtifactManifest({
    job: state.job,
    executionResult: state.executionResult,
    preflight: state.preflight,
    approvalBinding: state.approvalBinding,
    highRiskBinding: state.highRiskBinding,
    outputEntries: state.producedEntries
  });
  updateActions();
}

async function executeCurrentJob() {
  if (!state.job) throw new Error("请先载入任务。");
  if (!$("approval").checked) throw new Error("必须先完成明确的人工确认。");
  if (!state.approvalBinding) throw new Error("人工确认尚未绑定任务和 Photoshop 文档。");
  const createsDocument = state.job.schemaVersion === 1 || state.job.executionMode === "CREATE_DOCUMENT";
  const currentDocument = createsDocument ? { id: "NEW_DOCUMENT" } : activeDocument();
  try { assertApprovalBinding(state.approvalBinding, state.job, currentDocument); }
  catch { throw new Error("任务或活动文档已变化，请重新检查并确认。"); }
  if (state.jobSource === "LOCAL_FILE") throw new Error("本地导入任务不能进入执行路径。");
  if (state.job.schemaVersion === 1) {
    const layout = createLayout(state.job);
    state.document = await renderPoster(state.job, layout, { approved: true, logoEntry: state.logoEntry, keyVisualEntry: state.keyVisualEntry });
    state.approvalBinding = createApprovalBinding(state.job, state.document, { humanConfirmed: true, confirmedAt: state.approvalBinding.confirmedAt });
    state.inspection = inspectPhotoshopDocument(state.document);
    setCurrentPreflight(runPreflight(state.inspection, state.job));
    if (!preflightAllowsOutput(state.preflight, state.highRiskBinding, state.job, state.document)) throw new Error("PREFLIGHT_BLOCKED_OR_CONFIRMATION_REQUIRED");
    const psdEntry = await saveDocument(state.document, "psd");
    state.producedEntries = psdEntry ? [{ entry: psdEntry, format: "psd" }] : [];
    state.executionResult = { status: "COMPLETED", plan: { total: state.job.operations.length, writes: state.job.operations.length } };
  } else {
    state.document = createsDocument ? null : currentDocument;
    await prepareOperationFiles();
    state.executionResult = await executeOperationPlan(state.document, state.job.operations, {
      approved: true,
      assetEntries: state.assetEntries,
      outputEntries: state.outputEntries,
      historyName: `ANKSEN：${state.job.title}`,
      createDocument: createsDocument ? {
        width: state.job.document.widthPx,
        height: state.job.document.heightPx,
        resolution: state.job.document.resolution,
        colorMode: state.job.document.colorMode,
        name: state.job.title
      } : null,
      completedIdempotencyKeys: new Set(),
      preflightBeforeOutput: async ({ document }) => {
        const inspection = inspectPhotoshopDocument(document);
        const result = runPreflight(inspection, state.job);
        state.inspection = inspection;
        state.document = document;
        setCurrentPreflight(result);
        return { ...result, exportAllowed: preflightAllowsOutput(result, state.highRiskBinding, state.job, document) };
      }
    });
    state.document = state.executionResult.document;
    state.producedEntries = state.job.operations
      .filter(operation => state.outputEntries[operation.operationId])
      .map(operation => ({ entry: state.outputEntries[operation.operationId], format: operation.parameters.format }));
  }
  state.inspection = inspectPhotoshopDocument(state.document);
  renderLayers();
  setText("documentStatus", `${state.inspection.document.width}×${state.inspection.document.height} · ${state.inspection.document.layerCount} 层`);
  setText("jobStatus", "执行完成");
  setCurrentPreflight(runPreflight(state.inspection, state.job));
  if (!preflightAllowsOutput(state.preflight, state.highRiskBinding, state.job, state.document)) throw new Error("任务执行后预检阻断或高风险问题尚未二次确认，未生成交付清单。");
  await createManifest();
  log(`任务 ${state.job.jobId} 已完成；生成 ${state.producedEntries.length} 个受控输出。`);
  switchTab("review");
}

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  tab.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(document.querySelectorAll(".tab"));
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
    next.focus();
    switchTab(next.dataset.tab);
  });
}

$("toggleLog").addEventListener("click", () => {
  const expanded = $("toggleLog").getAttribute("aria-expanded") === "true";
  $("toggleLog").setAttribute("aria-expanded", expanded ? "false" : "true");
  $("activityLog").hidden = expanded;
});

$("loadJob").addEventListener("click", () => withBusy("正在校验任务", async () => {
  const entry = await storage.localFileSystem.getFileForOpening({ types: ["json"] });
  if (!entry) { log("已取消任务导入。"); return; }
  setJob(JSON.parse(await entry.read()), "LOCAL_FILE");
}));

$("useV2Sample").addEventListener("click", () => withBusy("正在载入 V2 示例", async () => setJob(await loadBundledJson("plugin:/examples/jinhu-operations-v2.example.json"), "BUNDLED_DEMO")));
$("useV3Sample").addEventListener("click", () => withBusy("正在载入通用能力图 V3", async () => setJob(await loadBundledJson("plugin:/examples/capability-graph-v3.example.json"), "BUNDLED_DEMO")));
$("useLegacySample").addEventListener("click", () => { try { setJob(sampleJob(), "BUNDLED_DEMO"); } catch (error) { log(`示例加载失败：${describeError(error)}`); } });

$("loadLogo").addEventListener("click", () => withBusy("正在选择品牌素材", async () => {
  const entry = await storage.localFileSystem.getFileForOpening({ types: ["png", "jpg", "jpeg"] });
  if (!entry) { log("已取消 Logo 选择。"); return; }
  state.logoEntry = entry;
  setText("assetStatus", `已选择 ${entry.name}`);
  log(`品牌素材已授权：${entry.name}`);
}));

$("inspectDocument").addEventListener("click", () => withBusy("正在分析文档与图层", inspectCurrentDocument));
$("runReview").addEventListener("click", () => withBusy("正在运行技术预检", runReview));
$("prepareFiles").addEventListener("click", () => withBusy("正在准备素材与输出", prepareOperationFiles));
$("approval").addEventListener("change", () => {
  try { bindHumanApproval(); }
  catch (error) {
    $("approval").checked = false;
    state.approvalBinding = null;
    log(`确认失败：${describeError(error)}`);
    $("toggleLog").setAttribute("aria-expanded", "true");
    $("activityLog").hidden = false;
    updateActions();
  }
});
$("highRiskApproval").addEventListener("change", () => {
  try {
    if (!$("highRiskApproval").checked) {
      state.highRiskBinding = null;
      updateActions();
      return;
    }
    const current = activeDocument();
    assertApprovalBinding(state.approvalBinding, state.job, current);
    state.highRiskBinding = createHighRiskApprovalBinding(state.job, current, state.preflight, { humanConfirmed: true });
    log(`高风险预检已二次确认并绑定报告 ${state.highRiskBinding.reportSha256.slice(0, 12)}…。`);
    updateActions();
  } catch (error) {
    $("highRiskApproval").checked = false;
    state.highRiskBinding = null;
    log(`高风险确认失败：${describeError(error)}`);
    updateActions();
  }
});
$("executePlan").addEventListener("click", () => withBusy("正在执行受控 Photoshop 计划", executeCurrentJob));

$("saveManifest").addEventListener("click", () => withBusy("正在保存结果清单", async () => {
  const entry = await storage.localFileSystem.getFileForSaving(`${state.job.jobId}-result.json`, { types: ["json"] });
  if (!entry) { log("已取消结果清单保存。"); return; }
  await entry.write(`${JSON.stringify(state.manifest, null, 2)}\n`);
  log(`结果清单已保存：${entry.name}`);
}));

$("exportLegacyPng").addEventListener("click", () => withBusy("正在导出 PNG", async () => {
  if (state.job?.schemaVersion !== 1 || state.executionResult?.status !== "COMPLETED") throw new Error("当前 PNG 导出仅允许已完成执行的 Legacy 模板任务；V2 输出必须位于受控操作计划末尾。");
  const current = activeDocument();
  assertApprovalBinding(state.approvalBinding, state.job, current);
  state.document = current;
  state.inspection = inspectPhotoshopDocument(current);
  setCurrentPreflight(runPreflight(state.inspection, state.job));
  if (!preflightAllowsOutput(state.preflight, state.highRiskBinding, state.job, current)) throw new Error("导出要求当前文档通过预检；高风险问题还必须绑定当前报告完成二次确认。");
  assertHighRiskApprovalBinding(state.highRiskBinding, state.job, current, state.preflight);
  await createManifest();
  const entry = await saveDocument(current, "png");
  if (!entry) { log("已取消 PNG 导出。"); return; }
  state.producedEntries.push({ entry, format: "png" });
  try { await createManifest(); }
  catch (error) {
    state.producedEntries.pop();
    if (typeof entry.delete === "function") await entry.delete();
    throw error;
  }
  log(`PNG 已导出：${entry.name}`);
}));

async function initialize() {
  updateActions();
  renderLayers();
  renderOperations();
  renderPreflight();
  try {
    state.logoEntry = await storage.localFileSystem.getEntryWithUrl("plugin:/assets/jinhu-logo.jpg");
    state.keyVisualEntry = await storage.localFileSystem.getEntryWithUrl("plugin:/assets/jinhu-key-visual-v3.png");
    setText("assetStatus", "内置 V3 创新之门主视觉与金湖 Logo 已准备。");
  } catch (error) {
    setText("assetStatus", "内置生产素材不完整，请手动选择 Logo。");
    log(`内置生产素材未载入：${describeError(error)}`);
  }
}

initialize();
