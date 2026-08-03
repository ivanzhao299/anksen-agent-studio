"use strict";

const MM_PER_INCH = 25.4;

function mmToPx(mm, resolution) {
  return Math.round((mm / MM_PER_INCH) * resolution);
}

function createLayout(job) {
  const width = mmToPx(job.document.widthMm, job.document.resolution);
  const height = mmToPx(job.document.heightMm, job.document.resolution);
  const bleed = mmToPx(job.document.bleedMm, job.document.resolution);
  const safe = mmToPx(30, job.document.resolution);
  const standExclusion = mmToPx(150, job.document.resolution);
  const sx = width / 3779;
  const sy = height / 8504;
  const point = (x, y) => ({ x: Math.round(x * sx), y: Math.round(y * sy) });

  return Object.freeze({
    width,
    height,
    bleed,
    safe,
    standExclusion,
    title: { ...point(250, 1430), fontSize: Math.round(260 * sx), color: { red: 246, green: 248, blue: 251 } },
    subtitle: { ...point(250, 1930), fontSize: Math.round(260 * sx), color: { red: 246, green: 248, blue: 251 } },
    features: [point(260, 2580), point(1390, 2580), point(2520, 2580)].map(position => ({ ...position, fontSize: Math.round(72 * sx), color: { red: 195, green: 210, blue: 228 } })),
    slogan: { ...point(760, 565), fontSize: Math.round(92 * sx), color: { red: 242, green: 245, blue: 249 } },
    logo: { ...point(250, 300), width: Math.round(390 * sx), height: Math.round(310 * sy) },
    hero: { left: safe, top: Math.round(height * 0.34), right: width - safe, bottom: Math.round(height * 0.70) }
  });
}

function sampleJob() {
  return {
    jobId: "JINHU-POSTER-001",
    templateId: "jinhu-park-64x144-v1",
    templateVersion: "1.0.0",
    document: { widthMm: 640, heightMm: 1440, bleedMm: 0, resolution: 150, colorMode: "RGB" },
    content: {
      title: "聚势 · 共创",
      subtitle: "向新而行",
      features: ["创新策源", "产业协同", "企业成长"],
      slogan: "金湖科创产业园"
    },
    operations: ["create_document", "create_layer_groups", "place_approved_logo", "create_text_layers", "create_brand_background", "save_psd", "export_preview"],
    outputs: ["psd", "png"],
    requireApproval: true,
    governance: { executionMode: "human_confirmed", production: false, deploy: false, approvedJobId: "JINHU-POSTER-001", approvalId: "local-demo-jinhu-poster-001", approvalSource: "LOCAL_DEMO" }
  };
}

module.exports = { mmToPx, createLayout, sampleJob };
