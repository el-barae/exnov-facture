import type { CadEntity, CadPlan, CadPrimitive, Point, SymbolId } from "./types";
export type { CadPrimitive } from "./types";

export const SYMBOLS: { id: SymbolId; label: string; width: number; height: number }[] = [
  { id: "bed", label: "Lit double", width: 1.6, height: 2 },
  { id: "sofa", label: "Canapé", width: 2.2, height: 0.9 },
  { id: "table", label: "Table", width: 1.6, height: 0.9 },
  { id: "sink", label: "Lavabo", width: 0.6, height: 0.5 },
  { id: "toilet", label: "WC", width: 0.4, height: 0.7 },
  { id: "stairs", label: "Escalier", width: 1, height: 3 },
  { id: "north", label: "Flèche du nord", width: 0.6, height: 1 },
];
const EPSILON = 1e-8;
const length = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const plus = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function invalid(message: string): never { throw new Error(`Plan invalide : ${message}`); }
function wallFrame(wall: CadEntity) {
  const size = length(wall.start, wall.end);
  if (wall.type !== "wall" || size < EPSILON) invalid("le mur support doit avoir une longueur non nulle.");
  const along = { x: (wall.end.x - wall.start.x) / size, y: (wall.end.y - wall.start.y) / size };
  return { size, along, normal: { x: -along.y, y: along.x } };
}
function findWall(plan: CadPlan, id: string): CadEntity {
  const wall = plan.entities.find((entity) => entity.id === id);
  if (!wall || wall.type !== "wall") invalid("une ouverture ou une cote fait référence à un mur inexistant.");
  return wall;
}
function writable(plan: CadPlan, entity: CadEntity): void {
  const layer = plan.layers.find((candidate) => candidate.id === entity.layerId);
  if (!layer) invalid("un objet fait référence à un calque inexistant.");
  if (layer.locked || !layer.visible) throw new Error(`Le calque « ${layer.name} » est ${layer.locked ? "verrouillé" : "masqué"}. Rendez-le visible et déverrouillez-le pour modifier cet objet et ses objets liés.`);
}
function resolveEntity(plan: CadPlan, entity: CadEntity): CadEntity {
  if (entity.wallAttachment) {
    if (entity.type !== "door" && entity.type !== "window") invalid("seules les portes et fenêtres peuvent être attachées à un mur.");
    const wall = findWall(plan, entity.wallAttachment.wallId);
    const frame = wallFrame(wall);
    const { width, t } = entity.wallAttachment;
    if (!Number.isFinite(width) || width <= 0 || width > frame.size + EPSILON) invalid("la largeur de l’ouverture dépasse la longueur de son mur support.");
    if (!Number.isFinite(t)) invalid("la position de l’ouverture doit être un nombre fini.");
    const actualWidth = Math.min(width, frame.size);
    const half = actualWidth / (2 * frame.size);
    const center = Math.max(half, Math.min(1 - half, t));
    const at = (position: number) => ({ x: wall.start.x + frame.along.x * position, y: wall.start.y + frame.along.y * position });
    return { ...entity, start: at(center * frame.size - actualWidth / 2), end: at(center * frame.size + actualWidth / 2), thickness: wall.thickness ?? 0.2, wallAttachment: { wallId: wall.id, t: center, width: actualWidth } };
  }
  if (entity.wallId) {
    if (entity.type !== "dimension") invalid("seules les cotes peuvent référencer un mur.");
    const wall = findWall(plan, entity.wallId);
    const { normal } = wallFrame(wall);
    const offset = entity.offset ?? 0.6;
    if (!Number.isFinite(offset)) invalid("le décalage de la cote doit être un nombre fini.");
    const delta = { x: normal.x * offset, y: normal.y * offset };
    return { ...entity, offset, start: plus(wall.start, delta), end: plus(wall.end, delta) };
  }
  if (entity.type === "door" || entity.type === "window") invalid("une porte ou fenêtre doit être attachée à un mur.");
  if (entity.type === "room") {
    validateRoomPoints(entity.points ?? []);
    return { ...entity, start: { ...entity.points![0] }, end: { ...entity.points![entity.points!.length - 1] } };
  }
  return entity;
}

/** Rebuild derived coordinates from their authoritative wall/polygon references. */
export function resolvePlanGeometry(plan: CadPlan): CadPlan {
  return { ...plan, entities: plan.entities.map((entity) => resolveEntity(plan, entity)) };
}

/** Atomically update a wall and all its linked geometry, respecting protected layers. */
export function updatePlanEntity(plan: CadPlan, entity: CadEntity): CadPlan {
  const original = plan.entities.find((candidate) => candidate.id === entity.id);
  if (!original) invalid("l’objet à modifier est introuvable.");
  writable(plan, original);
  writable(plan, entity);
  if (original.wallAttachment && (entity.type !== original.type || JSON.stringify(original.wallAttachment) !== JSON.stringify(entity.wallAttachment))) writable(plan, findWall(plan, original.wallAttachment.wallId));
  if (entity.wallAttachment && (entity.type !== original.type || JSON.stringify(original.wallAttachment) !== JSON.stringify(entity.wallAttachment))) writable(plan, findWall(plan, entity.wallAttachment.wallId));
  const next = resolvePlanGeometry({ ...plan, entities: plan.entities.map((candidate) => candidate.id === entity.id ? entity : candidate) });
  const previous = new Map(plan.entities.map((candidate) => [candidate.id, candidate]));
  for (const candidate of next.entities) {
    const before = previous.get(candidate.id)!;
    if (JSON.stringify(before) !== JSON.stringify(candidate)) writable(plan, before);
  }
  return next;
}

/** Wall deletion also removes linked openings and dimensions in the same undo step. */
export function removePlanEntity(plan: CadPlan, id: string): CadPlan {
  const ids = new Set(plan.entities.filter((entity) => entity.id === id || entity.wallId === id || entity.wallAttachment?.wallId === id).map((entity) => entity.id));
  for (const entity of plan.entities) if (ids.has(entity.id)) {
    writable(plan, entity);
    if (entity.wallAttachment) writable(plan, findWall(plan, entity.wallAttachment.wallId));
  }
  return { ...plan, entities: plan.entities.filter((entity) => !ids.has(entity.id)) };
}

export function createWallDimension(plan: CadPlan, wallId: string, offset = 0.6): CadEntity {
  const wall = findWall(plan, wallId);
  writable(plan, wall);
  const layer = plan.layers.find((candidate) => candidate.id === "cotes" && candidate.visible && !candidate.locked) ?? plan.layers.find((candidate) => candidate.id === wall.layerId)!;
  return resolveEntity(plan, { id: crypto.randomUUID(), type: "dimension", layerId: layer.id, wallId, offset, start: wall.start, end: wall.end, fontSize: 0.24 });
}

export function attachOpening(plan: CadPlan, type: "door" | "window", wallId: string, point: Point, width: number, layerId: string): CadEntity {
  const wall = findWall(plan, wallId);
  writable(plan, wall);
  const frame = wallFrame(wall);
  const t = dot({ x: point.x - wall.start.x, y: point.y - wall.start.y }, frame.along) / frame.size;
  const entity: CadEntity = { id: crypto.randomUUID(), type, layerId, start: point, end: point, wallAttachment: { wallId, t, width } };
  writable(plan, entity);
  return resolveEntity(plan, entity);
}

export function moveEntity(plan: CadPlan, entity: CadEntity, delta: Point): CadEntity {
  if (entity.wallAttachment) {
    const frame = wallFrame(findWall(plan, entity.wallAttachment.wallId));
    return resolveEntity(plan, { ...entity, wallAttachment: { ...entity.wallAttachment, t: entity.wallAttachment.t + dot(delta, frame.along) / frame.size } });
  }
  if (entity.type === "dimension" && entity.wallId) {
    const frame = wallFrame(findWall(plan, entity.wallId));
    return resolveEntity(plan, { ...entity, offset: (entity.offset ?? 0.6) + dot(delta, frame.normal) });
  }
  return { ...entity, start: plus(entity.start, delta), end: plus(entity.end, delta), ...(entity.points ? { points: entity.points.map((point) => plus(point, delta)) } : {}) };
}

export function roomArea(entity: CadEntity): number {
  const points = entity.points ?? [];
  // Subtract an origin before products to retain precision for distant drawings.
  const origin = points[0] ?? { x: 0, y: 0 };
  return Math.abs(points.reduce((sum, current, index) => sum + cross(origin, current, points[(index + 1) % points.length]), 0)) / 2;
}

export function roomCentroid(entity: CadEntity): Point {
  const points = entity.points ?? [];
  if (!points.length) return { ...entity.start };
  const origin = points[0];
  let twiceArea = 0, x = 0, y = 0;
  points.forEach((current, index) => {
    const next = points[(index + 1) % points.length];
    const weight = cross(origin, current, next);
    twiceArea += weight;
    x += (current.x + next.x - 2 * origin.x) * weight;
    y += (current.y + next.y - 2 * origin.y) * weight;
  });
  if (Math.abs(twiceArea) < EPSILON) return { ...origin };
  return { x: origin.x + x / (3 * twiceArea), y: origin.y + y / (3 * twiceArea) };
}

export function validateRoomPoints(points: Point[]): void {
  if (!Array.isArray(points) || points.length < 3 || points.length > 64) invalid("une pièce doit avoir entre 3 et 64 sommets.");
  for (const point of points) if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) invalid("les sommets de la pièce doivent être des coordonnées finies.");
  const onSegment = (a: Point, b: Point, p: Point) => Math.abs(cross(a, b, p)) < EPSILON && p.x >= Math.min(a.x, b.x) - EPSILON && p.x <= Math.max(a.x, b.x) + EPSILON && p.y >= Math.min(a.y, b.y) - EPSILON && p.y <= Math.max(a.y, b.y) + EPSILON;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (length(a, b) < EPSILON) invalid("deux sommets consécutifs d’une pièce ne peuvent pas être identiques.");
    // Adjacent edges may be collinear, but must not fold back over one another.
    const previous = points[(i + points.length - 1) % points.length];
    if (onSegment(a, b, previous) || onSegment(previous, a, b)) invalid("le contour d’une pièce ne peut pas se replier sur lui-même.");
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
      if ((abC * abD < 0 && cdA * cdB < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) invalid("le contour d’une pièce ne doit pas se croiser.");
    }
  }
  const area = Math.abs(points.reduce((sum, current, index) => sum + cross(points[0], current, points[(index + 1) % points.length]), 0)) / 2;
  if (area < EPSILON) invalid("la surface de la pièce doit être non nulle.");
}

/** Genuine gaps in walls; overlapping openings merge and hidden openings leave no gap. */
export function visibleWallParts(plan: CadPlan, wall: CadEntity): CadEntity[] {
  const size = length(wall.start, wall.end);
  if (wall.type !== "wall" || size < EPSILON) return [wall];
  const visible = new Set(plan.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const intervals = plan.entities.filter((entity) => visible.has(entity.layerId) && entity.wallAttachment?.wallId === wall.id).map((entity) => {
    const attachment = entity.wallAttachment!;
    const half = attachment.width / (2 * size);
    const center = Math.max(half, Math.min(1 - half, attachment.t));
    return [Math.max(0, center - half), Math.min(1, center + half)];
  }).sort((a, b) => a[0] - b[0]);
  if (!intervals.length) return [wall];
  const parts: CadEntity[] = [];
  const at = (t: number) => ({ x: wall.start.x + (wall.end.x - wall.start.x) * t, y: wall.start.y + (wall.end.y - wall.start.y) * t });
  const add = (start: number, end: number) => { if (end - start > EPSILON) parts.push({ ...wall, start: at(start), end: at(end) }); };
  let cursor = 0;
  for (const [start, end] of intervals) { add(cursor, start); cursor = Math.max(cursor, end); }
  add(cursor, 1);
  return parts;
}

/** Shared world-coordinate primitives keep canvas, SVG, PDF and DXF in agreement. */
export function architecturalPrimitives(entity: CadEntity): CadPrimitive[] {
  const poly = (points: Point[], closed = false, fill = false): CadPrimitive => ({ kind: "polyline", points, closed, fill });
  if (entity.type === "room") {
    const center = roomCentroid(entity);
    const size = entity.fontSize ?? 0.26;
    return [poly(entity.points ?? [], true, true), { kind: "text", point: { x: center.x, y: center.y - size * 0.35 }, text: `${entity.text || "Pièce"}\n${roomArea(entity).toFixed(2).replace(".", ",")} m²`, size, centered: true }];
  }
  if (entity.type === "door" || entity.type === "window") {
    const width = length(entity.start, entity.end);
    if (width < EPSILON) return [];
    const along = { x: (entity.end.x - entity.start.x) / width, y: (entity.end.y - entity.start.y) / width };
    const swing = entity.type === "door" ? (entity.swing ?? 1) : 1;
    const normal = { x: -along.y * swing, y: along.x * swing };
    const local = (x: number, y: number): Point => ({ x: entity.start.x + along.x * x + normal.x * y, y: entity.start.y + along.y * x + normal.y * y });
    const half = (entity.thickness ?? 0.2) / 2;
    const jambs = [poly([local(0, -half), local(0, half)]), poly([local(width, -half), local(width, half)])];
    if (entity.type === "window") return [...jambs, ...[-half, 0, half].map((offset) => poly([local(0, offset), local(width, offset)]))];
    return [...jambs, poly([local(0, 0), local(0, width)]), poly(Array.from({ length: 25 }, (_, index) => { const angle = index * Math.PI / 48; return local(width * Math.cos(angle), width * Math.sin(angle)); }))];
  }
  if (entity.type !== "symbol") return [];
  const minX = Math.min(entity.start.x, entity.end.x), minY = Math.min(entity.start.y, entity.end.y);
  const width = Math.abs(entity.end.x - entity.start.x), height = Math.abs(entity.end.y - entity.start.y);
  const center = { x: minX + width / 2, y: minY + height / 2 };
  const angle = (entity.rotation ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const at = (x: number, y: number): Point => ({ x: center.x + (x - 0.5) * width * cos - (y - 0.5) * height * sin, y: center.y + (x - 0.5) * width * sin + (y - 0.5) * height * cos });
  const rect = (x1: number, y1: number, x2: number, y2: number) => poly([at(x1, y1), at(x2, y1), at(x2, y2), at(x1, y2)], true);
  const stroke = (x1: number, y1: number, x2: number, y2: number) => poly([at(x1, y1), at(x2, y2)]);
  switch (entity.symbolId) {
    case "bed": return [rect(0, 0, 1, 1), rect(0.07, 0.06, 0.46, 0.24), rect(0.54, 0.06, 0.93, 0.24), stroke(0, 0.32, 1, 0.32)];
    case "sofa": return [rect(0, 0, 1, 1), rect(0.09, 0.24, 0.91, 0.9), stroke(0.36, 0.24, 0.36, 0.9), stroke(0.64, 0.24, 0.64, 0.9), stroke(0.09, 0, 0.09, 1), stroke(0.91, 0, 0.91, 1)];
    case "table": return [rect(0.08, 0.12, 0.92, 0.88), rect(0.15, 0, 0.4, 0.12), rect(0.6, 0, 0.85, 0.12), rect(0.15, 0.88, 0.4, 1), rect(0.6, 0.88, 0.85, 1)];
    case "sink": return [rect(0, 0, 1, 1), poly(Array.from({ length: 32 }, (_, i) => at(0.5 + 0.38 * Math.cos(i * Math.PI / 16), 0.55 + 0.3 * Math.sin(i * Math.PI / 16))), true), { kind: "circle", center: at(0.5, 0.55), radius: Math.min(width, height) * 0.04 }, stroke(0.5, 0.08, 0.5, 0.27)];
    case "toilet": return [rect(0, 0, 1, 0.25), poly(Array.from({ length: 33 }, (_, i) => at(0.5 + 0.42 * Math.cos(i * Math.PI / 16), 0.6 + 0.37 * Math.sin(i * Math.PI / 16))), true)];
    case "stairs": return [rect(0, 0, 1, 1), ...Array.from({ length: 9 }, (_, i) => stroke(0, (i + 1) / 10, 1, (i + 1) / 10)), stroke(0.5, 0.88, 0.5, 0.12), poly([at(0.33, 0.25), at(0.5, 0.12), at(0.67, 0.25)])];
    case "north": return [poly([at(0.5, 0.22), at(0.08, 0.9), at(0.5, 0.73), at(0.92, 0.9)], true), stroke(0.5, 0.22, 0.5, 1), { kind: "text", point: at(0.5, 0.1), text: "N", size: Math.min(width * 0.45, height * 0.2), centered: true }];
    default: return [rect(0, 0, 1, 1)];
  }
}
