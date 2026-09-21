/** À exécuter contre npm run start ou npm run dev : npm run test:e2e */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { exampleInvoice } from "../src/lib/invoice";
import { STORAGE_KEY } from "../src/lib/storage";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results");
await mkdir(out, { recursive: true });
const example = exampleInvoice();
for (const format of ["pdf", "word"] as const) {
  const response = await fetch(`${origin}/api/factures/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(example) });
  assert.equal(response.status, 200, await response.clone().text().then(s => s.slice(0, 300)));
  assert.equal(response.headers.get("cache-control"), "no-store");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, format === "pdf" ? 4 : 2).toString(), format === "pdf" ? "%PDF" : "PK");
  await writeFile(path.join(out, `exemple.${format === "pdf" ? "pdf" : "docx"}`), bytes);
}
for (const format of ["pdf", "word"]) {
  const response = await fetch(`${origin}/api/factures/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...example, lignes: [], numero: -1 }) });
  assert.equal(response.status, 400);
}
const long = { ...example, lignes: Array.from({ length: 28 }, (_, k) => ({ ...example.lignes[k % 2], id: `long-${k}`, designation: `Prestation ${k + 1} — ${example.lignes[k % 2].designation}` })) };
for (const format of ["pdf", "word"]) {
  const response = await fetch(`${origin}/api/factures/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(long) });
  assert.equal(response.status, 200);
  await writeFile(path.join(out, `multipage.${format === "pdf" ? "pdf" : "docx"}`), Buffer.from(await response.arrayBuffer()));
}
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !(document.querySelector("fieldset") as HTMLFieldSetElement)?.disabled);
  await page.evaluate(() => { (Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Charger l’exemple")) as HTMLButtonElement).click(); });
  await page.waitForFunction(() => (document.querySelector('[name="numero"]') as HTMLInputElement).value === "13");
  const preview = page.frames().find(f => f.parentFrame());
  assert.ok(preview);
  await preview.waitForFunction("window.__invoiceReady === true");
  assert.equal(await preview.$$eval(".invoice-page", p => p.length), 1, "L’exemple doit tenir sur une page");
  const missingAssets = await preview.$$eval("img", images => images.filter(i => !i.complete || !i.naturalWidth).length);
  assert.equal(missingAssets, 0);
  await page.screenshot({ path: path.join(out, "interface-desktop.png"), fullPage: true });
  for (let k = 0; k < 12; k++) await page.click(".add-button");
  await preview.waitForFunction("window.__invoiceReady === true && document.querySelectorAll('.invoice-page').length > 1");
  for (let k = 0; k < 12; k++) await page.$$eval('button[aria-label^="Supprimer la prestation"]', buttons => (buttons.at(-1) as HTMLButtonElement).click());
  await preview.waitForFunction("window.__invoiceReady === true && document.querySelectorAll('.invoice-page').length === 1");
  await page.waitForFunction(() => parseFloat((document.querySelector('iframe') as HTMLIFrameElement).style.height) <= 1124);
  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: out });
  for (const label of ["Télécharger PDF", "Télécharger Word"]) {
    await page.evaluate(text => { (Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes(text)) as HTMLButtonElement).click(); }, label);
    await page.waitForFunction(() => !!document.querySelector(".status-message"), { timeout: 65000 });
    assert.ok(await page.$eval(".status-message", e => e.textContent?.includes("téléchargée")));
  }
  const storage = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "{}"), STORAGE_KEY);
  assert.equal(storage.dernierNumero, 13);
  assert.deepEqual(Object.keys(storage).sort(), ["client", "dernierNumero"]);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => (document.querySelector('[name="numero"]') as HTMLInputElement).value === "14");
  assert.equal(await page.$eval('[name="destinataire"]', e => (e as HTMLInputElement).value), example.destinataire);
  assert.equal(await page.$eval('[name="projet"]', e => (e as HTMLInputElement).value), "");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.screenshot({ path: path.join(out, "interface-mobile.png"), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Pas de débordement horizontal sur mobile");
  assert.deepEqual(errors, []);
  console.log("OK : exports PDF/Word, erreurs de validation, multipage, aperçu, téléchargements, localStorage et mobile.");
} finally { await browser.close(); }
