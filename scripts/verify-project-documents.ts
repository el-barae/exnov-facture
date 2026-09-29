/** Liaison ateliers/projets : vrais exports, IA simulée, stockage et isolation des dossiers. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer, { type HTTPRequest } from "puppeteer-core";
import PizZip from "pizzip";
import { login } from "./helpers/login";
import { showProjectStep } from "./helpers/project-workflow";
import { exampleReport } from "../src/lib/report";
import { exampleCps } from "../tests/fixtures/cps";
import type { CivilProject } from "../src/lib/projects";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results/project-documents");
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(65_000);
  await page.setViewport({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  let failExport = false, holdExport = false;
  let held: HTTPRequest | undefined;
  const invoiceRequests: Record<string, unknown>[] = [];
  await page.setRequestInterception(true);
  page.on("request", request => {
    const url = request.url();
    if (url.endsWith("/api/rapports/chat")) {
      const payload = JSON.parse(request.postData()!);
      assert.match(payload.messages[0].content, /Projet Alpha/);
      void request.respond({ contentType: "application/json", body: JSON.stringify({ message: "Rapport prêt.", report: { ...exampleReport(), project: "Projet Alpha", client: "Client Alpha", reference: "ALPHA-001" } }) });
    } else if (url.endsWith("/api/cps/generate")) {
      assert.match(JSON.parse(request.postData()!).prompt, /ALPHA-001/);
      void request.respond({ contentType: "application/json", body: JSON.stringify({ message: "CPS prêt.", document: { ...exampleCps(), title: "Projet Alpha", owner: "Client Alpha", reference: "ALPHA-001" } }) });
    } else if (url.endsWith("/api/factures/pdf")) {
      invoiceRequests.push(JSON.parse(request.postData()!));
      if (failExport) void request.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Export indisponible pour ce test." }) });
      else if (holdExport) held = request;
      else void request.continue();
    } else void request.continue();
  });
  const click = async (label: string) => {
    await page.waitForFunction(label => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled), {}, label);
    await page.evaluate(label => Array.from(document.querySelectorAll("button")).find(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled)!.click(), label);
  };
  const value = (selector: string) => page.$eval(selector, element => (element as HTMLInputElement).value);
  const fill = async (selector: string, text: string) => {
    await page.click(selector); await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); await page.type(selector, text);
  };
  const records = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open("exnov.projets.v1"); req.onsuccess = () => resolve(req.result); req.onerror = reject; });
    const projects = await new Promise<CivilProject[]>((resolve, reject) => { const req = db.transaction("projects").objectStore("projects").getAll(); req.onsuccess = () => resolve(req.result); req.onerror = reject; });
    const files = await new Promise<{ id: string; projectId: string; blob: Blob }[]>((resolve, reject) => { const req = db.transaction("files").objectStore("files").getAll(); req.onsuccess = () => resolve(req.result); req.onerror = reject; });
    db.close();
    return { projects, files: await Promise.all(files.map(async file => ({ id: file.id, projectId: file.projectId, bytes: Array.from(new Uint8Array(await file.blob.arrayBuffer())) }))) };
  });
  const create = async (suffix: string, reference: string) => {
    await click("Nouveau projet");
    await page.type('[name="projectName"]', `Projet ${suffix}`);
    await page.type('[name="projectClient"]', `Client ${suffix}`);
    await page.type('[name="projectSite"]', "Tanger");
    await page.type('[name="projectReference"]', reference);
    await click("Créer le projet");
    await page.waitForSelector("dialog[open]", { hidden: true });
    await page.waitForFunction(name => document.querySelector(".project-overview h2")?.textContent === name, {}, `Projet ${suffix}`);
  };
  const choose = async (name: string) => {
    await click("Projets");
    await page.evaluate(name => Array.from(document.querySelectorAll<HTMLButtonElement>(".project-nav-item")).find(button => button.querySelector("strong")?.textContent === name)!.click(), name);
  };
  const open = async (step: string, label: string) => { await showProjectStep(page, step); await page.click(`[data-step="${step}"]`); await click(label); await page.waitForSelector("dialog[open]", { hidden: true }); };
  const save = async () => {
    await click("Enregistrer dans ce projet");
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.project-document-actions [role="status"]')).some(node => node.checkVisibility() && node.textContent?.includes("enregistré dans")));
  };
  await login(page, origin);
  await click("Factures / Devis");
  await fill('[aria-label="Désignation de la prestation 1"]', "Brouillon indépendant");
  await click("Projets");
  await create("Alpha", "ALPHA-001");
  const alphaId = (await records()).projects[0].id;

  // Préremplissage, validation native et récupération après erreur HTTP.
  await open("cadrage", "Générer un devis");
  assert.equal(await value('[name="destinataire"]'), "Client Alpha");
  assert.equal(await value('[name="projet"]'), "Projet Alpha");
  assert.equal(await value('[name="reference"]'), "ALPHA-001");
  await click("Enregistrer dans ce projet");
  assert.equal(invoiceRequests.length, 0, "Un formulaire incomplet ne lance pas l’export");
  await fill('[aria-label="Désignation de la prestation 1"]', "Étude Alpha");
  await fill('[aria-label="Prix unitaire de la prestation 1"]', "1200");
  failExport = true;
  await click("Enregistrer dans ce projet");
  await page.waitForFunction(() => document.querySelector('.project-document-actions [role="alert"]')?.textContent?.includes("indisponible"));
  assert.equal((await records()).files.length, 0);
  failExport = false;
  await save();
  assert.equal(invoiceRequests.at(-1)?.typeDocument, "devis");
  await click("Voir le projet");
  await page.waitForSelector(".project-document-list > li");
  assert.equal(await page.$eval('[role="progressbar"]', node => node.getAttribute("aria-valuenow")), "0", "L’ajout ne valide aucune étape");

  // Autres ateliers, mêmes exports que les boutons de téléchargement.
  await open("facturation", "Générer une facture");
  assert.equal(await value('[name="typeDocument"]'), "facture");
  await save();
  await click("Voir le projet");
  await open("diagnostic", "Générer un rapport");
  assert.match(await value("#report-prompt"), /Client Alpha/);
  await page.type("#report-prompt", "Rédige le rapport de visite.");
  await click("Envoyer");
  await save();
  await click("Voir le projet");
  await open("livrables", "Générer un CPS");
  assert.match(await value("#cps-prompt"), /ALPHA-001/);
  await page.type("#cps-prompt", "Rédige le CPS des travaux.");
  await click("Générer mon CPS");
  await save();
  await click("Voir le projet");
  await open("livrables", "Créer un plan 2D");
  await page.waitForSelector('[aria-label="Nom du plan"]');
  assert.equal(await value('[aria-label="Nom du plan"]'), "Projet Alpha");
  await click("Exemple");

  // Échec d’écriture après ajout du binaire : ni document, ni fichier orphelin.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === "projects") throw new DOMException("Quota de test", "QuotaExceededError");
      return original.call(this, value, key);
    };
    Reflect.set(window, "restorePut", () => { IDBObjectStore.prototype.put = original; });
  });
  await click("Enregistrer dans ce projet");
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.project-document-actions [role="alert"]')).some(node => node.checkVisibility() && node.textContent?.includes("plein")));
  assert.equal((await records()).files.length, 4);
  await page.evaluate(() => Reflect.get(window, "restorePut")());
  await save();
  await page.screenshot({ path: path.join(out, "plan-projet.png"), fullPage: true });

  // Lire les vrais fichiers persistés et vérifier les catégories et les octets.
  const first = await records();
  const alpha = first.projects.find(project => project.id === alphaId)!;
  assert.deepEqual(alpha.documents.map(doc => doc.kind).sort(), ["cps", "devis", "facture", "plans", "rapport"]);
  assert.equal(alpha.history.filter(event => event.message.startsWith("Document ajouté")).length, 5);
  for (const doc of alpha.documents) {
    const file = first.files.find(file => file.id === doc.id)!;
    const bytes = Buffer.from(file.bytes);
    assert.equal(file.projectId, alphaId);
    assert.equal(bytes.length, doc.size);
    if (doc.name.endsWith(".pdf")) assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    else if (doc.name.endsWith(".docx")) assert.ok(new PizZip(bytes).file("word/document.xml")!.asText().includes("Projet Alpha"));
    else if (doc.name.endsWith(".json")) { const plan = JSON.parse(bytes.toString()); assert.equal(plan.version, 1); assert.ok(plan.entities.length > 0); }
    else assert.match(bytes.toString(), /\$INSUNITS/);
    await writeFile(path.join(out, doc.name), bytes);
  }

  // Changer de dossier conserve les brouillons sans réutiliser le contenu d’Alpha.
  await click("Voir le projet");
  await create("Beta", "BETA-002");
  await open("livrables", "Créer un plan 2D");
  await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[aria-label="Nom du plan"]')?.value === "Projet Beta");
  assert.match(await page.$eval(".plans-statusbar", node => node.textContent!), /0 objet/);
  await click("Voir le projet");
  await open("diagnostic", "Générer un rapport");
  assert.match(await value("#report-prompt"), /Client Beta/);
  assert.equal(await page.$(".report-preview-label"), null, "Le rapport Alpha ne devient pas celui de Beta");
  await click("Voir le projet");
  await open("facturation", "Générer une facture");
  assert.equal(await value('[name="destinataire"]'), "Client Beta");
  assert.equal(await value('[aria-label="Désignation de la prestation 1"]'), "");
  await fill('[aria-label="Désignation de la prestation 1"]', "Étude Beta");
  await choose("Projet Alpha");
  await open("facturation", "Générer une facture");
  assert.equal(await value('[aria-label="Désignation de la prestation 1"]'), "Étude Alpha");

  // La destination capturée reste Alpha même si Beta est ouvert pendant l’export.
  holdExport = true;
  await click("Enregistrer dans ce projet");
  for (let attempt = 0; attempt < 100 && !held; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(held);
  const count = invoiceRequests.length;
  await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>(".project-document-actions button")).find(button => button.checkVisibility() && button.textContent?.includes("Enregistrement"))?.click());
  assert.equal(invoiceRequests.length, count, "Un double clic ne génère pas deux fichiers");
  await click("Projets");
  await page.click('button[aria-label="Modifier le projet"]');
  await fill('[name="projectSite"]', "Tanger — site actualisé");
  await click("Enregistrer");
  await page.waitForSelector("dialog[open]", { hidden: true });
  await choose("Projet Beta");
  await open("facturation", "Générer une facture");
  assert.equal(await value('[aria-label="Désignation de la prestation 1"]'), "Étude Beta");
  holdExport = false; await held.continue();
  for (let attempt = 0; attempt < 100 && (await records()).files.length !== 6; attempt++) await new Promise(resolve => setTimeout(resolve, 200));
  const after = await records();
  assert.equal(after.projects.find(project => project.id === alphaId)!.documents.length, 6);
  assert.equal(after.projects.find(project => project.id === alphaId)!.site, "Tanger — site actualisé", "L’ajout conserve les modifications faites pendant la génération");
  assert.equal(after.projects.find(project => project.name === "Projet Beta")!.documents.length, 0);

  // Retour ciblé malgré un autre dossier sélectionné et disposition mobile.
  await choose("Projet Alpha");
  await open("diagnostic", "Générer un rapport");
  assert.ok(await page.$(".report-preview-label"), "Le rapport Alpha est conservé");
  await choose("Projet Beta");
  await click("Rapports IA");
  await click("Voir le projet");
  assert.equal(await page.$eval(".project-overview h2", node => node.textContent), "Projet Alpha");
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844 });
    await click("Rapports IA");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Pas de débordement à ${width}px`);
  }

  await click("Factures / Devis");
  await click("Ouvrir sans projet");
  assert.equal(await value('[aria-label="Désignation de la prestation 1"]'), "Brouillon indépendant");

  // Rechargement et sélection manuelle d’un projet depuis un atelier indépendant.
  await page.reload({ waitUntil: "networkidle0" });
  const reloaded = await records();
  assert.deepEqual(reloaded.files, after.files);
  await click("Factures / Devis");
  await click("Charger l’exemple");
  await page.select('select[aria-label="Projet destinataire"]', alphaId);
  await save();
  assert.equal((await records()).projects.find(project => project.id === alphaId)!.documents.length, 7);
  assert.deepEqual(errors, []);
  console.log("OK : 5 types de documents, exports PDF/Word/JSON réels, préremplissage, brouillons isolés, destination stable, erreurs HTTP/quota, persistance et mobile.");
} finally { await browser.close(); }
