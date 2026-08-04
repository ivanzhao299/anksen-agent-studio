"use strict";

const { flattenLayerTree } = require("./document-inspector.cjs");

const SEVERITY_PENALTY = Object.freeze({ INFO: 0, LOW: 2, MEDIUM: 6, HIGH: 14, BLOCKER: 28 });

function issue(code, severity, message, evidence, suggestion, autoFixable = false, fixOperation = null) {
  return { code, severity, message, evidence, suggestion, autoFixable, fixOperation };
}

function normalizedMode(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("CMYK")) return "CMYK";
  if (text.includes("RGB")) return "RGB";
  return text || "UNKNOWN";
}

function runPreflight(inspection, job = {}, options = {}) {
  if (!inspection?.document || !Array.isArray(inspection.layers)) throw new Error("A document inspection is required for preflight.");
  const findings = [];
  const doc = inspection.document;
  const expected = job.document || {};
  const tolerance = options.dimensionTolerancePx ?? 2;
  const derivedWidthPx = Number.isFinite(expected.widthMm) && Number.isFinite(expected.resolution) ? Math.round(expected.widthMm / 25.4 * expected.resolution) : null;
  const derivedHeightPx = Number.isFinite(expected.heightMm) && Number.isFinite(expected.resolution) ? Math.round(expected.heightMm / 25.4 * expected.resolution) : null;
  const expectedWidthPx = Number.isFinite(expected.widthPx) ? expected.widthPx : derivedWidthPx;
  const expectedHeightPx = Number.isFinite(expected.heightPx) ? expected.heightPx : derivedHeightPx;
  if (Number.isFinite(expected.widthPx) && Number.isFinite(derivedWidthPx) && Math.abs(expected.widthPx - derivedWidthPx) > tolerance) {
    findings.push(issue("JOB_WIDTH_SPEC_INCONSISTENT", "BLOCKER", "任务中的毫米宽度与像素宽度相互矛盾。", { widthMm: expected.widthMm, widthPx: expected.widthPx, derivedWidthPx }, "修正任务规格后重新审批。"));
  }
  if (Number.isFinite(expected.heightPx) && Number.isFinite(derivedHeightPx) && Math.abs(expected.heightPx - derivedHeightPx) > tolerance) {
    findings.push(issue("JOB_HEIGHT_SPEC_INCONSISTENT", "BLOCKER", "任务中的毫米高度与像素高度相互矛盾。", { heightMm: expected.heightMm, heightPx: expected.heightPx, derivedHeightPx }, "修正任务规格后重新审批。"));
  }
  if (Number.isFinite(expectedWidthPx) && Math.abs(doc.width - expectedWidthPx) > tolerance) {
    findings.push(issue("DOCUMENT_WIDTH_MISMATCH", "BLOCKER", "文档宽度与任务规格不一致。", { actual: doc.width, expected: expectedWidthPx }, "按任务规格重新建立文档或确认裁切策略。"));
  }
  if (Number.isFinite(expectedHeightPx) && Math.abs(doc.height - expectedHeightPx) > tolerance) {
    findings.push(issue("DOCUMENT_HEIGHT_MISMATCH", "BLOCKER", "文档高度与任务规格不一致。", { actual: doc.height, expected: expectedHeightPx }, "按任务规格重新建立文档或确认裁切策略。"));
  }
  if (Number.isFinite(expected.resolution) && Math.abs((doc.resolution || 0) - expected.resolution) > 0.1) {
    findings.push(issue("RESOLUTION_MISMATCH", "BLOCKER", "文档分辨率与任务规格不一致。", { actual: doc.resolution, expected: expected.resolution }, "在不重采样的前提下核对物理尺寸，必要时建立正确规格副本。"));
  }
  if (expected.colorMode && normalizedMode(doc.colorMode) !== normalizedMode(expected.colorMode)) {
    findings.push(issue("COLOR_MODE_MISMATCH", "HIGH", "文档色彩模式与任务规格不一致。", { actual: normalizedMode(doc.colorMode), expected: normalizedMode(expected.colorMode) }, "保留 RGB 工作稿，并按印刷配置建立 CMYK 输出副本。"));
  }
  if (!doc.profile) findings.push(issue("COLOR_PROFILE_MISSING", "MEDIUM", "未检测到嵌入色彩配置文件。", null, "保存时嵌入经过确认的 RGB 或 CMYK 配置文件。"));
  if (Number(expected.bleedMm || 0) > 0) {
    if (!Number.isFinite(doc.bleedMm)) findings.push(issue("BLEED_UNVERIFIED", "BLOCKER", "任务要求出血，但当前 Photoshop 文档没有可验证的出血元数据。", { expectedBleedMm: expected.bleedMm }, "使用包含明确 TrimBox/BleedBox 的印前流程，或按承印商规范将任务出血设为 0 后重新审批。"));
    else if (Math.abs(doc.bleedMm - expected.bleedMm) > 0.01) findings.push(issue("BLEED_MISMATCH", "BLOCKER", "文档出血与任务规格不一致。", { actual: doc.bleedMm, expected: expected.bleedMm }, "按承印商规格修正文档出血。"));
  }

  const layers = flattenLayerTree(inspection.layers);
  if (!layers.length) findings.push(issue("EMPTY_LAYER_TREE", "BLOCKER", "文档没有可检查图层。", null, "确认当前文档和图层结构。"));
  const unnamed = layers.filter(layer => !layer.name || /^Layer\s*\d*$/i.test(layer.name) || /^图层\s*\d*$/.test(layer.name));
  if (unnamed.length) findings.push(issue("NON_SEMANTIC_LAYER_NAMES", "MEDIUM", "存在未语义化命名的图层。", { layerIds: unnamed.map(layer => layer.id) }, "按背景、主视觉、品牌、文字、调整和输出控制命名图层。"));

  const minFontSize = Number(job.reviewCriteria?.minimumFontSizePt ?? options.minimumFontSizePt ?? 18);
  for (const layer of layers.filter(item => item.type === "TEXT")) {
    if (job.reviewCriteria?.requireSemanticLayerNames !== false && layer.name === layer.text?.contents?.slice(0, layer.name.length)) findings.push(issue("TEXT_CONTENT_USED_AS_LAYER_NAME", "MEDIUM", `文字图层“${layer.name}”没有独立的语义化名称。`, { layerId: layer.id }, "使用如 31_TITLE_主标题 的稳定语义名称，避免文案变化破坏自动化定位。"));
    if (!layer.text?.contents?.trim()) findings.push(issue("EMPTY_TEXT_LAYER", "MEDIUM", `文字图层“${layer.name}”为空。`, { layerId: layer.id }, "删除无用途文字层或补充已确认文案。"));
    if (layer.text?.missingFont) findings.push(issue("MISSING_FONT", "BLOCKER", `文字图层“${layer.name}”使用了缺失字体。`, { layerId: layer.id, font: layer.text.font }, "安装授权字体或替换为已批准字体。"));
    if (Number.isFinite(layer.text?.fontSize) && layer.text.fontSize < minFontSize) findings.push(issue("TEXT_BELOW_MINIMUM_SIZE", "HIGH", `文字图层“${layer.name}”小于最低可读字号。`, { layerId: layer.id, actualPt: layer.text.fontSize, minimumPt: minFontSize }, "提升字号或删除低优先级小字，并进行观看距离测试。"));
    const horizontal = layer.text?.horizontalScale ?? 100;
    const vertical = layer.text?.verticalScale ?? 100;
    if (Math.abs(horizontal - 100) > 0.1 || Math.abs(vertical - 100) > 0.1) findings.push(issue("TEXT_DISTORTED", "BLOCKER", `文字图层“${layer.name}”存在横向或纵向变形。`, { layerId: layer.id, horizontalScale: horizontal, verticalScale: vertical }, "恢复文字 100% 横向与纵向缩放，使用字重、字距和字号解决版面问题。"));
  }

  const safePx = Number.isFinite(job.document?.safeMarginPx) ? job.document.safeMarginPx : null;
  if (safePx != null && Number.isFinite(doc.width) && Number.isFinite(doc.height)) {
    for (const layer of layers.filter(item => item.type === "TEXT" && item.visible && item.bounds)) {
      const b = layer.bounds;
      if (b.left < safePx || b.top < safePx || b.right > doc.width - safePx || b.bottom > doc.height - safePx) {
        findings.push(issue("TEXT_OUTSIDE_SAFE_AREA", "HIGH", `文字图层“${layer.name}”超出安全区。`, { layerId: layer.id, bounds: b, safeMarginPx: safePx }, "移动或重排文字，确保关键内容位于安全区内。", true, { operation: "MOVE_LAYER", target: { layerId: layer.id } }));
      }
    }
  }

  const severityCounts = Object.fromEntries(["INFO", "LOW", "MEDIUM", "HIGH", "BLOCKER"].map(level => [level, findings.filter(item => item.severity === level).length]));
  const score = Math.max(0, 100 - findings.reduce((sum, item) => sum + SEVERITY_PENALTY[item.severity], 0));
  const blockers = severityCounts.BLOCKER;
  const high = severityCounts.HIGH;
  return {
    schemaVersion: 1,
    kind: "TECHNICAL_PREFLIGHT",
    score,
    disposition: blockers ? "BLOCKED" : high ? "REQUIRES_CONFIRMATION" : "READY",
    exportAllowed: blockers === 0,
    severityCounts,
    issues: findings,
    checkedAt: new Date().toISOString(),
    note: "该分数只反映可验证的文档与印前规则，不替代人工视觉审查。"
  };
}

module.exports = { runPreflight, normalizedMode, SEVERITY_PENALTY };
