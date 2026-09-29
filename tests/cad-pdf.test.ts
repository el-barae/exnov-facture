import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/plans/pdf/route";
import { CAD_PDF_SCALES, cadPdfFilename, cadPdfLayout, defaultCadPdfSettings, parseCadPdfRequest, parseCadPdfSettings } from "../src/lib/cad/pdf";
import { createEmptyPlan } from "../src/lib/cad/templates";
import { MAX_PLAN_FILE_BYTES } from "../src/lib/cad/validation";
import { buildCadPdfHtml } from "../src/lib/server/cad-pdf";
import type { CadPlan } from "../src/lib/cad/types";

function linePlan(length = 1): CadPlan {
  return { ...createEmptyPlan(), name: "Plan de contrôle", entities: [{ id: "measure", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: length, y: 0 } }] };
}
const assets = { logo: "data:image/png;base64,AAAA", watermark: "", fontRegular: "data:font/ttf;base64,AAAA", fontBold: "data:font/ttf;base64,AAAA", fontSans: "data:font/ttf;base64,AAAA" };
const defaults = () => ({ ...defaultCadPdfSettings(), date: "2026-09-26" });
function request(body: unknown) { return new Request("http://localhost/api/plans/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

test("Les paramètres PDF valident formats, échelles, dates réelles et textes du cartouche", () => {
  const settings = defaults();
  assert.deepEqual(parseCadPdfSettings(settings), settings);
  assert.equal(defaultCadPdfSettings({ name: "Résidence", client: "Client", reference: "P-01" }).project, "Résidence");
  for (const invalid of [null, [], { ...settings, paper: "A0" }, { ...settings, orientation: "auto" },
    { ...settings, scale: 0 }, { ...settings, scale: "100" }, { ...settings, scale: 75 },
    { ...settings, date: "2025-02-29" }, { ...settings, date: "2024-13-01" }, { ...settings, date: "hier" },
    { ...settings, client: "x".repeat(101) }, { ...settings, project: "Projet\nA" },
    { ...settings, reference: "\ud800" }, { ...settings, drawnBy: null },
  ]) assert.throws(() => parseCadPdfSettings(invalid));
  assert.equal(parseCadPdfSettings({ ...settings, date: "2024-02-29" }).date, "2024-02-29");
  assert.equal(parseCadPdfSettings({ ...settings, date: "" }).date, "");
  assert.equal("unknown" in parseCadPdfSettings({ ...settings, unknown: "discarded" }), false);
});

test("Une longueur réelle d’un mètre conserve sa taille papier pour chaque échelle", () => {
  for (const scale of CAD_PDF_SCALES) {
    const settings = { ...defaults(), scale };
    const layout = cadPdfLayout(linePlan(), settings);
    assert.equal(layout.millimetresPerMetre, 1000 / scale);
    assert.equal(layout.svgWidthMm / layout.bounds.width, 1000 / scale);
    assert.equal(layout.svgHeightMm / layout.bounds.height, 1000 / scale);
    const source = buildCadPdfHtml(linePlan(), settings, assets);
    const root = source.match(/<svg\b[^>]*>/)?.[0] ?? "";
    const width = Number(root.match(/\bwidth="([\d.]+)mm"/)?.[1]);
    const viewBox = root.match(/viewBox="([^"]+)"/)?.[1].split(" ").map(Number);
    assert.ok(viewBox);
    assert.equal(width / viewBox[2], 1000 / scale, "La largeur physique du SVG et son viewBox produisent l’échelle annoncée");
    assert.match(source, new RegExp(`1:${scale} · mètres`));
  }
});

test("Les quatre formats réservent les marges, le cartouche et un cadre sans réduction automatique", () => {
  for (const paper of ["A4", "A3"] as const) for (const orientation of ["portrait", "landscape"] as const) {
    const layout = cadPdfLayout(linePlan(), { ...defaults(), paper, orientation });
    const dimensions = paper === "A3" ? [297, 420] : [210, 297];
    if (orientation === "landscape") dimensions.reverse();
    assert.deepEqual([layout.sheetWidthMm, layout.sheetHeightMm], dimensions);
    assert.equal(layout.svgWidthMm, 20);
    assert.equal(layout.svgHeightMm, 10);
    assert.equal(layout.svgLeftMm + layout.svgWidthMm / 2, layout.sheetWidthMm / 2);
    assert.ok(layout.svgTopMm >= 12);
    assert.ok(layout.svgTopMm + layout.svgHeightMm <= 10 + layout.outerFrameHeightMm - 2);
  }
  const boundary = cadPdfLayout(linePlan(26.3), defaults());
  assert.equal(boundary.fits, true);
  assert.ok(Math.abs(boundary.svgWidthMm - boundary.frameWidthMm) < 1e-7);
  assert.equal(cadPdfLayout(linePlan(26.301), defaults()).fits, false);
  const tooBig = linePlan(40);
  assert.equal(cadPdfLayout(tooBig, defaults()).fits, false);
  assert.throws(() => buildCadPdfHtml(tooBig, defaults(), assets), /dépasse la zone disponible/);
  assert.equal(cadPdfLayout(tooBig, { ...defaults(), scale: 200 }).fits, true);
});

test("La translation et les calques masqués ne modifient pas l’échelle du PDF", () => {
  const plan = linePlan(6);
  const before = cadPdfLayout(plan, defaults());
  plan.entities[0].start = { x: -120, y: 82 };
  plan.entities[0].end = { x: -114, y: 82 };
  plan.layers.push({ id: "hidden", name: "Masqué", visible: false, locked: false, color: "#000000" });
  plan.entities.push({ id: "huge", layerId: "hidden", type: "line", start: { x: -9999, y: 0 }, end: { x: 9999, y: 0 } });
  const after = cadPdfLayout(plan, defaults());
  assert.equal(after.svgWidthMm, before.svgWidthMm);
  assert.equal(after.svgHeightMm, before.svgHeightMm);
  assert.equal(after.fits, true);
});

test("Le cartouche EXNOV échappe les champs et conserve le titre, les unités, la date et la pagination", () => {
  const plan = { ...linePlan(), name: "Plan <script>alert(1)</script>" };
  const source = buildCadPdfHtml(plan, { ...defaults(), project: '</style><img src="https://invalid.test">', client: "A & B", reference: 'N°"42', drawnBy: "Architecte" }, assets);
  assert.doesNotMatch(source, /<script|<img src="https:/);
  assert.match(source, /Plan &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(source, /A &amp; B/);
  assert.match(source, /BET EXNOV S.A.R.L/);
  assert.match(source, /26\/09\/2026/);
  assert.match(source, /1 \/ 1/);
  assert.match(source, /default-src 'none'/);
  assert.match(source, /size:297mm 210mm/);
  assert.equal((source.match(/<img /g) ?? []).length, 1);
  assert.equal(cadPdfFilename({ name: 'Étage / "test"' }), "Etage-test.pdf");
});

test("Le contrat PDF valide le plan et ne transmet aucun champ inconnu", () => {
  const parsed = parseCadPdfRequest({ plan: linePlan(), settings: defaults(), html: "<script/>" });
  assert.equal("html" in parsed, false);
  assert.throws(() => parseCadPdfRequest({ plan: { ...linePlan(), entities: [{ type: "script" }] }, settings: defaults() }), /Plan invalide/);
});

test("L’API refuse les requêtes invalides avant tout rendu PDF avec des réponses non cachées", async () => {
  const responses = [
    [await POST(new Request("http://localhost/api/plans/pdf", { method: "POST", body: "{}" })), 415],
    [await POST(new Request("http://localhost/api/plans/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })), 400],
    [await POST(request({ plan: linePlan(), settings: { ...defaults(), paper: "A0" } })), 400],
    [await POST(request({ plan: null, settings: defaults() })), 400],
    [await POST(request({ plan: linePlan(100), settings: defaults() })), 422],
    [await POST(new Request("http://localhost/api/plans/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ extra: "x".repeat(MAX_PLAN_FILE_BYTES) }) })), 413],
  ] as const;
  for (const [response, status] of responses) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json() as { error: string };
    assert.ok(body.error.length > 0);
    if (status === 422) assert.match(body.error, /feuille plus grande/);
  }
});
