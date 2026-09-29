/** Connexion simulée, navigation, persistance, déconnexion et affichage mobile. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { login } from "./helpers/login";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results", "connexion");
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForSelector(".login-form");
  assert.equal(await page.$(".app-header"), null);
  assert.equal(await page.$(".projects-workspace"), null);
  await page.click('.login-form button[type="submit"]');
  assert.equal(await page.$eval(".login-form", form => (form as HTMLFormElement).checkValidity()), false);
  await page.type("#login-email", "adresse-invalide");
  await page.type("#login-password", "test-password");
  assert.equal(await page.$eval(".login-form", form => (form as HTMLFormElement).checkValidity()), false);
  await page.click('[aria-label="Afficher le mot de passe"]');
  assert.equal(await page.$eval("#login-password", input => (input as HTMLInputElement).type), "text");
  await page.click('[aria-label="Masquer le mot de passe"]');
  assert.equal(await page.$eval("#login-password", input => (input as HTMLInputElement).type), "password");
  await page.reload({ waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(out, "connexion-desktop.png"), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Connexion sans débordement à ${width}px`);
    await page.screenshot({ path: path.join(out, `connexion-mobile-${width}.png`), fullPage: true });
  }

  await page.setViewport({ width: 1440, height: 1000 });
  await login(page, origin);
  assert.equal(await page.$eval('.service-switch [aria-pressed="true"]', element => element.textContent), "Projets");
  assert.ok(await page.$eval(".header-logo", element => {
    const image = element as HTMLImageElement;
    return image.getAttribute("src") === "/logo.png" && image.complete && image.naturalWidth === 229;
  }));
  assert.ok(await page.evaluate(() => !JSON.stringify(localStorage).includes("demonstration")), "Le mot de passe n’est pas enregistré");
  await page.screenshot({ path: path.join(out, "projets-header.png"), fullPage: true });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".projects-workspace", { visible: true });

  for (const [label, selector, url] of [
    ["Factures / Devis", "#invoice-form", "/?service=factures"],
    ["Rapports IA", "#report-prompt", "/?service=rapports"],
    ["CPS IA", "#cps-prompt", "/cps"],
  ]) {
    await page.$$eval(".service-switch button", (buttons, label) => buttons.find(button => button.textContent === label)!.click(), label);
    await page.waitForSelector(selector, { visible: true });
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, url);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector(selector, { visible: true });
  }
  await page.click(".brand-lockup");
  await page.waitForSelector(".projects-workspace", { visible: true });
  await page.goBack();
  await page.waitForSelector("#cps-prompt", { visible: true });
  await page.goForward();
  await page.waitForSelector(".projects-workspace", { visible: true });
  for (const width of [1440, 900, 768, 651, 390, 320]) {
    await page.setViewport({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `En-tête sans débordement à ${width}px`);
  }

  const secondTab = await browser.newPage();
  await secondTab.goto(origin, { waitUntil: "networkidle0" });
  await secondTab.waitForSelector(".projects-workspace", { visible: true });
  await page.click('[aria-label="Se déconnecter"]');
  await page.waitForSelector(".login-form");
  await secondTab.waitForSelector(".login-form");
  assert.equal(new URL(page.url()).pathname, "/");
  await secondTab.close();
  await page.goBack();
  await page.waitForSelector(".login-form");
  assert.equal(await page.$(".app-header"), null);

  for (const url of ["/projets", "/cps", "/?service=rapports", "/?service=factures"]) {
    await page.goto(origin + url, { waitUntil: "networkidle0" });
    await page.waitForSelector(".login-form");
    assert.equal(await page.$(".app-header"), null, "La connexion précède chaque accès direct");
  }
  // Une connexion depuis un ancien lien ouvre également les projets en premier.
  await page.type("#login-email", "autre@exnov.ma");
  await page.type("#login-password", "test");
  await page.click('.login-form button[type="submit"]');
  await page.waitForSelector(".projects-workspace", { visible: true });
  assert.equal(new URL(page.url()).pathname, "/projets");
  await page.click('[aria-label="Se déconnecter"]');

  // Le formulaire fonctionne même si le navigateur interdit le stockage.
  const blocked = await browser.newPage();
  await blocked.evaluateOnNewDocument(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Bloqué", "SecurityError"); } });
  });
  await login(blocked, origin);
  await blocked.click('[aria-label="Se déconnecter"]');
  await blocked.waitForSelector(".login-form");
  await blocked.close();
  assert.deepEqual(errors, []);
  console.log("OK : connexion, validation, projets en premier, logo, session persistante, navigation, déconnexion multi-onglets, accès directs et mobile.");
} finally { await browser.close(); }
