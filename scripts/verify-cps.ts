/** Parcours navigateur avec IA simulée et véritable export Word. Aucun appel AWS. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import PizZip from "pizzip";
import { cpsGenerateSchema, type CpsGenerate } from "../src/lib/cps";
import { exampleCps, testLogo } from "../tests/fixtures/cps";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results/cps");
await mkdir(out, { recursive: true });
const document = exampleCps();
const logoBytes = await readFile("public/logo-exnov.png");
const logo = { ...testLogo, dataUrl: `data:image/png;base64,${logoBytes.toString("base64")}`, width: logoBytes.readUInt32BE(16), height: logoBytes.readUInt32BE(20) };
const post = (endpoint: string, value: unknown) => fetch(`${origin}/api/cps/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
const exported = await post("word", { document, logo });
assert.equal(exported.status, 200, await exported.clone().text().then(text => text.slice(0, 100)));
assert.ok(exported.headers.get("content-type")?.includes("wordprocessingml.document"));
assert.ok(exported.headers.get("content-disposition")?.includes("CPS-"));
assert.equal(exported.headers.get("cache-control"), "no-store");
const bytes = Buffer.from(await exported.arrayBuffer());
const zip = new PizZip(bytes);
assert.ok(zip.file("word/media/logo.png"));
await writeFile(path.join(out, "cps-exemple.docx"), bytes);
const long = exampleCps();
long.administrative = Array.from({ length: 45 }, (_, i) => ({ title: `Clause de vérification ${i + 1}`, paragraphs: Array.from({ length: 3 }, () => "Texte fictif de vérification du CPS. " + document.administrative[1].paragraphs[0].repeat(4)) }));
long.works = Array.from({ length: 60 }, (_, i) => ({ ...document.works[0], title: `Ouvrage de vérification ${i + 1}`, quantity: "3", unitPrice: "1234.56" }));
long.vatRate = "20";
const largeResponse = await post("word", { document: long, logo });
assert.equal(largeResponse.status, 200);
await writeFile(path.join(out, "cps-multipage.docx"), Buffer.from(await largeResponse.arrayBuffer()));
for (const data of [{ document: {}, logo: null }, { document, logo: { ...testLogo, width: 2 } }, { document, logo: { ...testLogo, dataUrl: "https://example.org/logo.png" } }]) assert.equal((await post("word", data)).status, 400);
assert.equal((await post("generate", { prompt: " ", document: null, reference: "auto" })).status, 400);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1050 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  let mode: "success" | "error" | "slow" = "error";
  const requests: CpsGenerate[] = [];
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (!request.url().endsWith("/api/cps/generate")) { void request.continue(); return; }
    const input = cpsGenerateSchema.parse(JSON.parse(request.postData() || "{}")); requests.push(input);
    if (mode === "slow") return;
    if (mode === "error") { void request.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Service CPS indisponible pour ce test." }) }); return; }
    const output = input.document ? { ...input.document, deadline: "4 mois" } : document;
    void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Votre CPS est prêt.", document: output }) });
  });
  const click = async (label: string) => page.evaluate(label => {
    const button = Array.from(window.document.querySelectorAll("button")).find(button => button.textContent?.trim() === label && button.checkVisibility());
    if (!button) throw new Error(`Bouton introuvable : ${label}`); button.click();
  }, label);
  await page.goto(`${origin}/cps`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#cps-prompt");
  assert.equal(await page.$eval(".cps-export button", element => (element as HTMLButtonElement).disabled), true);
  await page.screenshot({ path: path.join(out, "cps-vide-desktop.png"), fullPage: true });
  await click("Utiliser un exemple de demande");
  const prompt = await page.$eval("#cps-prompt", element => (element as HTMLTextAreaElement).value);
  await click("Générer mon CPS");
  await page.waitForSelector(".cps-form .report-error");
  assert.equal(await page.$eval("#cps-prompt", element => (element as HTMLTextAreaElement).value), prompt);
  assert.equal(requests[0].document, null);
  await (await page.$('input[id="cps-logo"]'))!.uploadFile(path.join(process.cwd(), "public/logo-exnov.png"));
  await page.waitForSelector(".cps-logo-upload.has-logo");
  mode = "success";
  await click("Générer mon CPS");
  await page.waitForSelector(".cps-paper");
  assert.equal(await page.$eval(".cps-cover img", element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0), true);
  assert.equal(await page.$eval("#cps-prompt", element => (element as HTMLTextAreaElement).value), "");
  await page.type("#cps-prompt", "Porte le délai à 4 mois.");
  await click("Modifier le CPS");
  await page.waitForFunction(() => window.document.querySelector(".cps-cover")?.textContent?.includes("4 mois"));
  assert.equal(requests.at(-1)?.document?.deadline, "3 mois");
  await click("Factures / Devis");
  await click("CPS IA");
  assert.ok(await page.$eval(".cps-cover", element => element.textContent?.includes("4 mois")));
  assert.equal(new URL(page.url()).pathname, "/cps");
  await page.goBack();
  await page.waitForFunction(() => window.document.querySelector('button[aria-pressed="true"]')?.textContent?.includes("Factures"));
  await page.goForward();
  await page.waitForFunction(() => window.document.querySelector('button[aria-pressed="true"]')?.textContent?.includes("CPS"));

  const session = await page.createCDPSession();
  await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: out });
  const downloadResponse = page.waitForResponse(response => response.url().endsWith("/api/cps/word"));
  await click("Télécharger le CPS Word");
  assert.equal((await downloadResponse).status(), 200);
  await page.waitForFunction(() => window.document.querySelector(".cps-form .report-status")?.textContent?.includes("Word est prêt"));
  await page.screenshot({ path: path.join(out, "cps-desktop.png"), fullPage: true });
  for (const width of [768, 390, 320]) {
    await page.setViewport({ width, height: 900 });
    assert.ok(await page.evaluate(() => window.document.documentElement.scrollWidth <= window.innerWidth), `Pas de débordement à ${width}px`);
  }
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "cps-mobile.png"), fullPage: true });
  mode = "slow";
  await page.type("#cps-prompt", "Demande conservée après annulation.");
  await click("Modifier le CPS");
  await page.waitForSelector(".cps-progress");
  await click("Annuler");
  await page.waitForFunction(() => window.document.querySelector(".cps-form .report-status")?.textContent?.includes("annulée"));
  assert.equal(await page.$eval("#cps-prompt", element => (element as HTMLTextAreaElement).value), "Demande conservée après annulation.");
  assert.ok(await page.$eval(".cps-cover", element => element.textContent?.includes("4 mois")));
  await page.click('[aria-label="Retirer le logo"]');
  assert.equal(await page.$(".cps-cover img"), null);
  await click("Nouveau CPS");
  assert.equal(await page.$(".cps-paper"), null);
  assert.equal(await page.$eval("#cps-prompt", element => (element as HTMLTextAreaElement).value), "");
  assert.deepEqual(errors, []);
  console.log("OK : Word réel (logo et 60 postes), API, génération et révision simulées, conservation, annulation, historique navigateur et mobile 320/390/768 px. Aucun appel AWS.");
} finally { await browser.close(); }
