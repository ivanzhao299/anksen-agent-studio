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
    title: { ...point(260, 1800), fontSize: Math.round(250 * sx), color: { red: 8, green: 30, blue: 98 } },
    subtitle: { ...point(700, 2480), fontSize: Math.round(94 * sx), color: { red: 12, green: 45, blue: 108 } },
    features: [point(440, 6700), point(1570, 6700), point(2700, 6700)].map(position => ({ ...position, fontSize: Math.round(106 * sx), color: { red: 8, green: 30, blue: 98 } })),
    slogan: { ...point(610, 7420), fontSize: Math.round(100 * sx), color: { red: 8, green: 30, blue: 98 } },
    logo: { ...point(1050, 420), width: Math.round(1680 * sx), height: Math.round(980 * sy) },
    hero: { left: safe, top: Math.round(height * 0.34), right: width - safe, bottom: Math.round(height * 0.70) }
  });
}

function sampleJob() {
  return {
    jobId: "JINHU-POSTER-001",
    templateId: "jinhu-park-64x144-v1",
    templateVersion: "1.0.0",
    document: { widthMm: 640, heightMm: 1440, bleedMm: 3, resolution: 150, colorMode: "RGB" },
    content: {
      title: "金湖科创产业园",
      subtitle: "创新驱动发展  科技引领未来",
      features: ["科技创新", "产业协同", "企业服务"],
      slogan: "汇聚创新力量 · 共创产业未来"
    },
    operations: ["create_document", "create_layer_groups", "place_approved_logo", "create_text_layers", "create_brand_background", "save_psd", "export_preview"],
    outputs: ["psd", "png"],
    requireApproval: true,
    governance: { executionMode: "human_confirmed", production: false, deploy: false }
  };
}

module.exports = { mmToPx, createLayout, sampleJob };
