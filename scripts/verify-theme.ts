/** Thème système, persistance, contrastes et parcours navigateur sans appel IA réel. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Frame, type Page } from "puppeteer-core";
import { login } from "./helpers/login";
import { exampleCps } from "../tests/fixtures/cps";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results", "theme");
const storageKey = "exnov.theme.v1";
await mkdir(out, { recursive: true });

async function expectTheme(page: Page, theme: "light" | "dark") {
  await page.waitForFunction(value => document.documentElement.dataset.theme === value, {}, theme);
  await page.waitForFunction(label => document.querySelector<HTMLButtonElement>(".theme-toggle")?.getAttribute("aria-label") === label, {}, theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre");
  assert.equal(await page.$eval(".theme-toggle", element => element.tagName), "BUTTON");
}

async function expectSurface(scope: Page | Frame, selector: string, theme: "light" | "dark", minimumContrast = 4.5) {
  const styles = await scope.$eval(selector, element => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) backgrounds.unshift(getComputedStyle(current).backgroundColor);
    return { backgrounds, color: getComputedStyle(element).color };
  });
  // Calculs côté Node : aucun helper nommé transformé par tsx dans la fonction sérialisée.
  const parse = (value: string) => {
    const channels = value.match(/[\d.]+/g)?.map(Number) || [];
    return [channels[0] || 0, channels[1] || 0, channels[2] || 0, channels[3] ?? 1];
  };
  const luminance = (channels: number[]) => channels.slice(0, 3).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  let background = [255, 255, 255];
  for (const value of styles.backgrounds) {
    const rgba = parse(value);
    background = background.map((channel, index) => rgba[index] * rgba[3] + channel * (1 - rgba[3]));
  }
  const color = parse(styles.color);
  const foreground = background.map((channel, index) => color[index] * color[3] + channel * (1 - color[3]));
  const backgroundLuminance = luminance(background);
  const foregroundLuminance = luminance(foreground);
  const metrics = { background, foreground, backgroundLuminance, contrast: (Math.max(backgroundLuminance, foregroundLuminance) + 0.05) / (Math.min(backgroundLuminance, foregroundLuminance) + 0.05) };
  if (theme === "dark") assert.ok(metrics.backgroundLuminance < 0.12, `${selector} doit avoir un fond sombre : ${JSON.stringify(metrics)}`);
  else assert.ok(metrics.backgroundLuminance > 0.8, `${selector} doit conserver un fond clair : ${JSON.stringify(metrics)}`);
  assert.ok(metrics.contrast >= minimumContrast, `${selector} : contraste ${metrics.contrast.toFixed(2)} insuffisant (minimum ${minimumContrast})`);
}

async function click(page: Page, label: string) {
  await page.waitForFunction(value => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === value && button.checkVisibility() && !button.disabled), {}, label);
  await page.evaluate(value => Array.from(document.querySelectorAll("button")).find(button => button.textContent?.trim() === value && button.checkVisibility() && !button.disabled)!.click(), label);
}

async function expectResponsive(page: Page, width: number) {
  await page.setViewport({ width, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Pas de débordement à ${width}px`);
  assert.ok(await page.$eval(".theme-toggle", element => {
    const bounds = element.getBoundingClientRect();
    return element.checkVisibility() && bounds.width >= 32 && bounds.height >= 32 && bounds.left >= 0 && bounds.right <= innerWidth;
  }), `Le bouton de thème reste accessible à ${width}px`);
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
  // Bloquer les scripts externes empêche React d’hydrater mais laisse le bootstrap inline s’exécuter.
  const early = await browser.newPage();
  await early.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await early.setRequestInterception(true);
  early.on("request", request => { if (request.resourceType() === "script") void request.abort(); else void request.continue(); });
  await early.goto(origin, { waitUntil: "networkidle0" });
  assert.equal(await early.$eval("html", element => element.dataset.theme), "dark", "Le thème est appliqué avant l’hydratation");
  await expectSurface(early, "body", "dark");
  await early.close();

  const page = await browser.newPage();
  const errors: string[] = [];
  const unexpectedAiRequests: string[] = [];
  let mockedCpsRequests = 0;
  page.on("pageerror", error => errors.push(String(error)));
  await page.setViewport({ width: 1440, height: 1050 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/cps/generate") {
      mockedCpsRequests++;
      void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Exemple de test prêt.", document: exampleCps() }) });
    } else if (new URL(request.url()).pathname === "/api/rapports/chat") {
      unexpectedAiRequests.push(request.url());
      void request.abort();
    } else void request.continue();
  });
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForSelector(".login-form");
  await expectTheme(page, "dark");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), null, "La préférence système ne crée pas de choix explicite");
  await expectSurface(page, ".login-card h2", "dark");
  await expectSurface(page, "#login-email", "dark");
  await page.screenshot({ path: path.join(out, "connexion-sombre.png"), fullPage: true });
  for (const width of [390, 320]) {
    await expectResponsive(page, width);
    await page.screenshot({ path: path.join(out, `connexion-sombre-${width}.png`), fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 1050 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await expectTheme(page, "light");
  await expectSurface(page, ".login-card h2", "light");
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await expectTheme(page, "dark");
  await page.focus(".theme-toggle");
  await page.keyboard.press("Space");
  await expectTheme(page, "light");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), "light");
  await page.reload({ waitUntil: "networkidle0" });
  await expectTheme(page, "light");
  await page.click(".theme-toggle");
  await expectTheme(page, "dark");
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await expectTheme(page, "dark");
  await page.reload({ waitUntil: "networkidle0" });
  await expectTheme(page, "dark");

  await login(page, origin);
  await expectTheme(page, "dark");
  await expectSurface(page, ".app-header", "dark");
  await expectSurface(page, ".projects-sidebar-title", "dark");
  await expectSurface(page, ".project-empty-state h2", "dark");
  await click(page, "Nouveau projet");
  await page.waitForSelector("dialog[open]");
  await expectSurface(page, "dialog[open] h2", "dark");
  await expectSurface(page, '[name="projectName"]', "dark");
  await page.screenshot({ path: path.join(out, "dialogue-projet-sombre.png"), fullPage: true });
  await page.type('[name="projectName"]', "Vérification du mode sombre");
  await page.type('[name="projectClient"]', "Client de démonstration");
  await page.type('[name="projectSite"]', "Tanger");
  await page.type('[name="projectReference"]', "THEME-2026");
  await click(page, "Créer le projet");
  await page.waitForSelector("dialog[open]", { hidden: true });
  await page.waitForSelector(".project-overview");
  await expectSurface(page, ".project-overview h2", "dark");
  await expectSurface(page, ".project-workflow-panel h3", "dark");
  await expectSurface(page, ".project-documents-panel h3", "dark");
  await page.click('[data-step="cadrage"]');
  await page.waitForSelector("dialog[open]");
  await expectSurface(page, ".project-step-notice", "dark");
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog[open]", { hidden: true });
  await page.screenshot({ path: path.join(out, "projets-sombre.png"), fullPage: true });
  for (const width of [1000, 900, 768, 651, 650, 390, 320]) {
    await expectResponsive(page, width);
    if (width === 390 || width === 320) {
      await page.screenshot({ path: path.join(out, `projets-sombre-${width}.png`), fullPage: true });
      await page.click('[data-step="cadrage"]');
      assert.ok(await page.$eval("dialog[open]", element => element.scrollWidth <= element.clientWidth), `Dialogue sans débordement à ${width}px`);
      await page.keyboard.press("Escape");
      await page.waitForSelector("dialog[open]", { hidden: true });
    }
  }
  await page.setViewport({ width: 1440, height: 1050 });

  await click(page, "Factures / Devis");
  await page.waitForSelector("#invoice-form", { visible: true });
  await expectTheme(page, "dark");
  await expectSurface(page, "#invoice-form .form-section", "dark");
  await expectSurface(page, '.export-panel h2', "dark");
  const invoiceFrame = await (await page.$('iframe[title="Facture au format A4"]'))!.contentFrame();
  assert.ok(invoiceFrame);
  await invoiceFrame.waitForFunction("window.__invoiceReady === true");
  await expectSurface(invoiceFrame, ".invoice-page", "light");
  await page.screenshot({ path: path.join(out, "factures-sombre-apercu-clair.png"), fullPage: true });

  await click(page, "Rapports IA");
  await page.waitForSelector("#report-prompt", { visible: true });
  await expectTheme(page, "dark");
  await expectSurface(page, ".report-chat-heading h2", "dark");
  await expectSurface(page, "#report-prompt", "dark");
  await click(page, "Voir un exemple");
  await page.waitForSelector('iframe[title="Rapport au format A4"]');
  const reportFrame = await (await page.$('iframe[title="Rapport au format A4"]'))!.contentFrame();
  assert.ok(reportFrame);
  await reportFrame.waitForFunction("window.__reportReady === true");
  await expectSurface(reportFrame, ".report-page", "light");
  await page.screenshot({ path: path.join(out, "rapports-sombre-apercu-clair.png"), fullPage: true });

  await click(page, "CPS IA");
  await page.waitForSelector("#cps-prompt", { visible: true });
  await expectTheme(page, "dark");
  await expectSurface(page, ".cps-form h2", "dark");
  await expectSurface(page, "#cps-prompt", "dark");
  await page.type("#cps-prompt", "Créer un exemple fictif pour vérifier l’aperçu.");
  await page.click('.cps-form button[type="submit"]');
  await page.waitForSelector(".cps-paper");
  await expectSurface(page, ".cps-paper", "light");
  assert.equal(mockedCpsRequests, 1);
  await page.screenshot({ path: path.join(out, "cps-sombre-apercu-clair.png"), fullPage: true });

  const secondTab = await browser.newPage();
  secondTab.on("pageerror", error => errors.push(String(error)));
  await secondTab.goto(origin, { waitUntil: "networkidle0" });
  await expectTheme(secondTab, "dark");
  await page.click(".theme-toggle");
  await expectTheme(page, "light");
  await expectTheme(secondTab, "light");
  await secondTab.click(".theme-toggle");
  await expectTheme(page, "dark");
  await expectTheme(secondTab, "dark");
  await page.click('[aria-label="Se déconnecter"]');
  await page.waitForSelector(".login-form");
  await secondTab.waitForSelector(".login-form");
  await expectTheme(page, "dark");
  await expectTheme(secondTab, "dark");
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), "dark", "La déconnexion conserve le thème");
  await secondTab.close();

  const blocked = await browser.newPage();
  blocked.on("pageerror", error => errors.push(String(error)));
  await blocked.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await blocked.evaluateOnNewDocument(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Stockage bloqué pour le test", "SecurityError"); } });
  });
  await blocked.goto(origin, { waitUntil: "networkidle0" });
  await expectTheme(blocked, "light");
  await blocked.click(".theme-toggle");
  await expectTheme(blocked, "dark");
  await expectSurface(blocked, ".login-card h2", "dark");
  await blocked.type("#login-email", "theme@exnov.ma");
  await blocked.type("#login-password", "demonstration");
  await blocked.click('.login-form button[type="submit"]');
  await blocked.waitForSelector(".projects-workspace", { visible: true });
  await expectTheme(blocked, "dark");
  await blocked.click(".theme-toggle");
  await expectTheme(blocked, "light");
  await blocked.close();
  assert.deepEqual(errors, [], "Aucune erreur JavaScript ou d’hydratation");
  assert.deepEqual(unexpectedAiRequests, [], "Aucun appel IA réel");
  console.log("OK : thème avant hydratation, préférence système, clavier, persistance, connexion/déconnexion, quatre espaces, dialogues, contrastes, aperçus clairs, multi-onglets, stockage bloqué et mobile/tablette.");
} finally { await browser.close(); }
