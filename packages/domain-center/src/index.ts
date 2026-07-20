export type DomainMaturity = "RUNTIME_BOUND" | "PARTIAL";

export interface StudioDomainDescriptor {
  readonly id: string;
  readonly name: string;
  readonly nameEn: string;
  readonly maturity: DomainMaturity;
  readonly summary: string;
  readonly skillTypes: readonly string[];
  readonly keywords: readonly string[];
  readonly nextMilestone: string;
}

export interface DomainRouteDecision {
  readonly domainId: string;
  readonly confidence: number;
  readonly source: "EXPLICIT" | "KEYWORD" | "FALLBACK";
  readonly alternatives: readonly { readonly domainId: string; readonly score: number }[];
}
