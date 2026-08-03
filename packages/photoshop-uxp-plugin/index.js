"use strict";

const { storage, entrypoints } = require("uxp");
const { validateJob } = require("./src/job-contract.cjs");
const { createLayout, sampleJob } = require("./src/jinhu-template.cjs");
const { renderPoster, saveDocument } = require("./src/photoshop-executor.cjs");
let currentJob = null;
let currentDocument = null;
let logoEntry = null;

entrypoints.setup({
  panels: {
    anksenStudioPanel: {
      show() {}
    }
  }
});

const $ = id => document.getElementById(id);
const log = message => {
  const timestamp = new Date().toLocaleTimeString();
  $("log").textContent = `[${timestamp}] ${message}\n${$("log").textContent}`;
};

function updateUi() {
  const approved = $("approval").checked;
  $("renderPreview").disabled = !(currentJob && approved);
  $("exportPreview").disabled = !currentDocument;
  $("jobStatus").textContent = currentDocument ? "已生成" : currentJob ? "待人工确认" : "待导入";
}

function showJob(job) {
  currentJob = validateJob(job);
  const content = currentJob.content;
  $("summary").innerHTML = `<strong>${content.title}</strong><p>${content.subtitle}</p><p>${content.features.join(" · ")}</p><p>${content.slogan}</p>`;
  $("templateName").textContent = currentJob.templateId;
  log(`任务 ${currentJob.jobId} 校验通过；尚未修改 Photoshop。`);
  updateUi();
}

$("useSample").addEventListener("click", () => {
  try { showJob(sampleJob()); } catch (error) { log(`示例加载失败：${error.message}`); }
});

async function loadBundledLogo() {
  try {
    logoEntry = await storage.localFileSystem.getEntryWithUrl("plugin:/assets/jinhu-logo.jpg");
    log("已载入插件内置的金湖科创产业园 Logo。");
  } catch (error) {
    log(`内置 Logo 不可用，可手动选择：${error.message}`);
  }
}

$("loadJob").addEventListener("click", async () => {
  try {
    const entry = await storage.localFileSystem.getFileForOpening({ types: ["json"] });
    if (!entry) return;
    showJob(JSON.parse(await entry.read()));
  } catch (error) { log(`任务导入失败：${error.message}`); }
});

$("loadLogo").addEventListener("click", async () => {
  try {
    logoEntry = await storage.localFileSystem.getFileForOpening({ types: ["png", "jpg", "jpeg"] });
    if (logoEntry) log(`已选择 Logo：${logoEntry.name}`);
  } catch (error) { log(`Logo选择失败：${error.message}`); }
});

$("approval").addEventListener("change", updateUi);

$("renderPreview").addEventListener("click", async () => {
  try {
    const layout = createLayout(currentJob);
    log(`开始生成 ${layout.width}×${layout.height}px 文档。`);
    currentDocument = await renderPoster(currentJob, layout, { approved: $("approval").checked, logoEntry });
    const psdEntry = await saveDocument(currentDocument, "psd");
    log(psdEntry ? `可编辑PSD生成完成：${psdEntry.name}` : "文档已生成，但用户取消了PSD保存。");
  } catch (error) { log(`生成失败：${error.message}`); }
  updateUi();
});

$("exportPreview").addEventListener("click", async () => {
  try {
    const entry = await saveDocument(currentDocument, "png");
    log(entry ? `PNG导出完成：${entry.name}` : "用户取消导出。");
  } catch (error) { log(`导出失败：${error.message}`); }
});

updateUi();
loadBundledLogo();
