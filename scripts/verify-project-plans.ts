/** Parcours réel Projets → JSON → Plans 2D, remplacement atomique et brouillons isolés. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Page } from "puppeteer-core";
import { createExamplePlan } from "../src/lib/cad/templates";
import { parsePlan } from "../src/lib/cad/validation";
import type { CadPlan } from "../src/lib/cad/types";
import type { CivilProject } from "../src/lib/projects";
import { login } from "./helpers/login";
import { showProjectStep } from "./helpers/project-workflow";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results", "project-plans");
await mkdir(out, { recursive: true });
const example = createExamplePlan();
const wallId = example.entities.find(entity => entity.type === "wall")!.id;
const fixture = (name: string, thickness = 0.2): CadPlan => parsePlan({
  ...example, name,
  entities: example.entities.map(entity => entity.id === wallId ? { ...entity, thickness } : entity),
});
const alphaFilename = "alpha-rdc.json", upperFilename = "alpha-etage.json", betaFilename = "beta.json";
await Promise.all([
  writeFile(path.join(out, alphaFilename), JSON.stringify(fixture("RDC Alpha"))),
  writeFile(path.join(out, upperFilename), JSON.stringify(fixture("Étage Alpha", 0.35))),
  writeFile(path.join(out, betaFilename), JSON.stringify(fixture("Plan Beta", 0.5))),
  writeFile(path.join(out, "invalide.json"), JSON.stringify({ version: 1, layers: [], entities: [] })),
]);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(),
  args: chromium.args, headless: true,
});
const errors: string[] = [];
const configure = async (page: Page) => {
  page.setDefaultTimeout(35_000);
  await page.setViewport({ width: 1440, height: 1000 });
  page.on("pageerror", error => errors.push(String(error)));
  page.on("dialog", dialog => { void dialog.accept(); });
};
const click = async (page: Page, label: string) => {
  await page.waitForFunction(label => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled), {}, label);
  await page.evaluate(label => Array.from(document.querySelectorAll("button")).find(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled)!.click(), label);
};
const fill = async (page: Page, selector: string, value: string, commit = false) => {
  await page.focus(selector);
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.keyboard.type(value);
  if (commit) await page.keyboard.press("Enter");
};
const value = (page: Page, selector: string) => page.$eval(selector, node => (node as HTMLInputElement).value);
const records = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("exnov.projets.v1");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const projects = await new Promise<CivilProject[]>((resolve, reject) => {
    const request = db.transaction("projects").objectStore("projects").getAll();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const files = await new Promise<{ id: string; projectId: string; blob: Blob }[]>((resolve, reject) => {
    const request = db.transaction("files").objectStore("files").getAll();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  db.close();
  return { projects, files: await Promise.all(files.map(async file => ({ id: file.id, projectId: file.projectId, text: await file.blob.text(), size: file.blob.size }))) };
});
const storedPlan = async (page: Page, id: string) => {
  const record = (await records(page)).files.find(file => file.id === id);
  assert.ok(record, `Fichier ${id} présent`);
  return parsePlan(JSON.parse(record.text));
};
const projectNamed = async (page: Page, name: string) => {
  const project = (await records(page)).projects.find(project => project.name === name);
  assert.ok(project, `Dossier ${name} présent`);
  return project;
};
const createProject = async (page: Page, suffix: string) => {
  await click(page, "Nouveau projet");
  await page.type('[name="projectName"]', `Projet ${suffix}`);
  await page.type('[name="projectClient"]', `Client ${suffix}`);
  await page.type('[name="projectSite"]', "Tanger");
  await page.type('[name="projectReference"]', `${suffix.toUpperCase()}-PLANS`);
  await click(page, "Créer le projet");
  await page.waitForSelector("dialog[open]", { hidden: true });
  await page.waitForFunction(name => document.querySelector(".project-overview h2")?.textContent === name, {}, `Projet ${suffix}`);
  return projectNamed(page, `Projet ${suffix}`);
};
const choose = async (page: Page, name: string) => {
  await click(page, "Projets");
  await page.waitForFunction(name => Array.from(document.querySelectorAll(".project-nav-item")).some(button => button.querySelector("strong")?.textContent === name), {}, name);
  await page.evaluate(name => Array.from(document.querySelectorAll<HTMLButtonElement>(".project-nav-item")).find(button => button.querySelector("strong")?.textContent === name)!.click(), name);
  await page.waitForFunction(name => document.querySelector(".project-overview h2")?.textContent === name, {}, name);
};
const upload = async (page: Page, filename: string) => {
  await page.select("#project-document-kind", "plans");
  const input = await page.$('.project-document-upload input[data-upload-kind="plans"]');
  assert.ok(input);
  await (await input.toElement("input")).uploadFile(path.join(out, filename));
};
const uploadValid = async (page: Page, filename: string) => {
  await upload(page, filename);
  await page.waitForSelector(`button[aria-label="Modifier ${filename} dans Plans 2D"]`, { visible: true });
};
const openDocument = async (page: Page, projectName: string, documentId: string) => {
  await choose(page, projectName);
  const doc = (await projectNamed(page, projectName)).documents.find(doc => doc.id === documentId);
  assert.ok(doc);
  await page.click(`button[aria-label="Modifier ${doc.name} dans Plans 2D"]`);
  await page.waitForSelector('[data-testid="cad-canvas"]', { visible: true });
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.checkVisibility() && button.textContent?.trim() === "Enregistrer les modifications dans ce projet"));
};
const selectWall = async (page: Page) => {
  await page.click('.cad-toolbar button[aria-label="Sélection"]');
  await page.$eval(`[data-entity-id="${wallId}"]`, node => (node as SVGElement).focus());
  await page.keyboard.press("Enter");
  await page.waitForSelector('input[aria-label="Épaisseur du mur"]', { visible: true });
};
const saveModification = async (page: Page, projectName: string, documentId: string) => {
  const before = await projectNamed(page, projectName);
  await click(page, "Enregistrer les modifications dans ce projet");
  await page.waitForFunction(async ({ id, revision }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("exnov.projets.v1"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const project = await new Promise<CivilProject>((resolve, reject) => { const request = db.transaction("projects").objectStore("projects").get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return project.revision > revision;
  }, {}, { id: before.id, revision: before.revision });
  const after = await projectNamed(page, projectName);
  assert.equal(after.documents.length, before.documents.length, "La modification ne crée pas de doublon");
  assert.ok(after.documents.some(doc => doc.id === documentId), "L’identifiant du document est conservé");
  return storedPlan(page, documentId);
};
const actionError = async (page: Page, pattern: RegExp) => {
  await page.waitForFunction(source => Array.from(document.querySelectorAll('[role="alert"]')).some(node => node.checkVisibility() && new RegExp(source, "i").test(node.textContent || "")), {}, pattern.source);
};

/** Retenir seulement la prochaine prévalidation JSON ; les lectures suivantes restent réelles. */
const holdNextJsonRead = (page: Page) => page.evaluate(() => {
  const original = Blob.prototype.text;
  Reflect.set(window, "planReadPending", false);
  Blob.prototype.text = function () {
    if (this.type !== "application/json") return original.call(this);
    Blob.prototype.text = original;
    Reflect.set(window, "planReadPending", true);
    return new Promise<string>((resolve, reject) => {
      Reflect.set(window, "releasePlanRead", () => { void original.call(this).then(resolve, reject); });
    });
  };
});
const releaseJsonRead = (page: Page) => page.evaluate(() => {
  Reflect.get(window, "releasePlanRead")();
  Reflect.deleteProperty(window, "releasePlanRead");
  Reflect.deleteProperty(window, "planReadPending");
});
const waitProjectRevision = (page: Page, id: string, revision: number) => page.waitForFunction(async ({ id, revision }) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("exnov.projets.v1"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const project = await new Promise<CivilProject>((resolve, reject) => { const request = db.transaction("projects").objectStore("projects").get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close(); return project.revision > revision;
}, {}, { id, revision });

const page = await browser.newPage();
await configure(page);
try {
  await login(page, origin);
  const alpha = await createProject(page, "Alpha");
  await uploadValid(page, alphaFilename);
  await uploadValid(page, upperFilename);
  const alphaDocs = (await projectNamed(page, alpha.name)).documents;
  const alphaId = alphaDocs.find(doc => doc.name === alphaFilename)!.id;
  const upperId = alphaDocs.find(doc => doc.name === upperFilename)!.id;

  // Le JSON joint est vérifié avant toute mutation, et un nouveau plan se joint en JSON.
  const beforeInvalid = await records(page);
  await upload(page, "invalide.json");
  await actionError(page, /plan|invalide|calque|identifiant/);
  assert.deepEqual(await records(page), beforeInvalid, "Un JSON invalide ne crée ni document ni fichier");
  const beta = await createProject(page, "Beta");
  await showProjectStep(page, "livrables");
  await page.click('[data-step="livrables"]');
  await click(page, "Créer un plan 2D");
  await page.waitForSelector('[data-testid="cad-canvas"]', { visible: true });
  await click(page, "Exemple");
  await click(page, "Enregistrer dans ce projet");
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="status"]')).some(node => node.checkVisibility() && /enregistré dans/i.test(node.textContent || "")));
  const generated = (await projectNamed(page, beta.name)).documents;
  assert.equal(generated.length, 1);
  assert.match(generated[0].name, /\.json$/i);
  assert.ok((await storedPlan(page, generated[0].id)).entities.some(entity => entity.type === "door"));
  await click(page, "Voir le projet");
  assert.equal(await page.$eval(".project-overview h2", node => node.textContent), beta.name);
  await uploadValid(page, betaFilename);
  const betaId = (await projectNamed(page, beta.name)).documents.find(doc => doc.name === betaFilename)!.id;

  // Tous les objets et liens du JSON sont rééditables, avec annuler/rétablir.
  await openDocument(page, alpha.name, alphaId);
  assert.equal(await value(page, '[aria-label="Nom du plan"]'), "RDC Alpha");
  assert.equal(await page.$$eval("[data-entity-id]", nodes => nodes.length), example.entities.length);
  await selectWall(page);
  await fill(page, '[aria-label="Départ Y"]', "1", true);
  await fill(page, '[aria-label="Arrivée Y"]', "1", true);
  await page.click('.cad-toolbar button[aria-label="Annuler"]');
  await selectWall(page);
  assert.equal(await value(page, '[aria-label="Arrivée Y"]'), "0");
  await page.click('.cad-toolbar button[aria-label="Rétablir"]');
  await selectWall(page);
  assert.equal(await value(page, '[aria-label="Arrivée Y"]'), "1");
  const saved = await saveModification(page, alpha.name, alphaId);
  assert.equal(saved.id, example.id, "L’identifiant de plan importé est conservé dans le JSON");
  assert.equal(saved.entities.find(entity => entity.id === wallId)!.start.y, 1);
  assert.equal(saved.entities.find(entity => entity.id === wallId)!.end.y, 1);
  assert.equal(saved.entities.find(entity => entity.wallAttachment?.wallId === wallId)!.start.y, 1, "La fenêtre suit le mur");
  assert.ok(Math.abs(saved.entities.find(entity => entity.wallId === wallId)!.start.y - 0.2) < 1e-9, "La cote liée suit le mur");
  assert.equal((await projectNamed(page, alpha.name)).completedSteps.length, 0, "Enregistrer ne valide pas le workflow");

  // Une pièce invalide ne remplace pas le dessin ouvert, et le retour vise son dossier.
  await click(page, "Voir le projet");
  const invalidWhileOpen = await records(page);
  await upload(page, "invalide.json");
  await actionError(page, /plan|invalide|calque|identifiant/);
  assert.deepEqual(await records(page), invalidWhileOpen);
  await choose(page, beta.name);
  await click(page, "Plans 2D");
  assert.equal(await value(page, '[aria-label="Nom du plan"]'), "RDC Alpha");
  await click(page, "Voir le projet");
  assert.equal(await page.$eval(".project-overview h2", node => node.textContent), alpha.name);
  await click(page, "Plans 2D");

  // Même identifiant de plan dans plusieurs documents et dossiers : aucun brouillon partagé.
  await fill(page, '[aria-label="Nom du plan"]', "Brouillon RDC Alpha", true);
  await selectWall(page); await fill(page, '[aria-label="Épaisseur du mur"]', "0.28", true);
  await openDocument(page, alpha.name, upperId);
  assert.equal(await value(page, '[aria-label="Nom du plan"]'), "Étage Alpha");
  await selectWall(page); assert.equal(await value(page, '[aria-label="Épaisseur du mur"]'), "0.35");
  await fill(page, '[aria-label="Nom du plan"]', "Brouillon étage Alpha", true);
  await openDocument(page, beta.name, betaId);
  assert.equal(await value(page, '[aria-label="Nom du plan"]'), "Plan Beta");
  await selectWall(page); assert.equal(await value(page, '[aria-label="Épaisseur du mur"]'), "0.5");
  await openDocument(page, alpha.name, alphaId);
  assert.equal(await value(page, '[aria-label="Nom du plan"]'), "Brouillon RDC Alpha");
  await selectWall(page); assert.equal(await value(page, '[aria-label="Épaisseur du mur"]'), "0.28");
  assert.equal((await storedPlan(page, alphaId)).name, "RDC Alpha", "Le brouillon ne remplace pas le document sans enregistrer");
  assert.equal((await storedPlan(page, betaId)).name, "Plan Beta");
  await saveModification(page, alpha.name, alphaId);
  await page.reload({ waitUntil: "networkidle0" });
  await openDocument(page, alpha.name, alphaId);
  assert.equal(await value(page, '[aria-label="Nom du plan"]'), "Brouillon RDC Alpha");
  await selectWall(page); assert.equal(await value(page, '[aria-label="Épaisseur du mur"]'), "0.28");

  // Les changements des informations du dossier n’empêchent pas de sauver le plan.
  await click(page, "Voir le projet");
  await page.click('button[aria-label="Modifier le projet"]');
  await fill(page, '[name="projectSite"]', "Tanger — site actualisé");
  await click(page, "Enregistrer");
  await page.waitForSelector("dialog[open]", { hidden: true });
  await click(page, "Plans 2D");
  await selectWall(page);

  // Une erreur après écriture du Blob annule aussi la modification des métadonnées.
  await fill(page, '[aria-label="Épaisseur du mur"]', "0.31", true);
  const beforeQuota = await records(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === "projects") throw new DOMException("Quota de test", "QuotaExceededError");
      return original.call(this, value, key);
    };
    Reflect.set(window, "restoreProjectPlanPut", () => { IDBObjectStore.prototype.put = original; });
  });
  await click(page, "Enregistrer les modifications dans ce projet");
  await actionError(page, /plein|quota/);
  assert.deepEqual(await records(page), beforeQuota, "La transaction préserve ensemble le fichier et son dossier");
  assert.equal(await value(page, '[aria-label="Épaisseur du mur"]'), "0.31", "Le brouillon reste disponible après l’échec");
  await page.evaluate(() => { Reflect.get(window, "restoreProjectPlanPut")(); Reflect.deleteProperty(window, "restoreProjectPlanPut"); });
  const retry = await saveModification(page, alpha.name, alphaId);
  assert.equal(retry.entities.find(entity => entity.id === wallId)!.thickness, 0.31);
  assert.equal((await projectNamed(page, alpha.name)).site, "Tanger — site actualisé", "Le remplacement conserve les modifications récentes du dossier");

  // Deux vrais onglets : le deuxième ne remplace jamais une version devenue plus récente.
  const second = await browser.newPage(); await configure(second);
  await second.goto(`${origin}/projets`, { waitUntil: "networkidle0" });
  await openDocument(second, alpha.name, alphaId);
  await selectWall(second); await fill(second, '[aria-label="Épaisseur du mur"]', "0.8", true);
  await page.bringToFront();
  await fill(page, '[aria-label="Épaisseur du mur"]', "0.45", true);
  const fresh = await saveModification(page, alpha.name, alphaId);
  await second.bringToFront();
  await click(second, "Enregistrer les modifications dans ce projet");
  await actionError(second, /autre onglet|modifi|version|changé/);
  assert.deepEqual(await storedPlan(second, alphaId), fresh);
  assert.equal(await value(second, '[aria-label="Épaisseur du mur"]'), "0.8", "Le brouillon en conflit est conservé");
  await second.screenshot({ path: path.join(out, "conflit-plan-projet.png"), fullPage: true });
  await click(second, "Recharger la version du projet");
  await selectWall(second);
  assert.equal(await value(second, '[aria-label="Épaisseur du mur"]'), "0.45");
  await second.click('.cad-toolbar button[aria-label="Annuler"]');
  await selectWall(second);
  assert.equal(await value(second, '[aria-label="Épaisseur du mur"]'), "0.8", "Annuler récupère le brouillon après rechargement");
  assert.deepEqual(await storedPlan(second, alphaId), fresh);
  await second.close(); await page.bringToFront();

  // Le document source supprimé pendant l’édition n’est pas recréé silencieusement.
  await openDocument(page, alpha.name, upperId);
  await fill(page, '[aria-label="Nom du plan"]', "Brouillon source supprimée", true);
  const remover = await browser.newPage(); await configure(remover);
  await remover.goto(`${origin}/projets`, { waitUntil: "networkidle0" });
  await choose(remover, alpha.name);
  const upperDoc = (await projectNamed(remover, alpha.name)).documents.find(doc => doc.id === upperId)!;
  await remover.click(`button[aria-label="Retirer ${upperDoc.name}"]`);
  await click(remover, "Retirer le document");
  await remover.waitForSelector("dialog[open]", { hidden: true });
  await page.bringToFront();
  const afterRemoval = await records(page);
  await click(page, "Enregistrer les modifications dans ce projet");
  await actionError(page, /n’existe plus|supprim|retir|introuvable/);
  assert.deepEqual(await records(page), afterRemoval);
  assert.equal(await value(page, '[aria-label="Nom du plan"]'), "Brouillon source supprimée");
  await remover.close();

  // Une sauvegarde en cours reste attachée au dessin capturé, même si un nouveau plan l’a remplacé.
  await openDocument(page, beta.name, betaId);
  await click(page, "Nouveau plan");
  await click(page, "Exemple");
  await fill(page, '[aria-label="Nom du plan"]', "Export en cours Beta", true);
  const capturedIds = await page.$$eval("[data-entity-id]", nodes => nodes.map(node => node.getAttribute("data-entity-id")!).sort());
  const beforeFlight = await projectNamed(page, beta.name);
  await holdNextJsonRead(page);
  await click(page, "Enregistrer dans ce projet");
  await page.waitForFunction(() => Reflect.get(window, "planReadPending") === true);
  await click(page, "Nouveau plan");
  await click(page, "Exemple");
  await fill(page, '[aria-label="Nom du plan"]', "Nouveau brouillon Beta", true);
  const newIds = await page.$$eval("[data-entity-id]", nodes => nodes.map(node => node.getAttribute("data-entity-id")!).sort());
  assert.notDeepEqual(newIds, capturedIds);
  await releaseJsonRead(page);
  await waitProjectRevision(page, beta.id, beforeFlight.revision);
  assert.equal(await value(page, '[aria-label="Nom du plan"]'), "Nouveau brouillon Beta");
  assert.equal(new URL(page.url()).search, "", "La fin de l’ancien enregistrement ne rattache pas le nouveau plan");
  const firstFlight = await projectNamed(page, beta.name);
  const flightDoc = firstFlight.documents.find(doc => !beforeFlight.documents.some(before => before.id === doc.id))!;
  const flightPlan = await storedPlan(page, flightDoc.id);
  assert.equal(flightPlan.name, "Export en cours Beta");
  assert.deepEqual(flightPlan.entities.map(entity => entity.id).sort(), capturedIds);
  await click(page, "Enregistrer dans ce projet");
  await waitProjectRevision(page, beta.id, firstFlight.revision);
  const afterFlight = await projectNamed(page, beta.name);
  assert.equal(afterFlight.documents.length, beforeFlight.documents.length + 2);
  const newDoc = afterFlight.documents.find(doc => !firstFlight.documents.some(before => before.id === doc.id))!;
  const newPlan = await storedPlan(page, newDoc.id);
  assert.equal(newPlan.name, "Nouveau brouillon Beta");
  assert.deepEqual(newPlan.entities.map(entity => entity.id).sort(), newIds);
  assert.deepEqual(await storedPlan(page, flightDoc.id), flightPlan, "Le nouvel historique n’écrase pas le fichier sauvegardé en arrière-plan");

  // Rouvrir le même document pendant sa sauvegarde conserve le brouillon et sa nouvelle révision.
  await openDocument(page, beta.name, betaId);
  await selectWall(page); await fill(page, '[aria-label="Épaisseur du mur"]', "0.61", true);
  const beforeReopen = await projectNamed(page, beta.name);
  await holdNextJsonRead(page);
  await click(page, "Enregistrer les modifications dans ce projet");
  await page.waitForFunction(() => Reflect.get(window, "planReadPending") === true);
  await openDocument(page, beta.name, betaId);
  await selectWall(page);
  assert.equal(await value(page, '[aria-label="Épaisseur du mur"]'), "0.61");
  await fill(page, '[aria-label="Épaisseur du mur"]', "0.62", true);
  await releaseJsonRead(page);
  await waitProjectRevision(page, beta.id, beforeReopen.revision);
  assert.equal((await storedPlan(page, betaId)).entities.find(entity => entity.id === wallId)!.thickness, 0.61);
  await selectWall(page);
  assert.equal(await value(page, '[aria-label="Épaisseur du mur"]'), "0.62", "Les modifications pendant l’enregistrement restent dans le brouillon");
  const reopenedSave = await saveModification(page, beta.name, betaId);
  assert.equal(reopenedSave.entities.find(entity => entity.id === wallId)!.thickness, 0.62, "La révision actualisée permet l’enregistrement suivant");

  // Les actions d’ouverture et de retour restent accessibles sur petits écrans.
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844 });
    await openDocument(page, beta.name, betaId);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Atelier sans débordement à ${width}px`);
    await page.screenshot({ path: path.join(out, `plan-projet-${width}.png`), fullPage: true });
    await click(page, "Voir le projet");
    await page.waitForFunction(name => document.querySelector(".project-overview h2")?.textContent === name, {}, beta.name);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Documents sans débordement à ${width}px`);
    await page.screenshot({ path: path.join(out, `documents-projet-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, [], "Aucune erreur JavaScript");
  console.log("OK : JSON architectural lié au projet, modification sans doublon, cotes/ouvertures conservées, historique, brouillons isolés, rechargement, quota atomique, conflit entre onglets, source supprimée, sauvegarde en cours avec changement de plan et mobile.");
} catch (error) {
  await page.screenshot({ path: path.join(out, "echec.png"), fullPage: true }).catch(() => undefined);
  console.error(`Capture de diagnostic : ${path.join(out, "echec.png")}`);
  throw error;
} finally { await browser.close(); }
