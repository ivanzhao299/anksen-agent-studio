import { CadError } from "./cad-errors.mjs";
import { calculateBounds, calculateStatistics } from "./geometry.mjs";

const valueFor = (pairs, code, fallback = null) => pairs.find(pair => pair.code === code)?.value ?? fallback;
const numberFor = (pairs, code, fallback = 0) => Number(valueFor(pairs, code, fallback));

function tokenize(text) {
  const lines = text.replace(/\r/g, "").split("\n"); const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) { const code = Number(lines[i].trim()); if (!Number.isInteger(code)) throw new CadError("DXF_GROUP_CODE_INVALID", `Invalid DXF group code at line ${i + 1}`); pairs.push({ code, value: lines[i + 1].trim() }); }
  return pairs;
}

function parseEntity(type, pairs, index) {
  const base = { id: valueFor(pairs, 5, `entity-${index}`), type, layer: valueFor(pairs, 8, "0") };
  if (type === "LINE") return { ...base, geometry: { start:{x:numberFor(pairs,10),y:numberFor(pairs,20),z:numberFor(pairs,30)}, end:{x:numberFor(pairs,11),y:numberFor(pairs,21),z:numberFor(pairs,31)} } };
  if (["CIRCLE", "ARC"].includes(type)) return { ...base, geometry: { center:{x:numberFor(pairs,10),y:numberFor(pairs,20),z:numberFor(pairs,30)}, radius:numberFor(pairs,40), ...(type === "ARC" ? {startAngle:numberFor(pairs,50),endAngle:numberFor(pairs,51)} : {}) } };
  if (type === "LWPOLYLINE") { const points=[]; for(let i=0;i<pairs.length;i++) if(pairs[i].code===10) points.push({x:Number(pairs[i].value),y:Number(pairs.slice(i+1).find(p=>p.code===20)?.value??0)}); return {...base,geometry:{points,closed:(numberFor(pairs,70)&1)===1}}; }
  if (["TEXT","MTEXT"].includes(type)) return {...base,text:valueFor(pairs,1,""),geometry:{point:{x:numberFor(pairs,10),y:numberFor(pairs,20),z:numberFor(pairs,30)},height:numberFor(pairs,40)}};
  if (type === "INSERT") return {...base,blockName:valueFor(pairs,2,""),geometry:{point:{x:numberFor(pairs,10),y:numberFor(pairs,20),z:numberFor(pairs,30)}}};
  if (type === "DIMENSION") return {...base,text:valueFor(pairs,1,""),blockName:valueFor(pairs,2,""),geometry:{point:{x:numberFor(pairs,10),y:numberFor(pairs,20),z:numberFor(pairs,30)}}};
  return { ...base, geometry: {}, unsupported: true };
}

export function parseDxf(document) {
  if (document.format !== "DXF") throw new CadError("CAD_ADAPTER_UNAVAILABLE", `No ${document.format} parser is enabled in CAD-001`, { format: document.format });
  if (document.bytes.subarray(0,22).toString("latin1").startsWith("AutoCAD Binary DXF")) throw new CadError("DXF_BINARY_NOT_SUPPORTED", "CAD-001 supports ASCII DXF only");
  const pairs=tokenize(document.bytes.toString("utf8")); const entities=[]; const layers=new Map(); const blocks=new Set(); let section=null;
  for(let i=0;i<pairs.length;i++) { const pair=pairs[i]; if(pair.code===0&&pair.value==="SECTION") { section=pairs[++i]?.value === undefined ? null : (pairs[i].code===2?pairs[i].value:null); continue; } if(pair.code===0&&pair.value==="ENDSEC"){section=null;continue;} if(pair.code!==0||section!=="ENTITIES") continue; const type=pair.value; const body=[]; while(i+1<pairs.length&&pairs[i+1].code!==0) body.push(pairs[++i]); const entity=parseEntity(type,body,entities.length+1); entities.push(entity); layers.set(entity.layer,{name:entity.layer}); if(entity.blockName) blocks.add(entity.blockName); }
  const dimensions=entities.filter(e=>e.type==="DIMENSION");
  return { schemaVersion:"1.0.0", format:"DXF", metadata:{filename:document.filename,size:document.size,parser:"anksen-ascii-dxf-v1"}, layers:[...layers.values()], blocks:[...blocks].map(name=>({name})), entities, dimensions, statistics:calculateStatistics(entities), bounds:calculateBounds(entities) };
}
