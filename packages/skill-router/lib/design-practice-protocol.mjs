import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CapabilityResourceRegistry } from "./capability-resource-registry.mjs";

const repositoryRoot = resolve(new URL("../../..", import.meta.url).pathname);
const defaultProtocolPath = new URL("../registry/design-practice-protocol.json", import.meta.url);
const safeId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const supportedMedia = new Set(["PRINT", "DIGITAL", "ENVIRONMENT", "HYBRID"]);

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const digest = value => createHash("sha256").update(stableStringify(value)).digest("hex");
const positive = value => Number.isFinite(value) && value > 0;

function normalizeRequest(input = {}) {
  if (!safeId.test(input.designTaskId || "")) throw Object.assign(new Error("DESIGN_TASK_ID_INVALID"), { code: "DESIGN_TASK_ID_INVALID" });
  const medium = String(input.medium || "").toUpperCase();
  if (!supportedMedia.has(medium)) throw Object.assign(new Error("DESIGN_MEDIUM_INVALID"), { code: "DESIGN_MEDIUM_INVALID" });
  const intents = [...new Set((input.photoshopIntents || []).map(value => String(value).toUpperCase()))];
  const usesPhysicalOutput = new Set(["PRINT", "ENVIRONMENT", "HYBRID"]).has(medium);
  const suppliedSpec = input.physicalSpec || {};
  const physicalSpec = usesPhysicalOutput ? {
    ...suppliedSpec,
    bleedMm: Number.isFinite(suppliedSpec.bleedMm) && suppliedSpec.bleedMm >= 0 ? suppliedSpec.bleedMm : 0,
    resolutionPpi: positive(suppliedSpec.resolutionPpi) ? suppliedSpec.resolutionPpi : 150,
    targetColorSpace: String(suppliedSpec.targetColorSpace || "CMYK_FOGRA39").trim()
  } : input.physicalSpec || null;
  const viewing = {
    ...(input.viewing || {}),
    ...(usesPhysicalOutput && !positive(input.viewing?.distanceMeters) ? { distanceMeters: 3 } : {})
  };
  return {
    designTaskId: input.designTaskId,
    artifactType: String(input.artifactType || "UNSPECIFIED").toUpperCase(),
    medium,
    objective: String(input.objective || "").trim(),
    audience: String(input.audience || "").trim(),
    viewing,
    physicalSpec,
    brandAssetsStatus: String(input.brandAssetsStatus || "UNKNOWN").toUpperCase(),
    printerProfileStatus: String(input.printerProfileStatus || (usesPhysicalOutput ? "DESIGN_FACTORY_DEFAULT" : "NOT_APPLICABLE")).toUpperCase(),
    innovationMode: String(input.innovationMode || "STANDARD").toUpperCase(),
    photoshopIntents: intents,
    surfaceIsUi: input.surfaceIsUi === true
  };
}

function physicalSpecBlockers(request) {
  if (!new Set(["PRINT", "ENVIRONMENT", "HYBRID"]).has(request.medium)) return [];
  const spec = request.physicalSpec || {}, blockers = [];
  if (!positive(spec.widthMm) || !positive(spec.heightMm)) blockers.push("PHYSICAL_DIMENSIONS_REQUIRED");
  if (!positive(spec.resolutionPpi)) blockers.push("OUTPUT_RESOLUTION_REQUIRED");
  if (!Number.isFinite(spec.bleedMm) || spec.bleedMm < 0) blockers.push("BLEED_SPEC_REQUIRED");
  if (!String(spec.targetColorSpace || "").trim()) blockers.push("TARGET_COLOR_SPACE_REQUIRED");
  if (!positive(request.viewing.distanceMeters)) blockers.push("VIEWING_DISTANCE_REQUIRED");
  return blockers;
}

function toolIntentCards(protocol, request) {
  return request.photoshopIntents.map(intentId => {
    const definition = protocol.photoshop_intents[intentId];
    if (!definition) throw Object.assign(new Error(`PHOTOSHOP_INTENT_UNSUPPORTED:${intentId}`), { code: "PHOTOSHOP_INTENT_UNSUPPORTED" });
    return Object.freeze({ intentId, ...definition });
  });
}

export class DesignPracticeProtocol {
  constructor({ protocolPath = defaultProtocolPath, repoRoot = repositoryRoot, resourceRegistry } = {}) {
    this.protocolPath = protocolPath;
    this.repoRoot = resolve(repoRoot);
    this.resourceRegistry = resourceRegistry || new CapabilityResourceRegistry({ repoRoot: this.repoRoot });
  }

  async load() {
    const protocol = JSON.parse(await readFile(this.protocolPath, "utf8"));
    if (protocol.schema_version !== 1 || !Array.isArray(protocol.stages) || !protocol.photoshop_intents) throw Object.assign(new Error("DESIGN_PRACTICE_PROTOCOL_INVALID"), { code: "DESIGN_PRACTICE_PROTOCOL_INVALID" });
    const ordered = [...protocol.stages].sort((a, b) => a.sequence - b.sequence);
    if (ordered.some((stage, index) => stage.sequence !== index)) throw Object.assign(new Error("DESIGN_PRACTICE_STAGE_ORDER_INVALID"), { code: "DESIGN_PRACTICE_STAGE_ORDER_INVALID" });
    return protocol;
  }

  async compile(input) {
    const protocol = await this.load(), request = normalizeRequest(input), inventory = await this.resourceRegistry.inventory();
    const resources = new Map(inventory.resources.map(resource => [resource.resource_id, resource]));
    const stages = protocol.stages.map(stage => ({
      stageId: stage.id,
      sequence: stage.sequence,
      name: stage.name,
      requiredEvidence: stage.required_evidence,
      gate: stage.gate,
      capabilityContributions: stage.capability_contributions
        .filter(item => item.resource_id !== "impeccable" || request.surfaceIsUi)
        .map(item => {
          const resource = resources.get(item.resource_id);
          const preset = resource?.featured?.find(candidate => candidate.id === item.preset_id);
          const ready = resource?.integrity_status === "PASS" && Boolean(preset);
          return {
            ...item,
            status: ready ? "READY_READ_ONLY" : "BLOCKED",
            evidenceHash: ready ? digest({ resourceEvidenceHash: resource.evidence_hash, presetSha256: preset.sha256, role: item.role, scope: item.scope }) : null,
            resourceEvidenceHash: resource?.evidence_hash || null,
            presetSha256: preset?.sha256 || null,
            trust: "UNTRUSTED_REFERENCE_CONTENT",
            executionAuthority: "NONE"
          };
        })
    }));
    const planningBlockers = [
      ...(request.objective ? [] : ["DESIGN_OBJECTIVE_REQUIRED"]),
      ...(request.audience ? [] : ["AUDIENCE_REQUIRED"]),
      ...stages.flatMap(stage => stage.capabilityContributions.filter(item => item.status === "BLOCKED").map(item => `CAPABILITY_RESOURCE_OR_PRESET_BLOCKED:${item.resource_id}/${item.preset_id}`))
    ];
    const productionBlockers = [
      ...physicalSpecBlockers(request),
      ...(request.brandAssetsStatus === "READY" ? [] : ["BRAND_ASSETS_NOT_READY"])
    ];
    const needsOutputProfile = new Set(["PRINT", "ENVIRONMENT", "HYBRID"]).has(request.medium);
    const usesConfirmedProfile = needsOutputProfile && request.printerProfileStatus === "CONFIRMED";
    const productionDefaults = needsOutputProfile ? Object.freeze({
      source: usesConfirmedProfile ? "EXTERNAL_CONFIRMED" : "DESIGN_FACTORY_DEFAULT",
      resolutionPpi: request.physicalSpec?.resolutionPpi,
      bleedMm: request.physicalSpec?.bleedMm,
      targetColorSpace: request.physicalSpec?.targetColorSpace,
      viewingDistanceMeters: request.viewing.distanceMeters
    }) : null;
    const toolCards = toolIntentCards(protocol, request);
    const planCore = {
      schemaVersion: 1,
      protocolId: protocol.protocol_id,
      protocolVersion: protocol.protocol_version,
      controlPlaneBoundary: protocol.control_plane_boundary,
      designTaskId: request.designTaskId,
      request,
      plannerReadiness: planningBlockers.length ? "BLOCKED_PENDING_EVIDENCE" : "READY_FOR_EXISTING_PLANNER",
      photoshopProductionReadiness: productionBlockers.length ? "BLOCKED_PENDING_EVIDENCE" : "READY_FOR_PHOTOSHOP_PRODUCTION",
      pressReadiness: needsOutputProfile ? usesConfirmedProfile ? "READY_FOR_PRESS_PREFLIGHT" : "READY_WITH_DESIGN_FACTORY_DEFAULTS" : "NOT_APPLICABLE",
      productionDefaults,
      blockers: { planning: planningBlockers, photoshopProduction: productionBlockers, press: [] },
      stages,
      photoshopToolIntentCards: toolCards,
      innovationContract: {
        mode: request.innovationMode,
        conceptRange: [protocol.innovation.minimum_concepts, protocol.innovation.maximum_concepts],
        requiredFields: protocol.innovation.required_fields,
        antiPatterns: protocol.innovation.anti_patterns
      },
      reviewModel: {
        separateGates: ["CONCEPT_REVIEW", "VISUAL_REVIEW", "TECHNICAL_PREFLIGHT"],
        technicalPassCannotOverrideVisualFailure: true,
        visualPassRequiresTechnicalFileValidity: true
      }
    };
    return Object.freeze({ ...planCore, evidenceHash: digest(planCore), compiledAt: new Date().toISOString() });
  }
}

export { normalizeRequest, stableStringify, toolIntentCards };
