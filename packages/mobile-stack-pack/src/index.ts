export type MobilePlatform = "ios" | "android";
export type MobileRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type MobileGateAction = "allowed_dry_run" | "proposal_only" | "human_approval_required";

export interface MobileStackIndicator {
  readonly name: string;
  readonly present: boolean;
  readonly evidence: readonly string[];
}

export interface MobileDetectionResult {
  readonly platform: MobilePlatform;
  readonly project_id: string;
  readonly status: "PASS" | "PARTIAL" | "FAIL";
  readonly dry_run: boolean;
  readonly indicators: readonly MobileStackIndicator[];
  readonly commands: readonly string[];
}

export interface MobileGovernanceGate {
  readonly action: string;
  readonly risk: MobileRisk;
  readonly gate_action: MobileGateAction;
  readonly approval_required: boolean;
}

export interface MobileWorkerRequirement {
  readonly platform: MobilePlatform;
  readonly required_os: readonly string[];
  readonly simulator_or_emulator_required: boolean;
  readonly signing_reference_only: boolean;
}
