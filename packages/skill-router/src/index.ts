export type SkillType =
  | "code_development"
  | "document_generation"
  | "spreadsheet_analysis"
  | "slide_generation"
  | "image_generation"
  | "pdf_processing"
  | "web_research"
  | "data_integration"
  | "validation_testing"
  | "evolution_observer";

export interface SkillRouteResult {
  readonly skillType: SkillType;
  readonly confidence: number;
  readonly reason: string;
}

