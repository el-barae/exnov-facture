/** Tests navigateur et PDF sans aucun appel payant à AWS. Serveur Next requis. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { exampleReport, reportChatSchema, type ReportChat, type ReportImage } from "../src/lib/report";
import { buildReportHtml } from "../src/lib/document/report";
import { loadAssets } from "../src/lib/server/assets";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results");
await mkdir(out, { recursive: true });
const photo: ReportImage = { id: "test-photo", name: "Photo exemple", dataUrl: `data:image/png;base64,${(await readFile("public/logo-exnov.png")).toString("base64")}` };
const report = exampleReport();
report.sections = Array.from({ length: 8 }, (_, index) => ({
  heading: `Section ${index + 1} — Observations du chantier`,
  paragraphs: [Array.from({ length: 16 }, (_, line) => `Constat ${index + 1}.${line + 1} : une observation détaillée du chantier à vérifier lors de la prochaine visite, en coordination avec les intervenants concernés.`).join(" ")],
  bullets: ["Vérifier la zone concernée avec le responsable du chantier.", "Planifier une intervention et consigner les résultats."],
  images: index % 2 === 0 ? [{ imageId: photo.id, caption: `Photographie d’illustration ${index + 1} — exemple fictif.` }] : [],
}));
report.sections[1].paragraphs.push("</script><script>window.__unsafeReport = true</script><img src=https://example.org/tracking>");

for (const [name, value, images] of [["rapport-exemple", exampleReport(), []], ["rapport-multipage", report, [photo]]] as const) {
  const response = await fetch(`${origin}/api/rapports/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report: value, images }) });
  assert.equal(response.status, 200, await response.clone().text().then(text => text.slice(0, 200)));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(response.headers.get("content-disposition")?.includes("Rapport-EXNOV-"));
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  await writeFile(path.join(out, `${name}.pdf`), bytes);
}
for (const body of [{ report: {}, images: [] }, { report, images: [] }, { report, images: [{ ...photo, dataUrl: "https://example.org/unsafe.png" }] }]) {
  const response = await fetch(`${origin}/api/rapports/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(response.status, 400);
}
const invalidChat = await fetch(`${origin}/api/rapports/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [], report: null, images: [] }) });
assert.equal(invalidChat.status, 400);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
  const document = await browser.newPage();
  await document.setViewport({ width: 900, height: 1200 });
  const external: string[] = [];
  await document.setRequestInterception(true);
  document.on("request", request => { if (/^(data:|about:)/.test(request.url())) void request.continue(); else { external.push(request.url()); void request.abort(); } });
  await document.setContent(buildReportHtml(report, [photo], await loadAssets()));
  await document.waitForFunction("window.__reportReady || window.__reportError");
  assert.equal(await document.evaluate("window.__reportError"), undefined);
  assert.equal(await document.evaluate("window.__unsafeReport"), undefined);
  assert.deepEqual(external, []);
  const metrics = await document.$$eval(".report-page", pages => pages.map(page => {
    const content = page.querySelector(".report-content")!;
    return { overflow: content.getBoundingClientRect().bottom > page.querySelector(".invoice-footer")!.getBoundingClientRect().top - 10,
      heading: page.querySelectorAll(".letterhead").length, footer: page.querySelectorAll(".invoice-footer").length,
      counter: page.querySelector(".page-counter")?.textContent, empty: !content.children.length,
      orphan: content.lastElementChild?.matches(".report-heading") };
  }));
  assert.ok(metrics.length > 2);
  assert.ok(metrics.every(page => !page.overflow && !page.empty && !page.orphan && page.heading === 1 && page.footer === 1));
  assert.equal(metrics.at(-1)?.counter, `${metrics.length} / ${metrics.length}`);
  const normalize = (text: string) => text.replace(/\s+/g, "");
  const text = normalize(await document.$$eval("#pages .report-paragraph", elements => elements.map(element => element.textContent).join("")));
  assert.equal(text, normalize(report.sections.flatMap(section => section.paragraphs).join("")), "Aucun paragraphe perdu lors de la pagination");
  assert.equal(await document.$$eval("#pages img", images => images.filter(image => !image.complete || !image.naturalWidth).length), 0);
  await (await document.$(".report-page"))!.screenshot({ path: path.join(out, "rapport-page-1.png") });
  await document.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1050 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  let mode: "success" | "error" | "slow" = "error";
  const requests: ReportChat[] = [];
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (!request.url().endsWith("/api/rapports/chat")) { void request.continue(); return; }
    const input = reportChatSchema.parse(JSON.parse(request.postData() || "{}"));
    requests.push(input);
    if (mode === "slow") return; // Annulée côté navigateur, sans appel réseau.
    if (mode === "error") { void request.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Le service Rapports IA n’est pas encore configuré." }) }); return; }
    const output = input.report ? { ...input.report, title: "Rapport révisé" } : { ...exampleReport(), title: "Rapport de chantier généré" };
    if (input.images.length) output.sections[0].images = [{ imageId: input.images[0].id, caption: "Photographie jointe au rapport" }];
    void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ message: input.report ? "La révision est prête." : "Votre rapport est prêt.", report: output }) });
  });
  const click = async (label: string) => page.evaluate(label => {
    const button = Array.from(window.document.querySelectorAll("button")).find(button => button.textContent?.trim() === label && button.checkVisibility());
    if (!button) throw new Error(`Bouton introuvable : ${label}`);
    button.click();
  }, label);
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !(window.document.querySelector("fieldset") as HTMLFieldSetElement)?.disabled);
  await page.type('[name="destinataire"]', "Client conservé pendant le changement");
  await click("Rapports IA");
  await page.waitForSelector("#report-prompt");
  await click("Voir un exemple");
  await page.waitForFunction(() => Array.from(window.document.querySelectorAll("iframe")).some(frame => frame.title === "Rapport au format A4"));
  const reportFrame = await (await page.$('iframe[title="Rapport au format A4"]'))!.contentFrame();
  assert.ok(reportFrame);
  await reportFrame.waitForFunction("window.__reportReady");
  await page.type("#report-prompt", "Prépare un rapport de chantier.");
  await click("Envoyer");
  await page.waitForSelector(".report-error");
  assert.ok(await page.$eval(".report-error", element => element.textContent?.includes("pas encore configuré")));
  assert.equal(await page.$eval("#report-prompt", element => (element as HTMLTextAreaElement).value), "Prépare un rapport de chantier.");
  assert.equal(requests[0].report, null, "L’exemple n’est pas envoyé au modèle comme des faits du projet");

  const upload = await page.$('input[type="file"]');
  await upload!.uploadFile(path.join(process.cwd(), "public/logo-exnov.png"));
  await page.waitForSelector(".report-attachment");
  mode = "success";
  await click("Envoyer");
  await page.waitForFunction(() => window.document.querySelectorAll(".report-message.assistant").length === 1);
  await reportFrame.waitForFunction("window.__reportReady && document.getElementById('pages').textContent.includes('Rapport de chantier généré')");
  assert.equal(requests.at(-1)?.images.length, 1);
  await page.type("#report-prompt", "Modifie le titre du rapport.");
  await click("Modifier le rapport");
  await page.waitForFunction(() => window.document.querySelectorAll(".report-message.assistant").length === 2);
  await reportFrame.waitForFunction("window.__reportReady && document.getElementById('pages').textContent.includes('Rapport révisé')");
  assert.equal(requests.at(-1)?.messages.length, 3);
  assert.equal(requests.at(-1)?.report?.title, "Rapport de chantier généré");
  assert.equal(requests.at(-1)?.images.length, 1);

  await click("Factures / Devis");
  assert.equal(await page.$eval('[name="destinataire"]', element => (element as HTMLInputElement).value), "Client conservé pendant le changement");
  await click("Rapports IA");
  assert.equal(await page.$$eval(".report-message.assistant", elements => elements.length), 2);
  const session = await page.createCDPSession();
  await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: out });
  const pdfResponse = page.waitForResponse(response => response.url().endsWith("/api/rapports/pdf"));
  await click("Télécharger le rapport PDF");
  assert.equal((await pdfResponse).status(), 200);
  await page.waitForSelector(".report-status");
  await page.screenshot({ path: path.join(out, "rapports-desktop.png"), fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "rapports-mobile.png"), fullPage: true });
  assert.ok(await page.evaluate(() => window.document.documentElement.scrollWidth <= window.innerWidth), "Pas de débordement sur mobile");

  mode = "slow";
  await page.type("#report-prompt", "Cette demande sera annulée.");
  await click("Modifier le rapport");
  await page.waitForSelector(".report-thinking");
  await click("Annuler");
  await page.waitForFunction(() => window.document.querySelector(".report-status")?.textContent?.includes("annulée"));
  assert.equal(await page.$eval("#report-prompt", element => (element as HTMLTextAreaElement).value), "Cette demande sera annulée.");
  assert.equal(await page.$$eval(".report-message.assistant", elements => elements.length), 2);
  await page.click('.report-attachment button');
  await reportFrame.waitForFunction("window.__reportReady && !document.querySelector('.report-figure')");
  await click("Nouveau rapport");
  assert.equal(await page.$$eval(".report-message", elements => elements.length), 0);
  assert.equal(await page.$$eval(".report-attachment", elements => elements.length), 0);
  assert.equal(await page.$eval("#report-prompt", element => (element as HTMLTextAreaElement).value), "");
  assert.deepEqual(errors, []);
  console.log(`OK : ${metrics.length} pages sans débordement, photos, PDF, chat et révision simulés, erreurs, annulation, changement de service et mobile. Aucun appel AWS.`);
} finally { await browser.close(); }
