/** Session and provider regression checks; all team requests use local fixtures. */
import assert from "node:assert/strict";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { createProject } from "../src/lib/projects";
import type { TeamRole } from "../src/lib/team";

const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3013";
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
let checks = 0;
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
try {
  for (const role of ["admin", "manager", "technician", "technician_pro"] as TeamRole[]) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    const user = { id: crypto.randomUUID(), name: "Collaborateur test", email: "collaborateur@example.test", role, active: true };
    const project = createProject({ name: "Projet test", client: "Client", reference: "TEST", site: "Tanger", withBdp: true, requiredDocuments: [] });
    let signedIn = false, loginRequests = 0, logoutRequests = 0;
    await page.evaluateOnNewDocument(() => {
      if (window === window.top) localStorage.setItem("exnov.demo-session.v1", "ancienne-demo@example.test");
    });
    await page.setRequestInterception(true);
    page.on("request", async request => {
      const url = new URL(request.url());
      let body: unknown;
      if (url.pathname === "/api/team/session") body = { mode: "team", user: signedIn ? user : null };
      else if (url.pathname === "/api/auth/sign-in/email") {
        const credentials = JSON.parse(request.postData()!);
        equal(credentials.email, user.email, "La connexion transmet l’adresse à Better Auth");
        equal(credentials.password, "Test-password-2026", "Le mot de passe est transmis à Better Auth");
        signedIn = true; loginRequests++; body = { user, token: "test-session", redirect: false };
      } else if (url.pathname === "/api/auth/sign-out") { signedIn = false; logoutRequests++; body = { success: true }; }
      else if (url.pathname === "/api/projects") body = { projects: [project] };
      if (body) await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      else await request.continue();
    });
    await page.goto(`${origin}/?service=factures`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".login-form");
    equal(await page.$(".app-header"), null, "Une ancienne session démo ne contourne pas la connexion équipe");
    await page.type("#login-email", user.email);
    await page.type("#login-password", "Test-password-2026");
    await page.click('.login-form button[type="submit"]');
    await page.waitForSelector(".project-overview", { visible: true });
    equal(loginRequests, 1, "La connexion passe par le fournisseur équipe");
    equal(new URL(page.url()).pathname, "/projets", "La connexion ouvre les projets");
    equal(await page.$eval('.avatar', element => element.getAttribute("aria-label")), `Connecté : ${user.email}`, "Le profil vient de la session équipe");
    const manage = role === "admin" || role === "manager";
    const ai = role !== "technician";
    const links = await page.$$eval('.service-switch button', buttons => buttons.map(button => button.textContent));
    equal(links.includes("Factures / Devis"), manage, "Accès aux factures selon le rôle");
    equal(links.includes("Rapports IA"), ai, "Accès IA selon le rôle");
    if (manage) {
      await page.goto(`${origin}/?service=factures`, { waitUntil: "networkidle0" });
      await page.waitForSelector('#invoice-form', { visible: true });
      checks++;
    }
    if (ai) {
      await page.goto(`${origin}/cps`, { waitUntil: "networkidle0" });
      await page.waitForSelector('#cps-prompt', { visible: true });
      checks++;
    }
    await page.click('[aria-label="Se déconnecter"]');
    await page.waitForSelector('.login-form');
    equal(logoutRequests, 1, "La déconnexion termine la session via Better Auth");
    equal(await page.$('.app-header'), null, "Les ateliers sont démontés à la déconnexion");
    equal(errors, [], "Aucune erreur de contexte dans le navigateur");
    await page.close();
  }
  for (const mode of ["setup", "error"] as const) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", async request => {
      if (new URL(request.url()).pathname === "/api/team/session") await request.respond({ status: mode === "error" ? 503 : 200, contentType: "application/json", body: JSON.stringify(mode === "error" ? { error: "Session temporairement indisponible" } : { mode, user: null }) });
      else await request.continue();
    });
    await page.goto(origin, { waitUntil: "networkidle0" });
    await page.waitForSelector('.team-setup');
    equal(await page.$('.app-header'), null, "Les ateliers attendent une session valide");
    equal(await page.$('.login-form'), null, "Les états configuration et erreur sont affichés explicitement");
    await page.close();
  }
  console.log(`PASS ${checks} contrôles : contexte équipe, connexion, session, rôles, ateliers et déconnexion.`);
} finally { await browser.close(); }
