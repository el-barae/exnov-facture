/** Parcours navigateur réel : IndexedDB et pièces jointes, sans API externe. Serveur Next requis. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results", "projets");
await mkdir(out, { recursive: true });
const wordBytes = await readFile("templates/facture-exnov.docx");
for (const kind of ["devis", "rapport", "bdp", "note-calcul", "cps", "plans", "validation-mo", "facture"]) await writeFile(path.join(out, `${kind}.docx`), wordBytes);
await writeFile(path.join(out, "vide.pdf"), "");
await writeFile(path.join(out, "refuse.exe"), "test");

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1050 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  const click = async (label: string) => {
    await page.waitForFunction(label => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled), {}, label);
    await page.evaluate(label => Array.from(document.querySelectorAll("button")).find(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled)!.click(), label);
  };
  const idle = () => page.waitForSelector(".projects-page-heading button:not(:disabled)");
  const waitStep = (id: string) => page.waitForSelector(`[data-step="${id}"][data-status="current"]`);
  const upload = async (kind: string, inDialog = true, filename = `${kind}.docx`) => {
    const count = await page.$$eval(".project-document-list>li", values => values.length);
    const selector = `${inDialog ? "dialog[open] " : ".project-document-upload "}input[data-upload-kind="${kind}"]`;
    const input = await (await page.$(selector))!.toElement("input");
    await input.uploadFile(path.join(out, filename));
    await page.waitForFunction(count => document.querySelectorAll(".project-document-list>li").length === count + 1, {}, count);
    await idle();
  };
  const create = async (name: string, withBdp: boolean) => {
    await click("Nouveau projet");
    await page.type('[name="projectName"]', name);
    await page.type('[name="projectClient"]', "Commune de Tanger");
    await page.type('[name="projectSite"]', "Tanger — Centre communal");
    await page.type('[name="projectReference"]', withBdp ? "GC-2026-001" : "GC-2026-002");
    if (!withBdp) await page.click('[name="withBdp"]');
    await click("Créer le projet");
    await page.waitForSelector("dialog[open]", { hidden: true });
    await waitStep("cadrage");
  };
  await page.goto(`${origin}/projets`, { waitUntil: "networkidle0" });
  await idle();
  assert.ok(await page.$eval(".project-empty-state", element => element.textContent?.includes("premier projet")));
  await create("Aménagement du souk communal", true);

  // Les raccourcis ferment la fenêtre, ouvrent le bon atelier et préservent le dossier.
  for (const [step, label, target] of [
    ["cadrage", "Générer un devis", "devis"],
    ["facturation", "Générer une facture", "facture"],
    ["diagnostic", "Générer un rapport", "rapport"],
    ["livrables", "Générer un CPS", "cps"],
    ["cadrage", "Générer un devis", "devis"],
  ]) {
    await page.click(`[data-step="${step}"]`);
    await click(label);
    await page.waitForSelector("dialog[open]", { hidden: true });
    if (target === "devis" || target === "facture") {
      await page.waitForFunction(type => {
        const field = document.querySelector<HTMLSelectElement>('[name="typeDocument"]');
        return field?.checkVisibility() && field.value === type;
      }, {}, target);
      const value = await page.$eval('[name="projet"]', element => (element as HTMLTextAreaElement).value);
      if (!value) await page.type('[name="projet"]', "Saisie conservée via les raccourcis");
      else assert.equal(value, "Saisie conservée via les raccourcis");
    } else {
      await page.waitForFunction(target => document.querySelector(target === "cps" ? "#cps-prompt" : "#report-prompt")?.checkVisibility(), {}, target);
      assert.equal(new URL(page.url()).pathname, target === "cps" ? "/cps" : "/");
    }
    await click("Projets");
    await waitStep("cadrage");
    assert.equal(await page.$eval(".project-overview h2", element => element.textContent), "Aménagement du souk communal");
    assert.equal(await page.$eval('[role="progressbar"]', element => element.getAttribute("aria-valuenow")), "0");
  }

  // Impossible de sauter une étape ; les futures pièces peuvent néanmoins être préparées.
  await page.click('[data-step="livrables"]');
  assert.equal(await page.$eval('dialog[open]', element => element.textContent?.includes("Validez d’abord")), true);
  assert.equal(await page.$$eval('dialog[open] button', buttons => buttons.some(button => button.textContent?.trim() === "Valider l’étape")), false);
  await upload("plans");
  await click("Fermer");
  await waitStep("cadrage");

  // L’étape actuelle demande seulement les documents qui manquent.
  await page.click('[data-step="cadrage"]');
  assert.ok(await page.$eval('dialog[open]', element => element.textContent?.includes("Devis accepté")));
  assert.equal(await page.$$eval('dialog[open] button', buttons => buttons.find(button => button.textContent?.trim() === "Valider l’étape")?.disabled), true);
  await (await page.$('dialog[open] input[type="file"]'))!.uploadFile(path.join(out, "vide.pdf"));
  await page.waitForFunction(() => document.querySelector('dialog[open] [role="alert"]')?.textContent?.includes("vide"));
  await (await page.$('dialog[open] input[type="file"]'))!.uploadFile(path.join(out, "refuse.exe"));
  await page.waitForFunction(() => document.querySelector('dialog[open] [role="alert"]')?.textContent?.includes("Format"));
  // Simuler un stockage plein après l’ajout du binaire : toute la transaction doit être annulée.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === "projects") throw new DOMException("Quota de test", "QuotaExceededError");
      return original.call(this, value, key);
    };
    Reflect.set(window, "__restoreProjectStorage", () => { IDBObjectStore.prototype.put = original; });
  });
  await (await page.$('dialog[open] input[type="file"]'))!.uploadFile(path.join(out, "devis.docx"));
  await page.waitForFunction(() => document.querySelector('dialog[open] [role="alert"]')?.textContent?.includes("plein"));
  await page.evaluate(() => { Reflect.get(window, "__restoreProjectStorage")(); Reflect.deleteProperty(window, "__restoreProjectStorage"); });
  assert.equal(await page.$$eval(".project-document-list>li", values => values.length), 1);
  assert.equal(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open("exnov.projets.v1", 1); request.onsuccess = () => resolve(request.result); });
    const count = await new Promise<number>(resolve => { const request = db.transaction("files").objectStore("files").count(); request.onsuccess = () => resolve(request.result); });
    db.close(); return count;
  }), 1, "Aucun fichier orphelin après l’échec de la transaction");
  await upload("devis");
  await click("Valider l’étape");
  await waitStep("visite");
  await page.click('[data-step="visite"]');
  await waitStep("diagnostic");
  assert.equal(await page.$$eval('[data-status="completed"]', values => values.length), 2);
  await page.screenshot({ path: path.join(out, "projets-desktop.png"), fullPage: true });

  // Navigation de service sans perte de saisie et URL rechargeable.
  await click("Factures / Devis");
  await page.waitForFunction(() => !(document.querySelector("#invoice-form fieldset") as HTMLFieldSetElement)?.disabled);
  await page.type('[name="destinataire"]', "Client à conserver");
  await click("Projets");
  assert.equal(new URL(page.url()).pathname, "/projets");
  await click("Rapports IA");
  await page.type("#report-prompt", "Notes à conserver");
  await click("Projets");
  await click("Factures / Devis");
  assert.equal(await page.$eval('[name="destinataire"]', element => (element as HTMLInputElement).value), "Client à conserver");
  await click("Rapports IA");
  assert.equal(await page.$eval("#report-prompt", element => (element as HTMLTextAreaElement).value), "Notes à conserver");
  await click("Projets");
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => document.querySelector("#report-prompt")?.checkVisibility());
  await page.evaluate(() => history.forward());
  await page.waitForFunction(() => document.querySelector(".projects-workspace")?.checkVisibility());
  await page.reload({ waitUntil: "networkidle0" });
  await waitStep("diagnostic");
  assert.equal(await page.$$eval(".project-document-list>li", values => values.length), 2);

  // Le vrai fichier binaire est conservé et téléchargeable après rechargement.
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("exnov.projets.v1", 1); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    const files = await new Promise<{ blob: Blob }[]>((resolve, reject) => { const request = db.transaction("files").objectStore("files").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await files[0].blob.arrayBuffer()))).map(value => value.toString(16).padStart(2, "0")).join("");
    db.close(); return { count: files.length, hash };
  });
  const expectedHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", wordBytes))).map(value => value.toString(16).padStart(2, "0")).join("");
  assert.equal(stored.count, 2);
  assert.equal(stored.hash, expectedHash);
  const downloadSession = await page.createCDPSession();
  const downloads = path.join(out, `downloads-${Date.now()}`);
  await mkdir(downloads, { recursive: true });
  await downloadSession.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await page.click('button[aria-label="Télécharger devis.docx"]');
  let downloaded: Buffer | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { downloaded = await readFile(path.join(downloads, "devis.docx")); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.deepEqual(downloaded, wordBytes, "Le fichier téléchargé est identique à l’original");

  // Les autres onglets reçoivent les mises à jour du projet.
  const secondTab = await browser.newPage();
  await secondTab.goto(`${origin}/projets`, { waitUntil: "networkidle0" });
  await secondTab.waitForSelector('[data-step="diagnostic"][data-status="current"]');
  await page.bringToFront();
  await page.click('[data-step="diagnostic"]');
  await upload("rapport");
  await click("Valider l’étape");
  await waitStep("chiffrage");
  await secondTab.waitForSelector('[data-step="chiffrage"][data-status="current"]');
  await secondTab.close();

  // Une pièce obligatoire déjà utilisée ne peut être retirée.
  await page.click('button[aria-label="Retirer devis.docx"]');
  await click("Retirer le document");
  await page.waitForFunction(() => document.querySelector('dialog[open] [role="alert"]')?.textContent?.includes("justifie"));
  await click("Annuler");
  assert.equal(await page.$$eval(".project-document-list>li", values => values.length), 3);

  for (const [step, kind] of [["chiffrage", "bdp"], ["etudes", "note-calcul"], ["livrables", "cps"], ["validation", "validation-mo"], ["facturation", "facture"]]) {
    await waitStep(step);
    await page.click(`[data-step="${step}"]`);
    if (step === "livrables") {
      assert.equal(await page.$$('dialog[open] input[data-upload-kind="plans"]').then(values => values.length), 0, "Les plans déjà fournis ne sont pas redemandés");
      assert.ok(await page.$eval('dialog[open]', element => element.textContent?.includes("plans.docx")));
    }
    await upload(kind);
    await click("Valider l’étape");
    await idle();
  }
  await page.waitForSelector(".project-completed-banner");
  assert.equal(await page.$eval('[role="progressbar"]', element => element.getAttribute("aria-valuenow")), "100");
  await page.click('[data-step="diagnostic"]');
  await click("Reprendre à cette étape");
  await click("Confirmer la reprise");
  await waitStep("diagnostic");
  assert.equal(await page.$$eval(".project-document-list>li", values => values.length), 8);

  // Un autre projet garde sa propre progression et ses propres documents.
  await create("Diagnostic d’un ouvrage existant", false);
  assert.equal(await page.$$eval(".project-document-list>li", values => values.length), 0);
  assert.equal(await page.$eval('[data-step="chiffrage"]', element => element.getAttribute("data-status")), "skipped");
  await page.type('input[aria-label="Rechercher un projet"]', "souk");
  assert.equal(await page.$$eval(".project-nav-item", values => values.length), 1);
  await page.click(".project-nav-item");
  await waitStep("diagnostic");
  assert.equal(await page.$$eval(".project-document-list>li", values => values.length), 8);
  await page.$eval('input[aria-label="Rechercher un projet"]', element => { const input = element as HTMLInputElement; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; setter.call(input, ""); input.dispatchEvent(new Event("input", { bubbles: true })); });

  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Pas de débordement à ${width}px`);
    await page.screenshot({ path: path.join(out, `projets-mobile-${width}.png`), fullPage: true });
    await page.click('[data-step="livrables"]');
    assert.ok(await page.$eval('dialog[open]', element => element.scrollWidth <= element.clientWidth), "La fenêtre tient sur mobile");
    await page.keyboard.press("Escape");
    await page.waitForSelector("dialog[open]", { hidden: true });
  }
  assert.deepEqual(errors, []);
  const unavailablePage = await browser.newPage();
  await unavailablePage.evaluateOnNewDocument(() => Object.defineProperty(window, "indexedDB", { value: undefined }));
  await unavailablePage.goto(`${origin}/projets`, { waitUntil: "networkidle0" });
  await unavailablePage.waitForSelector(".project-empty-state [role='alert']");
  assert.equal(await unavailablePage.$eval(".projects-page-heading button", element => (element as HTMLButtonElement).disabled), true);
  await unavailablePage.close();
  console.log("OK : création de projets, étapes ordonnées, pièces requises et anticipées, fichiers persistés, téléchargement exact, navigation, multi-onglets, reprise, isolation des dossiers, stockage plein ou indisponible et mobile 320/390px.");
} finally { await browser.close(); }
