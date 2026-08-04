const REQUIRED_PHOTOSHOP_GUARDRAILS = [
  "human_approval_before_document_write",
  "approved_template_operations_only",
  "whitelisted_operation_dsl_only",
  "technical_preflight_before_delivery",
  "artifact_manifest_sha256_required",
  "explicit_file_picker_for_external_paths",
  "runtime_activation_gate_required"
];

const forbiddenKeys = /^(api_key|secret|token|password|private_key|credential_value)$/i;
const rawExecutionKeys = /^(batchplay|descriptor|javascript|script|eval|_obj|_target|_path)$/i;
const governedOperations = new Set([
  "INSPECT_DOCUMENT", "SELECT_LAYER", "RENAME_LAYER", "SET_VISIBILITY", "SET_OPACITY", "SET_BLEND_MODE",
  "MOVE_LAYER", "RESIZE_LAYER", "ROTATE_LAYER", "DUPLICATE_LAYER", "RASTERIZE_LAYER", "CONVERT_TO_SMART_OBJECT",
  "REPLACE_TEXT", "SET_TEXT_COLOR", "SET_TEXT_STYLE", "CREATE_GROUP", "CREATE_PIXEL_LAYER", "CREATE_TEXT_LAYER",
  "CREATE_SOLID_FILL_LAYER", "PLACE_AS_SMART_OBJECT", "REPLACE_SMART_OBJECT", "CREATE_RECT_SELECTION",
  "CREATE_ELLIPSE_SELECTION", "CREATE_POLYGON_SELECTION", "DESELECT", "CREATE_WORK_PATH_FROM_SELECTION", "LOAD_WORK_PATH_AS_SELECTION", "CREATE_REVEAL_SELECTION_MASK",
  "APPLY_LAYER_MASK", "CREATE_ADJUSTMENT_LAYER", "APPLY_FILTER", "SAVE_COPY", "EXPORT_DOCUMENT"
]);
const designPracticeGates = ["TASK_MODEL", "RESEARCH_DIAGNOSIS", "CONCEPT_DIVERGENCE", "COPY_EDITING", "ART_DIRECTION", "COMPOSITION_PROTOTYPE", "ASSET_CREATION"];
const photoshopIntentIds = new Set(["DOCUMENT_ANALYSIS", "LAYER_STRUCTURE", "HERO_COMPOSITE", "TYPOGRAPHY", "SPATIAL_DEPTH", "MASKING", "COLOR_GRADE", "MATERIAL_DETAIL", "PRESS_OUTPUT"]);
const operationIntents = {
  INSPECT_DOCUMENT: "DOCUMENT_ANALYSIS", SELECT_LAYER: "DOCUMENT_ANALYSIS",
  RENAME_LAYER: "LAYER_STRUCTURE", SET_VISIBILITY: "LAYER_STRUCTURE", DUPLICATE_LAYER: "LAYER_STRUCTURE",
  CREATE_GROUP: "LAYER_STRUCTURE", CREATE_PIXEL_LAYER: "LAYER_STRUCTURE",
  SET_OPACITY: "SPATIAL_DEPTH", MOVE_LAYER: "SPATIAL_DEPTH", RESIZE_LAYER: "SPATIAL_DEPTH", ROTATE_LAYER: "SPATIAL_DEPTH",
  REPLACE_TEXT: "TYPOGRAPHY", SET_TEXT_COLOR: "TYPOGRAPHY", SET_TEXT_STYLE: "TYPOGRAPHY", CREATE_TEXT_LAYER: "TYPOGRAPHY",
  SET_BLEND_MODE: "COLOR_GRADE", CREATE_SOLID_FILL_LAYER: "COLOR_GRADE", CREATE_ADJUSTMENT_LAYER: "COLOR_GRADE",
  PLACE_AS_SMART_OBJECT: "HERO_COMPOSITE", REPLACE_SMART_OBJECT: "HERO_COMPOSITE", CONVERT_TO_SMART_OBJECT: "HERO_COMPOSITE",
  CREATE_RECT_SELECTION: "MASKING", CREATE_ELLIPSE_SELECTION: "MASKING", CREATE_POLYGON_SELECTION: "MASKING",
  DESELECT: "MASKING", CREATE_WORK_PATH_FROM_SELECTION: "MASKING", LOAD_WORK_PATH_AS_SELECTION: "MASKING", CREATE_REVEAL_SELECTION_MASK: "MASKING", APPLY_LAYER_MASK: "MASKING",
  RASTERIZE_LAYER: "MATERIAL_DETAIL", APPLY_FILTER: "MATERIAL_DETAIL",
  SAVE_COPY: "PRESS_OUTPUT", EXPORT_DOCUMENT: "PRESS_OUTPUT"
};
const v2OperationIntents = { REPLACE_TEXT: "TYPOGRAPHY", SET_TEXT_COLOR: "TYPOGRAPHY", REPLACE_SMART_OBJECT: "HERO_COMPOSITE", MOVE_LAYER: "SPATIAL_DEPTH", RESIZE_LAYER: "SPATIAL_DEPTH", SAVE_COPY: "PRESS_OUTPUT", EXPORT_DOCUMENT: "PRESS_OUTPUT" };

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function preflightReportSha256(preflight) {
  if (!preflight || !Array.isArray(preflight.issues)) return null;
  return sha256(stableStringify({
    score: preflight.score,
    disposition: preflight.disposition,
    exportAllowed: preflight.exportAllowed,
    note: preflight.note || null,
    issues: preflight.issues
  }));
}

function findForbiddenCredentialValues(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key];
    if (forbiddenKeys.test(key)) findings.push(next.join("."));
    findings.push(...findForbiddenCredentialValues(child, next));
  }
  return findings;
}

function findRawExecutionFields(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key];
    if (rawExecutionKeys.test(key)) findings.push(next.join("."));
    findings.push(...findRawExecutionFields(child, next));
  }
  return findings;
}

function validateOperationBoundary(job) {
  const schemaVersion = Number(job?.schemaVersion || 1);
  if (![2, 3].includes(schemaVersion)) return [];
  const maximum = schemaVersion === 3 ? 200 : 100;
  if (!Array.isArray(job.operations) || job.operations.length === 0 || job.operations.length > maximum) return [`Photoshop job requires 1 to ${maximum} operations.`];
  const blockers = [];
  const practice = job.practiceContext;
  if (!practice || practice.protocolId !== "design-practice-v1" || !/^\d+\.\d+\.\d+$/.test(practice?.protocolVersion || "") || !/^[a-f0-9]{64}$/i.test(practice?.evidenceHash || "") || !practice?.approvedDirectionId || practice?.stage !== "PHOTOSHOP_PRODUCTION") blockers.push("Photoshop work requires a valid Design Practice evidence context.");
  const passedGates = new Set(practice?.passedGates || []);
  for (const gate of designPracticeGates) if (!passedGates.has(gate)) blockers.push(`Design Practice gate is missing: ${gate}.`);
  const declaredIntents = new Set(practice?.toolIntentIds || []);
  for (const intent of declaredIntents) if (!photoshopIntentIds.has(intent)) blockers.push(`Unsupported Photoshop tool intent: ${intent}.`);
  const ids = new Set();
  let outputPhase = false;
  for (const [index, operation] of job.operations.entries()) {
    const operationName = String(operation?.operation || "").toUpperCase();
    if (!governedOperations.has(operationName)) blockers.push(`Unsupported Photoshop operation at index ${index}.`);
    if (!operation?.operationId || ids.has(operation.operationId)) blockers.push(`Operation IDs must be present and unique at index ${index}.`);
    ids.add(operation?.operationId);
    if (operation?.timeoutMs != null) blockers.push(`Per-operation timeout is not supported at index ${index}; Photoshop host calls cannot be safely interrupted.`);
    const isOutput = operationName === "SAVE_COPY" || operationName === "EXPORT_DOCUMENT";
    if (!isOutput && outputPhase) blockers.push(`All Photoshop output operations must form the terminal suffix of the plan; mutation found at index ${index}.`);
    if (isOutput) outputPhase = true;
    const requiredIntent = (schemaVersion === 3 ? operationIntents : v2OperationIntents)[operationName];
    if (requiredIntent && !declaredIntents.has(requiredIntent)) blockers.push(`${operationName} requires declared Photoshop intent ${requiredIntent}.`);
  }
  const rawPaths = findRawExecutionFields(job.operations);
  if (rawPaths.length) blockers.push(`Raw Photoshop execution fields are forbidden: ${rawPaths.join(", ")}`);
  if (schemaVersion === 3) {
    if (job?.capabilityProfile?.registryVersion !== "1.0.0") blockers.push("V3 Photoshop work requires capability registry version 1.0.0.");
    if (!job?.commandGraph?.graphId || !job?.commandGraph?.summary) blockers.push("V3 Photoshop work requires a compiled document-local command graph summary.");
    const requiredIntents = new Set(job.operations.map(operation => operationIntents[operation.operation]).filter(Boolean));
    for (const intent of requiredIntents) if (!declaredIntents.has(intent)) blockers.push(`V3 command graph requires declared Photoshop intent ${intent}.`);
  }
  return blockers;
}

export function evaluatePhotoshopUxpActivation({ adapter, proposal, node, job }) {
  const blockers = [];
  if (!adapter || adapter.adapter_id !== "photoshop-uxp") blockers.push("Photoshop UXP adapter is not registered.");
  if (adapter?.health_status !== "healthy") blockers.push("Photoshop UXP adapter health is not healthy.");
  for (const guardrail of REQUIRED_PHOTOSHOP_GUARDRAILS) {
    if (!(adapter?.guardrails ?? []).includes(guardrail)) blockers.push(`Missing guardrail: ${guardrail}`);
  }
  if (proposal?.status !== "APPROVED") blockers.push("A Studio proposal approval is required.");
  if (proposal?.approved_job_id !== job?.jobId) blockers.push("Approval is not bound to this Photoshop job.");
  if (!job?.governance?.approvalId || job?.governance?.approvedJobId !== job?.jobId || job?.governance?.approvalSource !== "STUDIO") blockers.push("Job approval provenance is missing or is not Studio-issued.");
  if (proposal?.approval_id !== job?.governance?.approvalId) blockers.push("Proposal approval ID is not bound to the job approval provenance.");
  if (node?.photoshop_running !== true) blockers.push("Photoshop node is not running.");
  if (node?.uxp_plugin_loaded !== true) blockers.push("UXP plugin is not loaded.");
  if (node?.interactive_user_session !== true) blockers.push("An interactive user session is required.");
  if (job?.requireApproval !== true || job?.governance?.executionMode !== "human_confirmed") blockers.push("Job does not require human confirmation.");
  if (job?.governance?.production !== false || job?.governance?.deploy !== false) blockers.push("Production and deployment flags must remain false.");
  const forbiddenPaths = findForbiddenCredentialValues({ proposal, node, job });
  if (forbiddenPaths.length) blockers.push(`Credential values are forbidden: ${forbiddenPaths.join(", ")}`);
  blockers.push(...validateOperationBoundary(job));
  return {
    status: blockers.length ? "BLOCKED" : "READY_FOR_INTERACTIVE_CONFIRMATION",
    blockers,
    credential_values_read: false,
    external_calls: "disabled",
    execution_mode: "human_confirmed"
  };
}

export function buildPhotoshopUxpDispatchPlan(input) {
  const activation = evaluatePhotoshopUxpActivation(input);
  return {
    schema_version: 2,
    adapter_id: "photoshop-uxp",
    runtime_id: "photoshop-uxp",
    job_id: input.job?.jobId ?? null,
    dry_run: true,
    execution_status: activation.status === "READY_FOR_INTERACTIVE_CONFIRMATION" ? "planned" : "blocked",
    activation,
    credential_reference_id: input.credentialReferenceId ?? null,
    credential_values_read: false,
    external_calls: "disabled",
    operation_dsl_version: Number(input.job?.schemaVersion || 1) === 3 ? 2 : Number(input.job?.schemaVersion || 1) === 2 ? 1 : null,
    capability_status: {
      studio_dispatch: "DRY_RUN_ONLY",
      photoshop_execution: "INTERACTIVE_CONFIRMATION_REQUIRED",
      technical_preflight: "PLUGIN_ENFORCED",
      artifact_manifest: "PLUGIN_ENFORCED"
    },
    steps: [
      "Resolve the existing Photoshop UXP adapter from Runtime Adapter Marketplace.",
      "Verify proposal approval is bound to the exact design job.",
      "Verify Photoshop, the UXP plugin, and an interactive user session are healthy.",
      "Deliver the validated job to the plugin without arbitrary Photoshop commands.",
      "Require the user to confirm in the plugin panel before executeAsModal.",
      "Return artifact references through the existing Studio task result boundary."
    ]
  };
}

export function evaluatePhotoshopUxpResult({ job, result }) {
  const blockers = [];
  const jobId = job?.jobId;
  if (!jobId) blockers.push("The dispatched Photoshop job is required for result verification.");
  if (!result || result.kind !== "PHOTOSHOP_DESIGN_RESULT") blockers.push("Result manifest kind is invalid.");
  if (result?.schemaVersion !== 1) blockers.push("Result manifest schema version is invalid.");
  if (result?.jobId !== jobId) blockers.push("Result manifest is not bound to the dispatched job.");
  if (result?.status !== "COMPLETED") blockers.push("Photoshop execution is not completed.");
  const expectedJobSpecSha256 = job ? sha256(stableStringify(job)) : null;
  if (!/^[a-f0-9]{64}$/i.test(result?.jobSpecSha256 || "") || result?.jobSpecSha256 !== expectedJobSpecSha256) blockers.push("Result is not bound to the exact dispatched job specification.");
  if (result?.approvedDocumentId == null) blockers.push("Result is not bound to an approved Photoshop document.");
  if (result?.approvalId !== job?.governance?.approvalId || result?.approvalSource !== "STUDIO") blockers.push("Result approval provenance is invalid.");
  if (!/^[a-f0-9]{64}$/i.test(result?.manifestSha256 || "")) blockers.push("Result manifest SHA-256 is missing or invalid.");
  else {
    const { manifestSha256, ...unsignedManifest } = result;
    if (sha256(stableStringify(unsignedManifest)) !== manifestSha256) blockers.push("Result manifest SHA-256 does not match its canonical content.");
  }
  if (!Array.isArray(result?.artifacts) || result.artifacts.length === 0) blockers.push("Result manifest contains no artifacts.");
  for (const [index, artifact] of (result?.artifacts || []).entries()) {
    if (!artifact?.name || !artifact?.format) blockers.push(`Artifact ${index} identity is incomplete.`);
    if (!/^[a-f0-9]{64}$/i.test(artifact?.sha256 || "")) blockers.push(`Artifact ${index} SHA-256 is missing or invalid.`);
    if (!Number.isInteger(artifact?.sizeBytes) || artifact.sizeBytes <= 0) blockers.push(`Artifact ${index} size is invalid.`);
  }
  const requiredFormats = (job?.outputs || []).filter(output => typeof output === "string" || output.required !== false).map(output => typeof output === "string" ? output : output.format);
  for (const format of requiredFormats) if (!(result?.artifacts || []).some(artifact => artifact.format === format)) blockers.push(`Required ${format} output is missing.`);
  if (!result?.preflight || result.preflight.exportAllowed !== true || !["READY", "REQUIRES_CONFIRMATION"].includes(result.preflight.disposition) || !Number.isInteger(result.preflight.issueCount) || result.preflight.issueCount !== result.preflight.issues?.length || !result.preflight.checkedAt || !/^[a-f0-9]{64}$/i.test(result.preflight.reportSha256 || "") || result.preflight.reportSha256 !== preflightReportSha256(result.preflight)) blockers.push("A complete, canonically checksummed technical preflight is required.");
  if (result?.governance?.humanConfirmed !== true || result?.governance?.approvedJobId !== jobId || result?.governance?.approvalId !== job?.governance?.approvalId || result?.governance?.approvalSource !== "STUDIO" || result?.governance?.production !== false || result?.governance?.deploy !== false) blockers.push("Result governance evidence is incomplete or invalid.");
  if (result?.preflight?.disposition === "REQUIRES_CONFIRMATION" && (result?.governance?.highRiskConfirmed !== true || result?.governance?.highRiskReportSha256 !== result.preflight.reportSha256)) blockers.push("High-risk preflight issues require a second confirmation bound to the exact report.");
  return { status: blockers.length ? "BLOCKED" : "READY_FOR_HUMAN_VISUAL_REVIEW", blockers, credential_values_read: false };
}

export { REQUIRED_PHOTOSHOP_GUARDRAILS, validateOperationBoundary };
import { createHash } from "node:crypto";
