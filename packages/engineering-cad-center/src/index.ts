export type CadFormat = "DXF" | "DWG" | "IFC" | "PDF";
export type CadPoint = { x: number; y: number; z?: number };
export type CadBounds = { min: CadPoint; max: CadPoint; width: number; height: number };
export type CadEntity = { id: string; type: string; layer: string; geometry: Record<string, unknown>; text?: string; blockName?: string };
export type UnifiedCadDocument = { schemaVersion: "1.0.0"; format: CadFormat; metadata: Record<string, unknown>; layers: Array<Record<string, unknown>>; blocks: Array<Record<string, unknown>>; entities: CadEntity[]; dimensions: CadEntity[]; statistics: Record<string, unknown>; bounds: CadBounds | null };
