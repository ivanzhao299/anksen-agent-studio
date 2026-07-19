export type SoftwareEngineeringRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SoftwareEngineeringContract {
  readonly schemaVersion: 1;
  readonly domain: "SOFTWARE_ENGINEERING";
  readonly contractId: string;
  readonly objective: string;
  readonly projectRootReference: string;
  readonly allowedPaths: readonly string[];
  readonly blockedPaths: readonly string[];
  readonly constraints: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly validationCommands: readonly string[];
  readonly expectedArtifacts: readonly string[];
  readonly riskLevel: SoftwareEngineeringRisk;
  readonly maxAttempts: number;
}

export interface DomainAcceptanceReport {
  readonly schemaVersion: 1;
  readonly contractId: string;
  readonly status: "PASS" | "FAIL" | "BLOCKED";
  readonly changedPaths: readonly string[];
  readonly findings: readonly string[];
  readonly evidence: Readonly<Record<string, unknown>>;
}
