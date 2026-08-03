"use strict";

const MM_PER_INCH = 25.4;

function mmToPx(mm, resolution) {
  return Math.round((mm / MM_PER_INCH) * resolution);
}

function createLayout(job) {
  const width = mmToPx(job.document.widthMm, job.document.resolution);
  const height = mmToPx(job.document.heightMm, job.document.resolution);
  const bleed = mmToPx(job.document.bleedMm, job.document.resolution);
  const safe = mmToPx(18, job.document.resolution);
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
    title: { x: mmToPx(48, job.document.resolution), y: mmToPx(292, job.document.resolution), fontSize: 126, color: { red: 10, green: 32, blue: 71 } },
    subtitle: { x: mmToPx(48, job.document.resolution), y: mmToPx(448, job.document.resolution), fontSize: 126, color: { red: 10, green: 32, blue: 71 } },
    features: [mmToPx(50, job.document.resolution), mmToPx(205, job.document.resolution), mmToPx(354, job.document.resolution)].map(x => ({ x, y: mmToPx(585, job.document.resolution), fontSize: 44, color: { red: 154, green: 106, blue: 36 } })),
    slogan: { x: mmToPx(124, job.document.resolution), y: mmToPx(80, job.document.resolution), fontSize: 48, color: { red: 10, green: 32, blue: 71 } },
    logo: { x: mmToPx(46, job.document.resolution), y: mmToPx(44, job.document.resolution), width: mmToPx(64, job.document.resolution), height: mmToPx(52, job.document.resolution) },
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
      title: "让创新",
      subtitle: "在这里生长",
      features: ["科创孵化", "产业协同", "成果转化"],
      slogan: "金湖科创产业园"
    },
    operations: ["create_document", "create_layer_groups", "place_approved_logo", "create_text_layers", "create_brand_background", "save_psd", "export_preview"],
    outputs: ["psd", "png"],
    requireApproval: true,
    governance: { executionMode: "human_confirmed", production: false, deploy: false, approvedJobId: "JINHU-POSTER-001", approvalId: "local-demo-jinhu-poster-001", approvalSource: "LOCAL_DEMO" }
  };
}

module.exports = { mmToPx, createLayout, sampleJob };
