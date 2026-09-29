/** Real-browser architecture workflow; requires an existing Next server, no AI calls. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { CadPlan } from "../src/lib/cad/types";
import { login } from "./helpers/login";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results", "plans-architecture");
const downloads = path.join(out, `downloads-${Date.now()}`);
await mkdir(downloads, { recursive: true });
const fixture: CadPlan = {
  version: 1, id: "architecture-fixture", name: "Atelier architecture", updatedAt: new Date().toISOString(),
  layers: [{ id: "walls", name: "Architecture", color: "#d8aa55", visible: true, locked: false }],
  entities: [
    { id: "wall-north", type: "wall", layerId: "walls", start: { x: 0, y: 0 }, end: { x: 8, y: 0 }, thickness: .2 },
    { id: "wall-east", type: "wall", layerId: "walls", start: { x: 8, y: 0 }, end: { x: 8, y: 6 }, thickness: .2 },
    { id: "wall-south", type: "wall", layerId: "walls", start: { x: 8, y: 6 }, end: { x: 0, y: 6 }, thickness: .2 },
    { id: "wall-west", type: "wall", layerId: "walls", start: { x: 0, y: 6 }, end: { x: 0, y: 0 }, thickness: .2 },
  ],
};
const fixturePath = path.join(out, "architecture-fixture.json");
await writeFile(fixturePath, JSON.stringify(fixture));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
const page = await browser.newPage();
try {
  await page.setViewport({ width: 1440, height: 1080 });
  const errors: string[] = [], aiCalls: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/plans/generate") aiCalls.push(request.url()); });
  const click = async (label: string) => {
    await page.waitForFunction(label => [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled), {}, label);
    await page.evaluate(label => [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled)!.click(), label);
  };
  const tool = async (label: string) => page.click(`.cad-toolbar button[aria-label="${label}"]`);
  const plan = (): Promise<CadPlan> => page.evaluate(() => JSON.parse(localStorage.getItem(`exnov.plans.v1.document.${localStorage.getItem("exnov.plans.v1.active")}`)!));
  const count = (expected: number) => page.waitForFunction(expected => {
    const current = JSON.parse(localStorage.getItem(`exnov.plans.v1.document.${localStorage.getItem("exnov.plans.v1.active")}`)!);
    return current?.entities.length === expected;
  }, {}, expected);
  const setField = async (label: string, value: string) => {
    await page.focus(`input[aria-label="${label}"]`);
    await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
    await page.keyboard.type(value); await page.keyboard.press("Enter");
  };
  const world = async (x: number, y: number) => {
    await page.$eval('[data-testid="cad-canvas"]', element => element.scrollIntoView({ block: "center" }));
    return page.$eval('[data-testid="cad-canvas"] > g[transform*="scale("]', (element, point) => {
      const matrix = (element as SVGGElement).getScreenCTM()!;
      const result = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: result.x, y: result.y };
    }, { x, y });
  };
  const point = async (x: number, y: number) => { const p = await world(x, y); await page.mouse.click(p.x, p.y); };
  const selectEntity = async (id: string) => {
    await tool("Sélection");
    await page.$eval(`[data-entity-id="${id}"]`, element => (element as SVGElement).focus());
    await page.keyboard.press("Enter");
    await page.waitForSelector(`[data-entity-id="${id}"][aria-pressed="true"]`);
  };
  const area = (points: { x: number; y: number }[]) => Math.abs(points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y; }, 0)) / 2;
  const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);
  const entityPath = (id: string) => page.$eval(`[data-entity-id="${id}"] path`, element => element.getAttribute("d"));

  await login(page, origin);
  await click("Plans 2D");
  await page.waitForSelector('[data-testid="cad-canvas"]', { visible: true });
  await (await (await page.$('input[aria-label="Importer un plan JSON"]'))!.toElement("input")).uploadFile(fixturePath);
  await count(4);
  await page.click('button[aria-label="Cadrer le plan"]');
  assert.notEqual((await plan()).id, fixture.id, "L’import crée un document indépendant");

  await tool("Porte");
  await setField("Largeur des portes", "0.9");
  await point(2, 0); await count(5);
  let current = await plan();
  const door = current.entities.find(entity => entity.type === "door")!;
  assert.equal(door.wallAttachment?.wallId, "wall-north"); near(door.wallAttachment!.width, .9);
  await tool("Fenêtre"); await setField("Largeur des fenêtres", "1.2");
  await point(5, 0); await count(6);
  current = await plan();
  const windowEntity = current.entities.find(entity => entity.type === "window")!;
  assert.equal(windowEntity.wallAttachment?.wallId, "wall-north"); near(windowEntity.wallAttachment!.width, 1.2);
  assert.equal(await page.$$eval('[data-entity-id="wall-north"] polygon', parts => parts.length), 3, "Le mur présente deux ouvertures réelles");
  await setField("Largeur des fenêtres", "12");
  await point(7, 0);
  await page.waitForFunction(() => /largeur|dépasse/i.test(document.querySelector(".cad-canvas-message")?.textContent ?? ""));
  assert.equal((await plan()).entities.length, 6, "Une ouverture trop large est refusée");
  await setField("Largeur des fenêtres", "1.2");
  console.log("OK ouvertures et validation des supports");

  await selectEntity("wall-north"); await click("Coter ce mur"); await count(7);
  current = await plan();
  const dimension = current.entities.find(entity => entity.type === "dimension")!;
  assert.equal(dimension.wallId, "wall-north"); near(dimension.end.x - dimension.start.x, 8);
  await selectEntity("wall-north");
  const beforeDimensionPath = await entityPath(dimension.id), beforeDoorPath = await entityPath(door.id);
  const from = await world(7, 0), to = await world(7, .8);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 });
  near((await plan()).entities.find(entity => entity.id === "wall-north")!.start.y, 0);
  assert.notEqual(await entityPath(dimension.id), beforeDimensionPath, "La cote suit le mur pendant l’aperçu de déplacement");
  assert.notEqual(await entityPath(door.id), beforeDoorPath, "La porte suit le mur pendant l’aperçu de déplacement");
  await page.mouse.up();
  current = await plan();
  near(current.entities.find(entity => entity.id === "wall-north")!.start.y, .8);
  near(current.entities.find(entity => entity.id === door.id)!.start.y, .8);
  near(current.entities.find(entity => entity.id === dimension.id)!.start.y, 1.4);
  await tool("Annuler");
  current = await plan(); near(current.entities.find(entity => entity.id === door.id)!.start.y, 0);
  near(current.entities.find(entity => entity.id === dimension.id)!.start.y, .6);
  await selectEntity("wall-north"); await setField("Arrivée X", "9");
  current = await plan(); near(current.entities.find(entity => entity.id === dimension.id)!.end.x, 9);
  near(current.entities.find(entity => entity.id === door.id)!.wallAttachment!.width, .9);
  await tool("Annuler");
  near((await plan()).entities.find(entity => entity.id === dimension.id)!.end.x, 8);
  // Two endpoint clicks also create an associated dimension automatically.
  await tool("Cote"); await point(0, 6); await point(8, 6); await count(8);
  assert.equal((await plan()).entities.at(-1)!.wallId, "wall-south");
  console.log("OK cotes associatives, aperçu de déplacement, propriétés et annulation");

  await tool("Pièce");
  await point(1, 2); await point(4, 2); await point(4, 4); await point(1, 4);
  await page.keyboard.press("Enter"); await count(9);
  let room = (await plan()).entities.find(entity => entity.type === "room")!;
  near(area(room.points!), 6);
  assert.ok(await page.$eval(`[data-entity-id="${room.id}"]`, element => element.textContent?.includes("6,00 m²")), "La surface figure dans le dessin");
  assert.ok(await page.$eval(".cad-rooms", element => element.textContent?.includes("6 m²")), "La surface figure dans le tableau des pièces");
  await selectEntity(room.id);
  await page.click(".cad-vertices > summary");
  await setField("Sommet 2 X", "5");
  room = (await plan()).entities.find(entity => entity.type === "room")!; near(area(room.points!), 7);
  assert.ok(await page.$eval(`[data-entity-id="${room.id}"]`, element => element.textContent?.includes("7,00 m²")), "La surface suit la modification des sommets");
  await tool("Annuler");
  near(area((await plan()).entities.find(entity => entity.type === "room")!.points!), 6);
  await tool("Pièce"); await point(5, 2); await point(6, 2); await page.keyboard.press("Escape");
  assert.equal((await plan()).entities.length, 9, "Échap annule une pièce inachevée");
  await page.click('button[aria-label="Insérer Lit double"]');
  await point(5, 3); await count(10);
  const symbol = (await plan()).entities.find(entity => entity.type === "symbol")!;
  assert.equal(symbol.symbolId, "bed");
  await selectEntity(symbol.id);
  const beforeRotation = await entityPath(symbol.id);
  await setField("Rotation", "90");
  assert.equal((await plan()).entities.find(entity => entity.id === symbol.id)!.rotation, 90);
  assert.notEqual(await entityPath(symbol.id), beforeRotation, "La rotation modifie le dessin du symbole");
  console.log("OK pièces, surfaces, sommets et bibliothèque de symboles");

  // Individual panel disclosure and complete inspector collapse free drawing space.
  await page.click(".cad-properties > summary");
  assert.equal(await page.$eval(".cad-properties", element => (element as HTMLDetailsElement).open), false);
  await page.click(".cad-properties > summary");
  const widthBefore = await page.$eval('[data-testid="cad-canvas"]', element => element.getBoundingClientRect().width);
  const inspectorToggle = 'button[aria-controls="cad-inspector"]';
  await page.click(inspectorToggle);
  await page.waitForFunction(width => document.querySelector('[data-testid="cad-canvas"]')!.getBoundingClientRect().width > width + 100, {}, widthBefore);
  await page.click(inspectorToggle);
  const smallLabels = await page.$$eval('.cad-tool span, .cad-field, .cad-field input, .cad-unit-badge, .cad-panel-intro, .cad-panel-footnote, .plans-statusbar, .cad-symbol-library button span', elements => elements.filter(element => element.checkVisibility() && parseFloat(getComputedStyle(element).fontSize) < 12).map(element => ({ text: element.textContent, size: getComputedStyle(element).fontSize })));
  assert.deepEqual(smallLabels, [], "Les libellés visibles font au moins 12 px");
  await page.screenshot({ path: path.join(out, "architecture-desktop.png"), fullPage: true });

  const session = await page.createCDPSession();
  await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await click("Exporter"); await page.waitForSelector("dialog[open]");
  await page.select('.cad-pdf-paper-fields label:nth-child(3) select', "20");
  assert.equal(await page.$eval('.cad-pdf-actions button[type="submit"]', button => (button as HTMLButtonElement).disabled), true, "Une échelle qui déborde ne peut pas être téléchargée");
  await page.select('.cad-pdf-paper-fields label:nth-child(3) select', "100");
  await page.type('.cad-pdf-cartouche-fields label:nth-child(1) input', "Projet architecture vérifié");
  await page.type('.cad-pdf-cartouche-fields label:nth-child(2) input', "Client test");
  await page.type('.cad-pdf-cartouche-fields label:nth-child(3) input', "ARCH-001");
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === "/api/plans/pdf", { timeout: 90000 });
  await click("Télécharger PDF");
  const pdfResponse = await responsePromise;
  assert.equal(pdfResponse.status(), 200, "Le vrai service PDF répond sans simulation");
  assert.match(pdfResponse.headers()["content-type"], /application\/pdf/);
  await page.waitForFunction(() => document.querySelector(".cad-export-status")?.textContent?.includes("Téléchargement PDF lancé"), { timeout: 90000 });
  let pdfFile = "";
  for (let attempt = 0; attempt < 100; attempt++) {
    pdfFile = (await readdir(downloads)).find(name => name.endsWith(".pdf")) ?? "";
    if (pdfFile) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(pdfFile, "Le PDF a été téléchargé");
  const pdfPath = path.join(downloads, pdfFile), pdf = await readFile(pdfPath);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const pdfText = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
  assert.match(pdfText, /EXNOV/); assert.match(pdfText, /1:100/); assert.match(pdfText, /ARCH-001/); assert.match(pdfText, /Client test/); assert.match(pdfText, /6[,.]00 m/);
  const pdfInfo = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  assert.match(pdfInfo, /Pages:\s+1\b/);
  const pageSize = pdfInfo.match(/Page size:\s+([\d.]+) x ([\d.]+) pts \(A4\)/);
  assert.ok(pageSize, "Le PDF est une feuille A4");
  assert.ok(Math.abs(Number(pageSize[1]) - 297 / 25.4 * 72) < 1 && Math.abs(Number(pageSize[2]) - 210 / 25.4 * 72) < 1, "Dimensions A4 paysage à la précision du moteur PDF");
  const rejected = await page.evaluate(async currentPlan => {
    const settings = { paper: "A4", orientation: "landscape", scale: 20, project: "", client: "", reference: "", drawnBy: "", date: "2026-09-26" };
    const overflow = await fetch("/api/plans/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: currentPlan, settings }) });
    const malformed = await fetch("/api/plans/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: currentPlan, settings: { ...settings, scale: 0 } }) });
    return { overflow: overflow.status, malformed: malformed.status };
  }, await plan());
  assert.deepEqual(rejected, { overflow: 422, malformed: 400 });
  await page.screenshot({ path: path.join(out, "architecture-pdf-dialog.png"), fullPage: true });
  await page.click('button[aria-label="Fermer les options d’export"]');
  console.log("OK PDF réel à l’échelle, cartouche EXNOV et validation API");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [390, 320]) {
      await page.setViewport({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Pas de débordement à ${width}px (${theme})`);
      assert.ok((await (await page.$('[data-testid="cad-canvas"]'))!.boundingBox())!.height >= 300);
      const tiny = await page.$$eval(".cad-tool span, .cad-field, .cad-unit-badge", elements => elements.filter(element => element.checkVisibility() && parseFloat(getComputedStyle(element).fontSize) < 12).map(element => element.textContent));
      assert.deepEqual(tiny, [], `Libellés lisibles à ${width}px`);
      await page.screenshot({ path: path.join(out, `architecture-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.reload({ waitUntil: "networkidle0" }); await page.waitForSelector('[data-testid="cad-canvas"]'); await count(10);
  assert.equal((await plan()).entities.find(entity => entity.id === symbol.id)!.rotation, 90, "La rotation persiste après rechargement");
  assert.deepEqual(aiCalls, [], "Aucun appel IA n’a été effectué");
  assert.deepEqual(errors, [], "Aucune erreur JavaScript dans le navigateur");
  console.log(`Architecture Plans 2D : ouvertures, cotes liées, pièces, surfaces, symboles, panneaux, mobile et PDF vérifiés. Captures : ${out}`);
} catch (error) {
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => undefined);
  throw error;
} finally { await browser.close(); }
