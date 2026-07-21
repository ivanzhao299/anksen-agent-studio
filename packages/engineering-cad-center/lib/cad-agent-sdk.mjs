import { loadCadDocument } from "./document-loader.mjs";
import { parseDxf } from "./dxf-parser.mjs";
import { renderCadSvg } from "./preview.mjs";
import { CadError } from "./cad-errors.mjs";

export class CadAgentSdk {
  loadDocument(input) { return loadCadDocument(input); }
  convertDocument() { throw new CadError("CAD_CAPABILITY_NOT_IMPLEMENTED", "Document conversion is not enabled in CAD-001"); }
  parseDocument(input) { return parseDxf(this.loadDocument(input)); }
  extractLayers(doc) { return doc.layers; }
  extractEntities(doc) { return doc.entities; }
  extractBlocks(doc) { return doc.blocks; }
  extractTexts(doc) { return doc.entities.filter(e=>["TEXT","MTEXT"].includes(e.type)); }
  extractDimensions(doc) { return doc.dimensions; }
  calculateArea(doc) { return doc.statistics.totalArea; }
  calculateLength(doc) { return doc.statistics.totalLength; }
  validateDrawing(doc) { return { valid: doc.schemaVersion === "1.0.0" && Array.isArray(doc.entities), errors: [] }; }
  generateReport(doc) { return { format:doc.format, metadata:doc.metadata, statistics:doc.statistics, bounds:doc.bounds }; }
  preview(doc, options) { return renderCadSvg(doc, options); }
  exportPDF() { throw new CadError("CAD_CAPABILITY_NOT_IMPLEMENTED", "PDF export is not enabled in CAD-001"); }
  exportDXF() { throw new CadError("CAD_CAPABILITY_NOT_IMPLEMENTED", "DXF export is not enabled in CAD-001"); }
}
