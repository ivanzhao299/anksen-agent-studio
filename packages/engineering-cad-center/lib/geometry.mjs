const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const distance = (a, b) => Math.hypot(finite(b.x) - finite(a.x), finite(b.y) - finite(a.y));

export function entityMeasurements(entity) {
  const g = entity.geometry ?? {};
  if (entity.type === "LINE") return { length: distance(g.start, g.end), area: 0 };
  if (entity.type === "CIRCLE") { const r = Math.abs(finite(g.radius)); return { length: 2 * Math.PI * r, area: Math.PI * r * r }; }
  if (entity.type === "ARC") { const sweep = ((finite(g.endAngle) - finite(g.startAngle)) % 360 + 360) % 360; return { length: Math.abs(finite(g.radius)) * sweep * Math.PI / 180, area: 0 }; }
  if (entity.type === "LWPOLYLINE") {
    const points = g.points ?? []; let length = 0; for (let i = 1; i < points.length; i++) length += distance(points[i - 1], points[i]);
    if (g.closed && points.length > 2) length += distance(points.at(-1), points[0]);
    let area = 0; if (g.closed) for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += finite(a.x) * finite(b.y) - finite(b.x) * finite(a.y); }
    return { length, area: Math.abs(area) / 2 };
  }
  return { length: 0, area: 0 };
}

export function calculateStatistics(entities) {
  const byType = {}, byLayer = {}; let totalLength = 0, totalArea = 0;
  for (const entity of entities) { byType[entity.type] = (byType[entity.type] ?? 0) + 1; byLayer[entity.layer] = (byLayer[entity.layer] ?? 0) + 1; const m = entityMeasurements(entity); totalLength += m.length; totalArea += m.area; }
  return { entityCount: entities.length, byType, byLayer, totalLength, totalArea };
}

export function calculateBounds(entities) {
  const points = [];
  for (const e of entities) { const g = e.geometry ?? {}; if (g.start) points.push(g.start); if (g.end) points.push(g.end); if (g.point) points.push(g.point); if (g.center) { const r = Math.abs(finite(g.radius)); points.push({x:g.center.x-r,y:g.center.y-r},{x:g.center.x+r,y:g.center.y+r}); } if (Array.isArray(g.points)) points.push(...g.points); }
  if (!points.length) return null;
  const xs = points.map(p => finite(p.x)), ys = points.map(p => finite(p.y)); const min = {x:Math.min(...xs),y:Math.min(...ys)}, max = {x:Math.max(...xs),y:Math.max(...ys)};
  return { min, max, width: max.x - min.x, height: max.y - min.y };
}
