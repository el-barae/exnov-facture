/** Browser coverage for the 2D editor. Run against an existing Next server. */
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { CadPlan } from "../src/lib/cad/types";
import { login } from "./helpers/login";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results", "plans");
const downloads = path.join(out, `downloads-${Date.now()}`);
await mkdir(downloads, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1080 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  const click = async (label: string) => {
    await page.waitForFunction(label => [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled), {}, label);
    await page.evaluate(label => [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled)!.click(), label);
  };
  const plan = (): Promise<CadPlan> => page.evaluate(() => JSON.parse(localStorage.getItem(`exnov.plans.v1.document.${localStorage.getItem("exnov.plans.v1.active")}`)!));
  const count = async (expected: number) => page.waitForFunction(expected => {
    const current = JSON.parse(localStorage.getItem(`exnov.plans.v1.document.${localStorage.getItem("exnov.plans.v1.active")}`)!);
    return current?.entities.length === expected;
  }, {}, expected);
  const at = async (x: number, y: number) => {
    const box = await page.$eval('[data-testid="cad-canvas"]', element => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y }; });
    return { x: box.x + x, y: box.y + y };
  };
  const point = async (x: number, y: number) => { const p = await at(x, y); await page.mouse.click(p.x, p.y); };
  const tool = async (label: string) => page.click(`.cad-toolbar button[aria-label="${label}"]`);
  const setField = async (label: string, value: string) => {
    const selector = `input[aria-label="${label}"]`;
    await page.focus(selector);
    await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
    await page.keyboard.type(value);
    await page.keyboard.press("Enter");
  };
  await login(page, origin);
  await click("Plans 2D");
  await page.waitForSelector('[data-testid="cad-canvas"]', { visible: true });
  assert.equal(new URL(page.url()).pathname, "/plans");
  await count(0);
  await setField("Nom du plan", "Plan de vérification");
  const originalId = (await plan()).id;
  await tool("Mur");
  await point(160, 160); await point(360, 160); await count(1);
  let current = await plan();
  assert.equal(current.entities[0].type, "wall");
  assert.equal(current.entities[0].thickness, 0.2);
  assert.ok(Math.abs(current.entities[0].end.x - current.entities[0].start.x - 4) < 1e-8);
  await setField("Épaisseur du mur", "0.3");
  assert.equal((await plan()).entities[0].thickness, 0.3);
  await tool("Sélection");
  const from = await at(250, 160), to = await at(300, 210);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(`exnov.plans.v1.document.${localStorage.getItem("exnov.plans.v1.active")}`)!).entities[0].start.y > 2);
  current = await plan();
  assert.ok(Math.abs(current.entities[0].end.x - current.entities[0].start.x - 4) < 1e-8);
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  assert.equal((await plan()).entities[0].start.y, 1.6);
  await tool("Rétablir");
  assert.equal((await plan()).entities[0].start.y, 2.6);

  // Cancel in-progress geometry, then draw each supported primitive.
  await tool("Ligne"); await point(200, 300); await page.keyboard.press("Escape"); await count(1);
  await tool("Rectangle"); await point(160, 330); await point(310, 430); await count(2);
  await tool("Cercle"); await point(440, 350); await point(490, 350); await count(3);
  const circle = (await plan()).entities[2];
  await setField("Centre X", String(circle.start.x + 1));
  current = await plan();
  assert.equal(Math.hypot(current.entities[2].end.x - current.entities[2].start.x, current.entities[2].end.y - current.entities[2].start.y), 1);
  await tool("Cote"); await point(160, 260); await point(360, 260); await count(4);
  await tool("Texte"); await point(200, 390); await count(5);
  await tool("Ligne");
  await click("Ortho"); await point(370, 440); await point(520, 475); await count(6);
  current = await plan();
  assert.equal(current.entities[5].start.y, current.entities[5].end.y);

  await tool("Supprimer la sélection"); await count(5);
  await tool("Annuler"); await count(6);

  // Ctrl+S commits the field being edited before persisting the document.
  await page.focus('input[aria-label="Nom du plan"]');
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.keyboard.type("Plan de vérification sauvegardé");
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
  assert.equal((await plan()).name, "Plan de vérification sauvegardé");

  // Locked and hidden layers cannot receive geometry.
  const firstLayer = current.layers[0];
  await page.click(`button[aria-label="Verrouiller le calque ${firstLayer.name}"]`);
  await tool("Mur"); await point(600, 160); await point(700, 160); await count(6);
  await page.click(`button[aria-label="Déverrouiller le calque ${firstLayer.name}"]`);
  await page.click(`button[aria-label="Masquer le calque ${firstLayer.name}"]`);
  assert.equal(await page.$$eval('[data-entity-id]', elements => elements.length), 0);
  await point(600, 160); await point(700, 160); await count(6);
  await page.click(`button[aria-label="Afficher le calque ${firstLayer.name}"]`);
  await page.click('button[aria-label="Ajouter un calque"]');
  assert.equal((await plan()).layers.length, current.layers.length + 1);

  // Tool navigation preserves drawings; reload restores the library.
  await click("Projets"); await click("Plans 2D"); await count(6);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="cad-canvas"]'); await count(6);
  assert.equal((await plan()).name, "Plan de vérification sauvegardé");
  const beforeZoom = await page.$eval(".plans-zoom-controls", element => element.textContent);
  await page.click('button[aria-label="Zoomer"]');
  assert.notEqual(await page.$eval(".plans-zoom-controls", element => element.textContent), beforeZoom);
  await page.click('button[aria-label="Cadrer le plan"]');
  await page.screenshot({ path: path.join(out, "plans-desktop.png"), fullPage: true });

  // Download real files and reopen the complete JSON as a separate drawing.
  const session = await page.createCDPSession();
  await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await click("Exporter"); await page.waitForSelector("dialog[open]");
  for (const format of ["SVG", "DXF", "JSON"]) {
    await page.evaluate(format => [...document.querySelectorAll<HTMLButtonElement>(".cad-export-options button")].find(button => button.textContent?.includes(format))!.click(), format);
  }
  let files: string[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    files = (await readdir(downloads)).filter(name => /\.(json|svg|dxf)$/.test(name));
    if (files.length === 3) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(files.length, 3);
  const svg = await readFile(path.join(downloads, files.find(name => name.endsWith(".svg"))!), "utf8");
  assert.match(svg, /<svg/);
  assert.equal(await page.evaluate(svg => new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror")?.textContent ?? null, svg), null);
  const dxf = await readFile(path.join(downloads, files.find(name => name.endsWith(".dxf"))!), "utf8");
  assert.match(dxf, /\$INSUNITS/); assert.match(dxf, /EOF/);
  await page.click('button[aria-label="Fermer les options d’export"]');
  const upload = async (filename: string) => (await (await page.$('input[aria-label="Importer un plan JSON"]'))!.toElement("input")).uploadFile(filename);
  await upload(path.join(downloads, files.find(name => name.endsWith(".json"))!));
  await page.waitForFunction(id => localStorage.getItem("exnov.plans.v1.active") !== id, {}, originalId);
  await count(6);
  const importedId = (await plan()).id;
  assert.notEqual(importedId, originalId);
  await writeFile(path.join(out, "invalid.json"), JSON.stringify({ version: 1, layers: [] }));
  await upload(path.join(out, "invalid.json"));
  await page.waitForSelector('.plans-error[role="alert"]');
  assert.equal((await plan()).id, importedId);
  await click("Nouveau plan"); await count(0);
  await page.select('select[aria-label="Mes plans"]', originalId); await count(6);
  // A stale tab must not overwrite the newer drawing, even when saving a name.
  const secondTab = await browser.newPage();
  await secondTab.goto(`${origin}/plans`, { waitUntil: "networkidle0" });
  await secondTab.waitForSelector('[data-testid="cad-canvas"]');
  await setField("Nom du plan", "Version récente");
  await secondTab.focus('input[aria-label="Nom du plan"]');
  await secondTab.keyboard.down("Control"); await secondTab.keyboard.press("a"); await secondTab.keyboard.up("Control");
  await secondTab.keyboard.type("Version périmée"); await secondTab.keyboard.press("Enter");
  await secondTab.waitForSelector(".plans-unsaved");
  assert.equal((await plan()).name, "Version récente");
  assert.ok(await secondTab.$eval(".plans-error", element => element.textContent?.includes("autre onglet")));
  await secondTab.close();
  await page.bringToFront();

  // Storage failure preserves the last saved version and can be retried.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("exnov.plans.v1.document.")) throw new DOMException("Quota de test", "QuotaExceededError");
      original.call(this, key, value);
    };
    Reflect.set(window, "restoreCadStorage", () => { Storage.prototype.setItem = original; });
  });
  await setField("Nom du plan", "Plan à récupérer");
  await page.waitForSelector(".plans-unsaved");
  assert.equal((await plan()).name, "Version récente");
  await page.evaluate(() => { Reflect.get(window, "restoreCadStorage")(); Reflect.deleteProperty(window, "restoreCadStorage"); });
  await page.focus('input[aria-label="Nom du plan"]');
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
  await page.waitForSelector(".plans-saved");
  assert.equal((await plan()).name, "Plan à récupérer");

  await click("Exemple");
  assert.ok((await plan()).entities.length > 10);
  await page.click('button[aria-label="Cadrer le plan"]');
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({ path: path.join(out, "plans-dark.png"), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Pas de débordement à ${width}px`);
    assert.ok((await (await page.$('[data-testid="cad-canvas"]'))!.boundingBox())!.height >= 300);
    await page.screenshot({ path: path.join(out, `plans-mobile-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, [], "Aucune erreur JavaScript dans le navigateur");
  console.log(`Plans 2D : dessin, propriétés, historique, calques, sauvegarde, imports, exports et mobile vérifiés. Captures : ${out}`);
} finally { await browser.close(); }
