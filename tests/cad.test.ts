import test from "node:test";
import assert from "node:assert/strict";
import { distance, entityBounds, planBounds, snapPoint, translateEntity, wallCorners } from "../src/lib/cad/geometry";
import { createEmptyPlan, createExamplePlan } from "../src/lib/cad/templates";
import { MAX_PLAN_ENTITIES, parsePlan } from "../src/lib/cad/validation";
import { exportSvg } from "../src/lib/cad/svg";
import { exportDxf } from "../src/lib/cad/dxf";
import type { CadEntity, CadPlan } from "../src/lib/cad/types";

function entity(properties: Partial<CadEntity> = {}): CadEntity {
  return { id: crypto.randomUUID(), type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 3, y: 4 }, ...properties };
}
function planWith(...entities: CadEntity[]): CadPlan { return { ...createEmptyPlan(), entities }; }
function dxfRecords(source: string): Array<Array<[number, string]>> {
  const lines = source.trimEnd().split(/\r?\n/);
  assert.equal(lines.length % 2, 0, "Chaque code DXF possède une valeur");
  const records: Array<Array<[number, string]>> = [];
  for (let i = 0; i < lines.length; i += 2) {
    assert.match(lines[i], /^\d+$/, "Les codes DXF sont des nombres entiers");
    const code = Number(lines[i]);
    if (code === 0 || records.length === 0) records.push([]);
    records.at(-1)!.push([code, lines[i + 1]]);
  }
  return records;
}
const recordType = (record: Array<[number, string]>) => record.find(([code]) => code === 0)?.[1];
const group = (record: Array<[number, string]>, code: number) => record.find(([key]) => key === code)?.[1];

test("Les modèles de plans conservent leurs données lors d’un aller-retour JSON", () => {
  for (const plan of [createEmptyPlan(), createExamplePlan()]) {
    assert.deepEqual(parsePlan(JSON.parse(JSON.stringify(plan))), plan);
    assert.notStrictEqual(parsePlan(plan).layers, plan.layers);
  }
});

test("L’import refuse les coordonnées impossibles, doublons, références et tailles invalides", () => {
  const line = entity();
  const plan = planWith(line);
  for (const input of [
    null, [], { ...plan, version: 2 }, { ...plan, name: " " },
    { ...plan, entities: [{ ...line, start: { x: NaN, y: 0 } }] },
    { ...plan, entities: [{ ...line, end: { x: 1e9, y: 0 } }] },
    { ...plan, entities: [{ ...line, end: { x: Infinity, y: 0 } }] },
    { ...plan, entities: [{ ...line, layerId: "inexistant" }] },
    { ...plan, entities: [line, line] },
    { ...plan, layers: [plan.layers[0], plan.layers[0]] },
    { ...plan, entities: [{ ...line, type: "script" }] },
    { ...plan, entities: [{ ...line, thickness: -1 }] },
    { ...plan, entities: [{ ...line, fontSize: 0 }] },
    { ...plan, entities: [{ ...line, text: "x".repeat(2001) }] },
    { ...plan, entities: [{ ...line, text: "\u0000" }] },
    { ...plan, entities: [{ ...line, text: "\ud800" }] },
    { ...plan, entities: Array.from({ length: MAX_PLAN_ENTITIES + 1 }, () => line) },
    { ...plan, layers: [{ ...plan.layers[0], color: '#fff" onload="alert(1)' }] },
    { ...plan, updatedAt: "hier" },
  ]) assert.throws(() => parsePlan(input), /Plan invalide/);
});

test("L’import complète les options manquantes et supprime les champs inconnus", () => {
  const plan = createEmptyPlan();
  const result = parsePlan({ ...plan, unknown: "ignored", layers: [{ id: "murs", name: "Murs", color: "#6E9BAA" }], entities: [entity({ type: "wall" }), entity({ type: "text" })] });
  assert.deepEqual(result.layers[0], { id: "murs", name: "Murs", color: "#6E9BAA", visible: true, locked: false });
  assert.equal(result.entities[0].thickness, 0.2);
  assert.equal(result.entities[1].fontSize, 0.3);
  assert.equal(result.entities[1].text, "Texte");
  assert.equal("unknown" in result, false);
});

test("La grille accroche en mètres sans résidus décimaux, même en coordonnées négatives", () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.deepEqual(snapPoint({ x: 0.31, y: -0.36 }), { x: 0.3, y: -0.4 });
  assert.deepEqual(snapPoint({ x: -0.01, y: 1.13 }, 0.25), { x: 0, y: 1.25 });
  assert.throws(() => snapPoint({ x: 1, y: 1 }, 0), /positif/);
});

test("Déplacer un objet conserve ses dimensions et ne modifie pas l’original", () => {
  const original = entity({ type: "circle", text: "repère" });
  const moved = translateEntity(original, { x: -2, y: 7 });
  assert.deepEqual(moved.start, { x: -2, y: 7 });
  assert.deepEqual(moved.end, { x: 1, y: 11 });
  assert.equal(distance(moved.start, moved.end), 5);
  assert.deepEqual(original.start, { x: 0, y: 0 });
  assert.deepEqual(translateEntity(original, -2, 7), moved);
  assert.notStrictEqual(moved.start, original.start);
});

test("Le cadrage tient compte du rayon, de l’épaisseur des murs, des textes et de la visibilité", () => {
  const circle = entity({ type: "circle", start: { x: 2, y: 3 }, end: { x: 5, y: 7 } });
  assert.deepEqual(entityBounds(circle), { minX: -3, minY: -2, maxX: 7, maxY: 8 });
  const wall = entity({ type: "wall", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.4 });
  assert.deepEqual(entityBounds(wall), { minX: 0, minY: -0.2, maxX: 4, maxY: 0.2 });
  assert.equal(wallCorners(wall).length, 4);
  const label = entity({ type: "text", start: { x: -4, y: 0 }, text: "WWW\nChambre", fontSize: 0.3 });
  assert.ok(entityBounds(label).maxX >= -1.9);
  assert.ok(entityBounds(label).maxY > 0.3);
  const plan = planWith(circle, entity({ layerId: "cotes", start: { x: -900, y: -900 } }));
  plan.layers[1].visible = false;
  assert.deepEqual(planBounds(plan), entityBounds(circle));
  assert.deepEqual(planBounds(createEmptyPlan()), { minX: 0, minY: 0, maxX: 10, maxY: 8 });
});

test("L’export SVG échappe les annotations et exclut les calques masqués sans rogner les cercles", () => {
  const plan = planWith(
    entity({ type: "circle", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }),
    entity({ type: "text", text: '<script>alert("x")</script> & étage', start: { x: 0, y: 0 }, fontSize: 0.1 }),
    entity({ type: "text", layerId: "cotes", text: "NE PAS EXPORTER" }),
  );
  plan.name = "Cuisine <et> salon";
  plan.layers[1].visible = false;
  const svg = exportSvg(plan);
  assert.match(svg, /viewBox="-5\.5 -5\.5 11 11"/);
  assert.match(svg, /fill="#ffffff"/);
  assert.match(svg, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; étage/);
  assert.match(svg, /Cuisine &lt;et&gt; salon/);
  assert.doesNotMatch(svg, /<script>|NE PAS EXPORTER/);
});

test("Le DXF conserve les mètres, inverse Y, dessine l’épaisseur et empêche l’injection de groupes", () => {
  const plan = planWith(
    entity({ start: { x: 1, y: 2 }, end: { x: 4, y: 6 } }),
    entity({ type: "wall", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.4 }),
    entity({ type: "circle", start: { x: 2, y: 3 }, end: { x: 5, y: 7 } }),
    entity({ type: "text", text: "étage\n0\nENDSEC\n0\nEOF" }),
    entity({ type: "text", layerId: "cotes", text: "MASQUÉ" }),
  );
  plan.layers[0].name = "Murs\n0\nENDSEC";
  plan.layers[1].visible = false;
  const source = exportDxf(plan);
  const records = dxfRecords(source);
  assert.match(source, /\$INSUNITS\r\n70\r\n6\r\n/);
  assert.equal(records.filter((record) => recordType(record) === "EOF").length, 1);
  assert.equal(records.filter((record) => recordType(record) === "ENDSEC").length, 4);
  const line = records.find((record) => recordType(record) === "LINE")!;
  assert.equal(group(line, 10), "1"); assert.equal(group(line, 20), "-2"); assert.equal(group(line, 21), "-6");
  const wall = records.find((record) => recordType(record) === "LWPOLYLINE")!;
  assert.equal(group(wall, 70), "1");
  assert.deepEqual(wall.filter(([code]) => code === 20).map(([, value]) => Number(value)), [-0.2, -0.2, 0.2, 0.2]);
  const circle = records.find((record) => recordType(record) === "CIRCLE")!;
  assert.equal(group(circle, 40), "5"); assert.equal(group(circle, 20), "-3");
  assert.ok(records.some((record) => recordType(record) === "TEXT" && group(record, 1) === "étage"));
  assert.doesNotMatch(source, /MASQUÉ/);
});
