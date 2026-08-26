import {
  evaluateReleaseReadiness,
  loadProductionOps,
  policySummary,
} from "../../production-ops/lib/production-ops-utils.mjs";

export class GrowthProductionOperationsPolicy {
  constructor({ load = loadProductionOps } = {}) {
    this.load = load;
  }

  async status() {
    const bundle = await this.load();
    const policy = policySummary(bundle);
    const readiness = evaluateReleaseReadiness(bundle);
    const productionGate = readiness.evaluations.find(
      (item) => item.operation_category === "production_operation",
    );
    return {
      status:
        readiness.production_operations_enabled === true &&
        productionGate?.status === "PASS"
          ? "AUTHORIZED"
          : "BLOCKED",
      policyId: policy.policy_id,
      mode: policy.mode,
      productionOperations: policy.production_operations,
      gateId: productionGate?.gate_id ?? null,
      gateStatus: productionGate?.status ?? "MISSING",
      reasons: productionGate?.reasons ?? ["production operation gate missing"],
      safety: {
        productionOperationsEnabled:
          readiness.production_operations_enabled === true,
        credentialValuesRead: readiness.credential_values_read === true,
        externalCallsPerformed: false,
        policyMutated: false,
      },
    };
  }

  async authorize() {
    return (await this.status()).status === "AUTHORIZED";
  }
}
