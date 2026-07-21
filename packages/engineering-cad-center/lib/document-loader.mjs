import { extname } from "node:path";
import { CadError } from "./cad-errors.mjs";

const FORMATS = new Map([[".dxf", "DXF"], [".dwg", "DWG"], [".ifc", "IFC"], [".pdf", "PDF"]]);
export function detectCadFormat(filename, bytes) {
  const extension = extname(String(filename)).toLowerCase();
  const format = FORMATS.get(extension);
  if (!format) throw new CadError("CAD_FORMAT_UNSUPPORTED", `Unsupported CAD format: ${extension || "none"}`);
  const head = bytes.subarray(0, 64).toString("latin1");
  const valid = format === "DXF" ? (/SECTION|AutoCAD Binary DXF/.test(head)) : format === "PDF" ? head.startsWith("%PDF-") : format === "IFC" ? head.includes("ISO-10303-21") : /^AC10\d\d/.test(head);
  if (!valid) throw new CadError("CAD_SIGNATURE_INVALID", `File signature does not match ${format}`);
  return format;
}

export function loadCadDocument({ filename, content, maxBytes = 10 * 1024 * 1024 }) {
  if (!filename || filename.includes("\0")) throw new CadError("CAD_FILENAME_INVALID", "A safe filename is required");
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content ?? "");
  if (!bytes.length) throw new CadError("CAD_DOCUMENT_EMPTY", "CAD document is empty");
  if (bytes.length > maxBytes) throw new CadError("CAD_DOCUMENT_TOO_LARGE", `CAD document exceeds ${maxBytes} bytes`, { size: bytes.length, maxBytes });
  return Object.freeze({ filename, format: detectCadFormat(filename, bytes), size: bytes.length, bytes });
}
