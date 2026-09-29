import { architecturalPrimitives, resolvePlanGeometry } from "./architecture";
import { GRID_STEP, type CadEntity, type CadPlan, type Point } from "./types";

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function snapPoint(point: Point, step = GRID_STEP): Point {
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("Le pas de grille doit être positif.");
  const snap = (value: number) => Number((Math.round(value / step) * step).toFixed(8));
  return { x: snap(point.x), y: snap(point.y) };
}

export function translateEntity(entity: CadEntity, delta: Point): CadEntity;
export function translateEntity(entity: CadEntity, dx: number, dy: number): CadEntity;
export function translateEntity(entity: CadEntity, delta: Point | number, dy?: number): CadEntity {
  const offset = typeof delta === "number" ? { x: delta, y: dy ?? 0 } : delta;
  return {
    ...entity,
    start: { x: entity.start.x + offset.x, y: entity.start.y + offset.y },
    end: { x: entity.end.x + offset.x, y: entity.end.y + offset.y },
    ...(entity.points ? { points: entity.points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })) } : {}),
  };
}

export function wallCorners(entity: CadEntity): Point[] {
  const length = distance(entity.start, entity.end);
  const halfWidth = (entity.thickness ?? 0.2) / 2;
  if (length === 0) return [
    { x: entity.start.x - halfWidth, y: entity.start.y - halfWidth },
    { x: entity.start.x + halfWidth, y: entity.start.y - halfWidth },
    { x: entity.start.x + halfWidth, y: entity.start.y + halfWidth },
    { x: entity.start.x - halfWidth, y: entity.start.y + halfWidth },
  ];
  const dx = -(entity.end.y - entity.start.y) / length * halfWidth;
  const dy = (entity.end.x - entity.start.x) / length * halfWidth;
  return [
    { x: entity.start.x + dx, y: entity.start.y + dy },
    { x: entity.end.x + dx, y: entity.end.y + dy },
    { x: entity.end.x - dx, y: entity.end.y - dy },
    { x: entity.start.x - dx, y: entity.start.y - dy },
  ];
}

export function dimensionLabel(entity: CadEntity): string {
  return `${distance(entity.start, entity.end).toFixed(2).replace(".", ",")} m`;
}

export function dimensionTextPoint(entity: CadEntity): Point {
  return { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 - 0.14 };
}

/** Resolved linked dimensions retain enough information to recover wall anchors. */
export function dimensionExtensionLines(entity: CadEntity): [Point, Point][] {
  if (entity.type !== "dimension" || !entity.wallId) return [];
  const size = distance(entity.start, entity.end);
  if (size === 0) return [];
  const offset = entity.offset ?? 0.6;
  const normal = { x: -(entity.end.y - entity.start.y) / size, y: (entity.end.x - entity.start.x) / size };
  return [entity.start, entity.end].map((point) => [{ x: point.x - normal.x * offset, y: point.y - normal.y * offset }, point]);
}

function pointsBounds(points: Point[]): Bounds {
  return points.reduce<Bounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x), minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x), maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function textBounds(point: Point, text: string, fontSize: number, centered = false): Bounds {
  const lines = text.split(/\r?\n/);
  const width = Math.max(0, ...lines.map((line) => Array.from(line).length)) * fontSize;
  const left = point.x - (centered ? width / 2 : 0);
  return { minX: left, minY: point.y - fontSize, maxX: left + width, maxY: point.y + (lines.length - 1) * fontSize * 1.3 + fontSize * 0.25 };
}

function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

export function entityBounds(entity: CadEntity): Bounds {
  const primitives = architecturalPrimitives(entity);
  if (primitives.length) return primitives.map((primitive) => {
    if (primitive.kind === "text") return textBounds(primitive.point, primitive.text, primitive.size, primitive.centered);
    if (primitive.kind === "circle") return { minX: primitive.center.x - primitive.radius, minY: primitive.center.y - primitive.radius, maxX: primitive.center.x + primitive.radius, maxY: primitive.center.y + primitive.radius };
    return pointsBounds(primitive.points);
  }).reduce(mergeBounds);
  if (entity.type === "circle") {
    const radius = distance(entity.start, entity.end);
    return { minX: entity.start.x - radius, minY: entity.start.y - radius, maxX: entity.start.x + radius, maxY: entity.start.y + radius };
  }
  if (entity.type === "wall") return pointsBounds(wallCorners(entity));
  if (entity.type === "text") return textBounds(entity.start, entity.text ?? "", entity.fontSize ?? 0.3);
  const bounds = pointsBounds([entity.start, entity.end]);
  if (entity.type === "dimension") {
    const ticksBounds = { minX: bounds.minX - 0.12, minY: bounds.minY - 0.12, maxX: bounds.maxX + 0.12, maxY: bounds.maxY + 0.12 };
    const labelAndTicks = mergeBounds(ticksBounds, textBounds(dimensionTextPoint(entity), dimensionLabel(entity), entity.fontSize ?? 0.24, true));
    const extensions = dimensionExtensionLines(entity).flat();
    return extensions.length ? mergeBounds(labelAndTicks, pointsBounds(extensions)) : labelAndTicks;
  }
  return bounds;
}

/** Hidden layers do not contribute to framing or exported drawings. */
export function planBounds(input: CadPlan): Bounds {
  const plan = resolvePlanGeometry(input);
  const visibleLayers = new Set(plan.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const entities = plan.entities.filter((entity) => visibleLayers.has(entity.layerId));
  if (entities.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  return entities.map(entityBounds).reduce(mergeBounds);
}
