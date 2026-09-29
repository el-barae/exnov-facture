import { architecturalPrimitives, visibleWallParts } from "./architecture";
import { dimensionExtensionLines, dimensionLabel, dimensionTextPoint, distance, wallCorners } from "./geometry";
import type { CadPlan, Point } from "./types";
import { parsePlan } from "./validation";

/** DXF has line-based group values: never allow annotation text to create groups. */
function dxfText(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").replace(/\\/g, "/");
}
function layerName(value: string, index: number): string {
  return `L${index + 1}_${dxfText(value).replace(/[<>/\\":;?*|=,`]/g, "_").slice(0, 80)}`;
}
const n = (value: number) => Number(value.toFixed(8));

/** Basic editable DXF (AutoCAD 2007/UTF-8), model-space coordinates in metres. */
export function exportDxf(input: CadPlan): string {
  const plan = parsePlan(input);
  const records: string[] = [];
  let nextHandle = 0x100;
  function handle() { pair(5, (nextHandle++).toString(16).toUpperCase()); }
  function pair(code: number, value: string | number) { records.push(String(code), String(value)); }
  const layerNames = new Map(plan.layers.map((layer, index) => [layer.id, layerName(layer.name, index)]));
  function startEntity(type: string, layerId: string, subclass: string) {
    pair(0, type); handle(); pair(100, "AcDbEntity"); pair(8, layerNames.get(layerId) ?? "0"); pair(100, subclass);
  }
  function coordinate(point: Point, xCode = 10, yCode = 20, zCode = 30) {
    pair(xCode, n(point.x)); pair(yCode, n(-point.y)); pair(zCode, 0);
  }
  function line(start: Point, end: Point, layerId: string) {
    startEntity("LINE", layerId, "AcDbLine"); coordinate(start); coordinate(end, 11, 21, 31);
  }
  function polygon(points: Point[], layerId: string, closed = true) {
    startEntity("LWPOLYLINE", layerId, "AcDbPolyline"); pair(90, points.length); pair(70, closed ? 1 : 0);
    points.forEach((point) => { pair(10, n(point.x)); pair(20, n(-point.y)); });
  }
  function text(point: Point, value: string, fontSize: number, layerId: string, centered = false) {
    value.split(/\r?\n/).forEach((row, index) => {
      const position = { x: point.x, y: point.y + index * fontSize * 1.3 };
      startEntity("TEXT", layerId, "AcDbText"); coordinate(position); pair(40, n(fontSize)); pair(1, dxfText(row)); pair(50, 0); pair(7, "STANDARD");
      if (centered) { pair(72, 1); coordinate(position, 11, 21, 31); }
      pair(100, "AcDbText"); pair(73, 0);
    });
  }
  pair(0, "SECTION"); pair(2, "HEADER");
  pair(9, "$ACADVER"); pair(1, "AC1021");
  pair(9, "$DWGCODEPAGE"); pair(3, "ANSI_1252");
  pair(9, "$INSUNITS"); pair(70, 6);
  pair(9, "$MEASUREMENT"); pair(70, 1);
  pair(9, "$LUNITS"); pair(70, 2);
  pair(9, "$LUPREC"); pair(70, 4);
  pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "TABLES");
  pair(0, "TABLE"); pair(2, "LTYPE"); handle(); pair(100, "AcDbSymbolTable"); pair(70, 1);
  pair(0, "LTYPE"); handle(); pair(100, "AcDbSymbolTableRecord"); pair(100, "AcDbLinetypeTableRecord"); pair(2, "CONTINUOUS"); pair(70, 0); pair(3, "Solid line"); pair(72, 65); pair(73, 0); pair(40, 0);
  pair(0, "ENDTAB");
  pair(0, "TABLE"); pair(2, "LAYER"); handle(); pair(100, "AcDbSymbolTable"); pair(70, plan.layers.length + 1);
  function layerRecord(name: string, color: string, visible: boolean, locked: boolean) {
    pair(0, "LAYER"); handle(); pair(100, "AcDbSymbolTableRecord"); pair(100, "AcDbLayerTableRecord"); pair(2, name); pair(70, locked ? 4 : 0); pair(62, visible ? 7 : -7); pair(420, parseInt(color.slice(1), 16)); pair(6, "CONTINUOUS");
  }
  layerRecord("0", "#000000", true, false);
  plan.layers.forEach((layer) => layerRecord(layerNames.get(layer.id)!, layer.color, layer.visible, layer.locked));
  pair(0, "ENDTAB");
  pair(0, "TABLE"); pair(2, "STYLE"); handle(); pair(100, "AcDbSymbolTable"); pair(70, 1);
  pair(0, "STYLE"); handle(); pair(100, "AcDbSymbolTableRecord"); pair(100, "AcDbTextStyleTableRecord"); pair(2, "STANDARD"); pair(70, 0); pair(40, 0); pair(41, 1); pair(50, 0); pair(71, 0); pair(42, 0.3); pair(3, "txt"); pair(4, "");
  pair(0, "ENDTAB"); pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "BLOCKS"); pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "ENTITIES");
  const visibleLayers = new Set(plan.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  for (const entity of plan.entities) {
    if (!visibleLayers.has(entity.layerId)) continue;
    const { start, end, layerId } = entity;
    switch (entity.type) {
      case "line": line(start, end, layerId); break;
      case "wall": for (const part of visibleWallParts(plan, entity)) polygon(wallCorners(part), layerId); break;
      case "rectangle": polygon([start, { x: end.x, y: start.y }, end, { x: start.x, y: end.y }], layerId); break;
      case "circle": startEntity("CIRCLE", layerId, "AcDbCircle"); coordinate(start); pair(40, n(distance(start, end))); break;
      case "text": text(start, entity.text ?? "", entity.fontSize ?? 0.3, layerId); break;
      case "door": case "window": case "symbol": case "room":
        for (const primitive of architecturalPrimitives(entity)) {
          if (primitive.kind === "polyline") polygon(primitive.points, layerId, primitive.closed ?? false);
          else if (primitive.kind === "text") text(primitive.point, primitive.text, primitive.size, layerId, primitive.centered);
          else { startEntity("CIRCLE", layerId, "AcDbCircle"); coordinate(primitive.center); pair(40, n(primitive.radius)); }
        }
        break;
      case "dimension":
        for (const [from, to] of dimensionExtensionLines(entity)) line(from, to, layerId);
        line(start, end, layerId);
        for (const point of [start, end]) line({ x: point.x - 0.1, y: point.y - 0.1 }, { x: point.x + 0.1, y: point.y + 0.1 }, layerId);
        text(dimensionTextPoint(entity), dimensionLabel(entity), entity.fontSize ?? 0.24, layerId, true);
        break;
    }
  }
  pair(0, "ENDSEC"); pair(0, "EOF");
  return records.join("\r\n") + "\r\n";
}
