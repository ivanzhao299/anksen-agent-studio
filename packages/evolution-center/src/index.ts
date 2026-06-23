export interface ImprovementCandidate {
  readonly improvementId: string;
  readonly title: string;
  readonly priority: "P0" | "P1" | "P2";
  readonly risk: "LOW" | "MEDIUM" | "HIGH";
}

export const evolutionCenterStatus = "skeleton";

