import { architecturalPrimitives, visibleWallParts } from "./architecture";
import { dimensionExtensionLines, dimensionLabel, dimensionTextPoint, distance, planBounds, wallCorners } from "./geometry";
import type { CadEntity, CadPlan, Point } from "./types";
import { parsePlan } from "./validation";

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const n = (value: number) => String(Number(value.toFixed(6)));
function line(start: Point, end: Point): string {
  return `<line x1="${n(start.x)}" y1="${n(start.y)}" x2="${n(end.x)}" y2="${n(end.y)}"/>`;
}
function text(point: Point, value: string, fontSize: number, color: string, centered = false): string {
  const lines = value.split(/\r?\n/);
  return `<text x="${n(point.x)}" y="${n(point.y)}" font-size="${n(fontSize)}" fill="${color}" stroke="none"${centered ? ' text-anchor="middle"' : ""}>${lines.map((value, index) => `<tspan x="${n(point.x)}" dy="${index ? n(fontSize * 1.3) : "0"}">${xml(value)}</tspan>`).join("")}</text>`;
}
function renderEntity(entity: CadEntity, color: string): string {
  const { start, end } = entity;
  switch (entity.type) {
    case "line": return line(start, end);
    case "wall": return `<polygon points="${wallCorners(entity).map((point) => `${n(point.x)},${n(point.y)}`).join(" ")}" fill="${color}" fill-opacity="0.2"/>`;
    case "rectangle": return `<rect x="${n(Math.min(start.x, end.x))}" y="${n(Math.min(start.y, end.y))}" width="${n(Math.abs(end.x - start.x))}" height="${n(Math.abs(end.y - start.y))}"/>`;
    case "circle": return `<circle cx="${n(start.x)}" cy="${n(start.y)}" r="${n(distance(start, end))}"/>`;
    case "text": return text(start, entity.text ?? "", entity.fontSize ?? 0.3, color);
    case "door": case "window": case "symbol": case "room":
      return architecturalPrimitives(entity).map((primitive) => {
        if (primitive.kind === "text") return text(primitive.point, primitive.text, primitive.size, color, primitive.centered);
        if (primitive.kind === "circle") return `<circle cx="${n(primitive.center.x)}" cy="${n(primitive.center.y)}" r="${n(primitive.radius)}"/>`;
        return `<${primitive.closed ? "polygon" : "polyline"} points="${primitive.points.map((point) => `${n(point.x)},${n(point.y)}`).join(" ")}"${primitive.fill ? ` fill="${color}" fill-opacity="0.07"` : ""}/>`;
      }).join("");
    case "dimension": return dimensionExtensionLines(entity).map(([from, to]) => line(from, to)).join("") + line(start, end) + [start, end].map((point) => line({ x: point.x - 0.1, y: point.y - 0.1 }, { x: point.x + 0.1, y: point.y + 0.1 })).join("") + text(dimensionTextPoint(entity), dimensionLabel(entity), entity.fontSize ?? 0.24, color, true);
  }
}

/** Shared viewBox dimensions in metres, including export padding. */
export function svgBounds(plan: CadPlan): { x: number; y: number; width: number; height: number } {
  const bounds = planBounds(plan);
  const margin = 0.5;
  const width = Math.max(1, bounds.maxX - bounds.minX + margin * 2);
  const height = Math.max(1, bounds.maxY - bounds.minY + margin * 2);
  const x = bounds.minX - margin;
  const y = bounds.minY - margin;
  return { x, y, width, height };
}

/** Standalone vector image in metres, suitable for browsers and print. */
export function exportSvg(input: CadPlan): string {
  const plan = parsePlan(input);
  const { x, y, width, height } = svgBounds(plan);
  const scale = 1200 / Math.max(width, height);
  // Room tints form the background, independent of their layer order.
  const groups = [true, false].flatMap((rooms) => plan.layers.filter((layer) => layer.visible).map((layer) => `<g id="${xml(layer.id)}${rooms ? "-rooms" : ""}" stroke="${layer.color}" fill="none">${plan.entities.filter((entity) => entity.layerId === layer.id && (entity.type === "room") === rooms).flatMap((entity) => entity.type === "wall" ? visibleWallParts(plan, entity) : [entity]).map((entity) => renderEntity(entity, layer.color)).join("\n")}</g>`)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(width * scale))}" height="${Math.max(1, Math.round(height * scale))}" viewBox="${n(x)} ${n(y)} ${n(width)} ${n(height)}" role="img" aria-labelledby="plan-title">\n<title id="plan-title">${xml(plan.name)}</title>\n<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="#ffffff"/>\n<g stroke-width="0.025" stroke-linecap="round" stroke-linejoin="round" font-family="Arial, sans-serif">\n${groups}\n</g>\n</svg>\n`;
}
