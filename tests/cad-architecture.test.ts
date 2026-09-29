import test from "node:test";
import assert from "node:assert/strict";
import { architecturalPrimitives, attachOpening, createWallDimension, moveEntity, removePlanEntity, resolvePlanGeometry, roomArea, roomCentroid, SYMBOLS, updatePlanEntity, validateRoomPoints, visibleWallParts } from "../src/lib/cad/architecture";
import { dimensionExtensionLines, dimensionLabel, entityBounds, planBounds } from "../src/lib/cad/geometry";
import { exportDxf } from "../src/lib/cad/dxf";
import { exportSvg, svgBounds } from "../src/lib/cad/svg";
import { createEmptyPlan, createExamplePlan } from "../src/lib/cad/templates";
import { parsePlan } from "../src/lib/cad/validation";
import type { CadEntity, CadPlan, Point } from "../src/lib/cad/types";

const wall = (properties: Partial<CadEntity> = {}): CadEntity => ({ id: "wall", type: "wall", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, thickness: 0.2, ...properties });
const planWith = (...entities: CadEntity[]): CadPlan => ({ ...createEmptyPlan(), entities });
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);
const room = (points: Point[]): CadEntity => ({ id: "room", type: "room", layerId: "annotations", start: points[0], end: points.at(-1)!, text: "Séjour", points });
function withLinks(): CadPlan {
  const plan = planWith(wall());
  plan.entities.push(attachOpening(plan, "door", "wall", { x: 2, y: 0.3 }, 1, "annotations"), createWallDimension(plan, "wall", -0.8));
  return plan;
}

test("Architecture : cotes et ouvertures suivent translation, rotation et longueur du mur", () => {
  const plan = withLinks();
  const translated = updatePlanEntity(plan, moveEntity(plan, plan.entities[0], { x: 3, y: 4 }));
  assert.deepEqual(translated.entities[1].start, { x: 4.5, y: 4 });
  assert.deepEqual(translated.entities[2].start, { x: 3, y: 3.2 });
  assert.deepEqual(translated.entities[2].end, { x: 9, y: 3.2 });
  assert.equal(dimensionLabel(translated.entities[2]), "6,00 m");
  const rotated = updatePlanEntity(plan, { ...plan.entities[0], end: { x: 0, y: 9 } });
  close(rotated.entities[1].start.x, 0); close(rotated.entities[1].start.y, 2.5);
  close(rotated.entities[1].end.y, 3.5);
  assert.deepEqual(rotated.entities[2].start, { x: 0.8, y: 0 });
  assert.deepEqual(rotated.entities[2].end, { x: 0.8, y: 9 });
  assert.equal(dimensionLabel(rotated.entities[2]), "9,00 m");
  assert.deepEqual(plan.entities[0].start, { x: 0, y: 0 }, "Le plan précédent reste utilisable pour annuler");
});

test("Architecture : une ouverture glisse sur son mur et reste dans ses extrémités", () => {
  const plan = withLinks();
  const door = plan.entities[1];
  const moved = moveEntity(plan, door, { x: 100, y: 50 });
  close(moved.start.x, 5); close(moved.end.x, 6); close(moved.start.y, 0);
  const start = moveEntity(plan, door, { x: -100, y: 0 });
  close(start.start.x, 0); close(start.end.x, 1);
  const dimension = moveEntity(plan, plan.entities[2], { x: 20, y: -1 });
  close(dimension.offset!, -1.8); close(dimension.start.x, 0); close(dimension.start.y, -1.8);
  assert.throws(() => updatePlanEntity(plan, { ...plan.entities[0], end: { x: 0.5, y: 0 } }), /largeur/);
  assert.throws(() => attachOpening(plan, "window", "wall", { x: 0, y: 0 }, 7, "murs"), /largeur/);
});

test("Architecture : les calques protégés bloquent les déplacements et suppressions en cascade", () => {
  for (const protection of [{ locked: true }, { visible: false }]) {
    const plan = withLinks();
    Object.assign(plan.layers.find((layer) => layer.id === "cotes")!, protection);
    assert.throws(() => updatePlanEntity(plan, { ...plan.entities[0], end: { x: 7, y: 0 } }), /verrouillé|masqué/);
    assert.throws(() => removePlanEntity(plan, "wall"), /verrouillé|masqué/);
    assert.equal(plan.entities.length, 3);
  }
  const plan = withLinks();
  plan.layers[0].locked = true;
  assert.throws(() => updatePlanEntity(plan, moveEntity(plan, plan.entities[1], { x: 1, y: 0 })), /verrouillé/);
  assert.throws(() => removePlanEntity(plan, plan.entities[1].id), /verrouillé/);
});

test("Architecture : supprimer un mur retire ses dépendants sans modifier l’instantané précédent", () => {
  const plan = withLinks();
  const unrelated = { ...wall(), id: "other", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } };
  plan.entities.push(unrelated);
  const deleted = removePlanEntity(plan, "wall");
  assert.deepEqual(deleted.entities, [unrelated]);
  assert.equal(plan.entities.length, 4);
  assert.deepEqual(resolvePlanGeometry(plan), plan);
});

test("Architecture : surfaces et centroïdes exacts pour pièces rectangulaires et concaves", () => {
  const points = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
  const entity = room(points);
  validateRoomPoints(points);
  assert.equal(roomArea(entity), 12);
  close(roomCentroid(entity).x, 5 / 3); close(roomCentroid(entity).y, 5 / 3);
  assert.equal(roomArea(room([...points].reverse())), 12);
  const moved = moveEntity(planWith(entity), entity, { x: 99990, y: -99990 });
  assert.equal(roomArea(moved), 12);
  close(roomCentroid(moved).x, 99990 + 5 / 3);
  assert.deepEqual(entity.points, points);
  const rectangle = room([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 3 }]);
  assert.equal(roomArea(rectangle), 15);
  assert.deepEqual(roomCentroid(rectangle), { x: 2.5, y: 1.5 });
});

test("Architecture : import refuse contours invalides, symboles inconnus et références circulaires", () => {
  const plan = withLinks();
  const invalidContours = [
    [{ x: 0, y: 0 }, { x: 2, y: 0 }],
    [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }],
    [{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 4, y: 0 }],
    [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }],
    [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }],
    Array.from({ length: 65 }, (_, i) => ({ x: Math.cos(i / 65 * 2 * Math.PI), y: Math.sin(i / 65 * 2 * Math.PI) })),
  ];
  for (const points of invalidContours) assert.throws(() => parsePlan(planWith(room(points))), /Plan invalide/);
  const badEntities: CadEntity[] = [
    { ...plan.entities[1], wallAttachment: { wallId: "missing", t: 0.5, width: 1 } },
    { ...plan.entities[1], wallAttachment: { wallId: plan.entities[1].id, t: 0.5, width: 1 } },
    { ...plan.entities[1], wallAttachment: undefined },
    { ...plan.entities[1], wallAttachment: { wallId: "wall", t: Infinity, width: 1 } },
    { ...plan.entities[2], wallId: plan.entities[1].id },
    { ...plan.entities[1], swing: 0 } as unknown as CadEntity,
    { ...wall(), id: "bad", type: "symbol", symbolId: "alien" } as unknown as CadEntity,
    { ...wall(), id: "bad", type: "symbol", symbolId: "bed", end: { x: 1, y: 1 }, rotation: Infinity },
    { ...wall(), id: "bad", wallId: "wall" },
  ];
  for (const bad of badEntities) assert.throws(() => parsePlan({ ...plan, entities: [plan.entities[0], bad] }), /Plan invalide/);
});

test("Architecture : JSON reconstruit les coordonnées dérivées et préserve tous les nouveaux champs", () => {
  const plan = withLinks();
  plan.entities[1] = { ...plan.entities[1], swing: -1 };
  plan.entities.push({ id: "furniture", type: "symbol", layerId: "annotations", start: { x: 1, y: 1 }, end: { x: 2.6, y: 3 }, symbolId: "bed", rotation: 45 });
  plan.entities.push(room([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]));
  assert.deepEqual(parsePlan(JSON.parse(JSON.stringify(plan))), plan);
  const stale = structuredClone(plan);
  stale.entities[1].start = { x: 123, y: 456 };
  stale.entities[2].end = { x: -900, y: -100 };
  stale.entities[3].rotation = 90;
  stale.entities[4].start = { x: 900, y: 1 };
  const parsed = parsePlan(stale);
  assert.deepEqual(parsed.entities[1].start, plan.entities[1].start);
  assert.deepEqual(parsed.entities[2].end, plan.entities[2].end);
  assert.deepEqual(parsed.entities[4].start, { x: 0, y: 0 });
  assert.equal(parsed.entities[3].rotation, 90);
  const clamped = parsePlan({ ...plan, entities: [plan.entities[0], { ...plan.entities[1], wallAttachment: { wallId: "wall", t: 5, width: 1 } }] });
  close(clamped.entities[1].end.x, 6);
});

test("Architecture : murs interrompus aux ouvertures, fusion des trous et respect des calques masqués", () => {
  const plan = planWith(wall());
  plan.entities.push(attachOpening(plan, "door", "wall", { x: 2, y: 0 }, 2, "annotations"));
  plan.entities.push(attachOpening(plan, "window", "wall", { x: 3, y: 0 }, 2, "annotations"));
  const parts = visibleWallParts(plan, plan.entities[0]);
  assert.equal(parts.length, 2);
  close(parts[0].start.x, 0); close(parts[0].end.x, 1);
  close(parts[1].start.x, 4); close(parts[1].end.x, 6);
  plan.layers.find((layer) => layer.id === "annotations")!.visible = false;
  assert.deepEqual(visibleWallParts(plan, plan.entities[0]), [plan.entities[0]]);
});

test("Architecture : bibliothèques et cadrage incluent la rotation et le débattement des portes", () => {
  const plan = withLinks();
  const doorBounds = entityBounds(plan.entities[1]);
  close(doorBounds.maxY, 1); close(doorBounds.minY, -0.1);
  close(entityBounds({ ...plan.entities[1], swing: -1 }).minY, -1);
  const bed: CadEntity = { id: "bed", type: "symbol", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 2, y: 1 }, symbolId: "bed", rotation: 90 };
  const bounds = entityBounds(bed);
  close(bounds.minX, 0.5); close(bounds.maxX, 1.5); close(bounds.minY, -0.5); close(bounds.maxY, 1.5);
  for (const symbol of SYMBOLS) {
    const entity = { ...bed, symbolId: symbol.id, rotation: 33, end: { x: symbol.width, y: symbol.height } };
    assert.ok(architecturalPrimitives(entity).length > 0);
    const bounds = entityBounds(entity);
    assert.ok(Object.values(bounds).every(Number.isFinite));
  }
  assert.equal(new Set(SYMBOLS.map((symbol) => symbol.id)).size, 7);
});

test("Architecture : SVG et DXF exportent les ouvertures, surfaces et symboles sans murs pleins superposés", () => {
  const plan = planWith(wall());
  plan.entities.push(attachOpening(plan, "window", "wall", { x: 3, y: 0 }, 2, "annotations"));
  plan.entities.push(room([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]));
  plan.entities.push({ id: "sink", type: "symbol", layerId: "annotations", start: { x: 4, y: 1 }, end: { x: 4.6, y: 1.5 }, symbolId: "sink" });
  const svg = exportSvg(plan);
  assert.match(svg, /12,00 m²/);
  assert.match(svg, /points="0,0.1 2,0.1 2,-0.1 0,-0.1"/);
  assert.match(svg, /points="4,0.1 6,0.1 6,-0.1 4,-0.1"/);
  assert.doesNotMatch(svg, /points="0,0.1 6,0.1 6,-0.1 0,-0.1"/);
  const dxf = exportDxf(plan);
  assert.match(dxf, /12,00 m²/);
  assert.match(dxf, /CIRCLE/);
  assert.match(dxf, /LWPOLYLINE/);
  assert.match(dxf, /70\r\n0\r\n10\r\n2\r\n20\r\n0.1/);
  const hidden = structuredClone(plan);
  hidden.layers.find((layer) => layer.id === "annotations")!.visible = false;
  assert.doesNotMatch(exportSvg(hidden), /12,00 m²/);
  assert.match(exportSvg(hidden), /points="0,0.1 6,0.1 6,-0.1 0,-0.1"/);
  assert.doesNotMatch(exportDxf(hidden), /12,00 m²|CIRCLE/);
});

test("Architecture : l’exemple utilise des surfaces réelles et reste stable après réimport", () => {
  const plan = createExamplePlan();
  assert.deepEqual(parsePlan(JSON.parse(JSON.stringify(plan))), plan);
  assert.equal(plan.entities.filter((entity) => entity.type === "door").length, 3);
  assert.equal(plan.entities.filter((entity) => entity.type === "window").length, 3);
  assert.equal(plan.entities.filter((entity) => entity.type === "room").length, 3);
  close(plan.entities.filter((entity) => entity.type === "room").reduce((area, entity) => area + roomArea(entity), 0), 74.12);
  const bounds = planBounds(plan);
  const svgBox = svgBounds(plan);
  close(svgBox.x, bounds.minX - 0.5); close(svgBox.y, bounds.minY - 0.5);
  close(svgBox.width, bounds.maxX - bounds.minX + 1);
  assert.match(exportSvg(plan), /45,24 m²/);
  assert.match(exportDxf(plan), /14,44 m²/);
});


test("Architecture : les cotes liées exportent leurs lignes d’attache même lorsque le mur est masqué", () => {
  const plan = planWith(wall());
  const dimension = createWallDimension(plan, "wall", 4);
  plan.entities.push(dimension);
  plan.layers[0].visible = false;
  assert.deepEqual(dimensionExtensionLines(dimension), [
    [{ x: 0, y: 0 }, { x: 0, y: 4 }],
    [{ x: 6, y: 0 }, { x: 6, y: 4 }],
  ]);
  const bounds = planBounds(plan);
  close(bounds.minY, 0);
  assert.ok(bounds.maxY >= 4);
  const svg = exportSvg(plan);
  assert.match(svg, /<line x1="0" y1="0" x2="0" y2="4"\/>/);
  assert.match(svg, /<line x1="6" y1="0" x2="6" y2="4"\/>/);
  const dxf = exportDxf(plan);
  assert.match(dxf, /10\r\n0\r\n20\r\n0\r\n30\r\n0\r\n11\r\n0\r\n21\r\n-4\r\n31\r\n0/);
  assert.match(dxf, /10\r\n6\r\n20\r\n0\r\n30\r\n0\r\n11\r\n6\r\n21\r\n-4\r\n31\r\n0/);
  const diagonal = planWith(wall({ end: { x: 3, y: 4 } }));
  const linked = createWallDimension(diagonal, "wall", -2);
  const lines = dimensionExtensionLines(linked);
  close(lines[0][0].x, 0); close(lines[0][0].y, 0);
  close(lines[1][0].x, 3); close(lines[1][0].y, 4);
  assert.deepEqual(dimensionExtensionLines({ ...linked, wallId: undefined }), []);
});
