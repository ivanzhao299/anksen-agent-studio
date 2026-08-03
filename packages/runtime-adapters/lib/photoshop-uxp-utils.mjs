const REQUIRED_PHOTOSHOP_GUARDRAILS = [
  "human_approval_before_document_write",
  "approved_template_operations_only",
  "explicit_file_picker_for_external_paths",
  "runtime_activation_gate_required"
];

const forbiddenKeys = /^(api_key|secret|token|password|private_key|credential_value)$/i;

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

export function evaluatePhotoshopUxpActivation({ adapter, proposal, node, job }) {
  const blockers = [];
  if (!adapter || adapter.adapter_id !== "photoshop-uxp") blockers.push("Photoshop UXP adapter is not registered.");
  if (adapter?.health_status !== "healthy") blockers.push("Photoshop UXP adapter health is not healthy.");
  for (const guardrail of REQUIRED_PHOTOSHOP_GUARDRAILS) {
    if (!(adapter?.guardrails ?? []).includes(guardrail)) blockers.push(`Missing guardrail: ${guardrail}`);
  }
  if (proposal?.status !== "APPROVED") blockers.push("A Studio proposal approval is required.");
  if (proposal?.approved_job_id !== job?.jobId) blockers.push("Approval is not bound to this Photoshop job.");
  if (node?.photoshop_running !== true) blockers.push("Photoshop node is not running.");
  if (node?.uxp_plugin_loaded !== true) blockers.push("UXP plugin is not loaded.");
  if (node?.interactive_user_session !== true) blockers.push("An interactive user session is required.");
  if (job?.requireApproval !== true || job?.governance?.executionMode !== "human_confirmed") blockers.push("Job does not require human confirmation.");
  if (job?.governance?.production !== false || job?.governance?.deploy !== false) blockers.push("Production and deployment flags must remain false.");
  const forbiddenPaths = findForbiddenCredentialValues({ proposal, node, job });
  if (forbiddenPaths.length) blockers.push(`Credential values are forbidden: ${forbiddenPaths.join(", ")}`);
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
    schema_version: 1,
    adapter_id: "photoshop-uxp",
    runtime_id: "photoshop-uxp",
    job_id: input.job?.jobId ?? null,
    dry_run: true,
    execution_status: activation.status === "READY_FOR_INTERACTIVE_CONFIRMATION" ? "planned" : "blocked",
    activation,
    credential_reference_id: input.credentialReferenceId ?? null,
    credential_values_read: false,
    external_calls: "disabled",
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

export { REQUIRED_PHOTOSHOP_GUARDRAILS };
