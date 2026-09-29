/** Browser checks with simulated team APIs. No live account or project is changed. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { applyProjectAction, createProject, WORKFLOW_STEPS, type ProjectAction } from "../src/lib/projects";
import type { ProjectTask, TeamRole, TeamUser } from "../src/lib/team";
import { showProjectStep } from "./helpers/project-workflow";

const origin = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3013";
const output = "test-results/workflow";
await mkdir(output, { recursive: true });
const roles: TeamRole[] = ["admin", "manager", "technician", "technician_pro"];
const members: TeamUser[] = roles.map((role, index) => ({ id: `00000000-0000-4000-8000-00000000000${index + 1}`, name: `Membre ${role}`, email: `${role}@example.test`, role, active: true }));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
let checks = 0;
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
try {
  for (const user of members) {
    const canManage = user.role === "admin" || user.role === "manager";
    let project = createProject({ name: "Réhabilitation du bâtiment", client: "Commune de Tanger", site: "Tanger", reference: "GC-2026-042", withBdp: true, requiredDocuments: [] });
    const now = new Date().toISOString();
    let tasks: ProjectTask[] = [
      { id: crypto.randomUUID(), projectId: project.id, stepId: "visite", title: "Relever les dimensions", description: "Joindre le relevé et les photos.", assigneeId: user.id, status: "todo", dueDate: null, revision: 0, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), projectId: project.id, stepId: null, title: "Coordonner la mission", description: "", assigneeId: user.id, status: "todo", dueDate: null, revision: 0, createdAt: now, updatedAt: now },
    ];
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.setRequestInterception(true);
    page.on("request", async request => {
      const url = new URL(request.url());
      let body: unknown;
      if (url.pathname === "/api/team/session") body = { mode: "team", user };
      else if (url.pathname === "/api/projects") body = { projects: [project] };
      else if (url.pathname === "/api/team/members") body = { users: members };
      else if (url.pathname === `/api/projects/${project.id}`) {
        if (request.method() === "PATCH") project = applyProjectAction(project, (JSON.parse(request.postData()!) as { action: ProjectAction }).action);
        body = { project };
      } else if (url.pathname === `/api/projects/${project.id}/tasks`) {
        if (request.method() === "POST") {
          const task: ProjectTask = { ...JSON.parse(request.postData()!), id: crypto.randomUUID(), projectId: project.id, status: "todo", revision: 0, createdAt: now, updatedAt: now };
          tasks.push(task); body = { task };
        } else body = { tasks };
      } else if (url.pathname.startsWith(`/api/projects/${project.id}/tasks/`)) {
        const id = url.pathname.split("/").at(-1);
        const task = tasks.find(value => value.id === id)!;
        const next = { ...task, ...JSON.parse(request.postData()!), revision: task.revision + 1 };
        tasks = tasks.map(value => value.id === id ? next : value); body = { task: next };
      }
      if (body) await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      else await request.continue();
    });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${origin}/projets`, { waitUntil: "networkidle0" });
    await page.waitForSelector('.step-task-count:not(:disabled)');
    equal(await page.$(".project-tasks-panel"), null, "Le panneau de tâches séparé est supprimé");
    equal(await page.$$eval("[data-step]", values => values.map(value => value.getAttribute("data-step"))), ["cadrage", "visite", "diagnostic"], "Premier groupe de trois");
    equal(await page.$eval('[aria-label="Étapes précédentes"]', element => (element as HTMLButtonElement).disabled), true, "Début du parcours");
    await page.click('[aria-label="Étapes suivantes"]');
    equal(await page.$$eval("[data-step]", values => values.map(value => value.getAttribute("data-step"))), ["chiffrage", "etudes", "livrables"], "Deuxième groupe de trois");
    await page.click('[aria-label="Étapes suivantes"]');
    equal(await page.$$eval("[data-step]", values => values.map(value => value.getAttribute("data-step"))), ["validation", "facturation", "cloture"], "Troisième groupe avec clôture");
    equal(await page.$eval('[aria-label="Étapes suivantes"]', element => (element as HTMLButtonElement).disabled), true, "Fin du parcours");
    await page.click('[aria-label="Étapes précédentes"]');
    await page.click('[aria-label="Étapes précédentes"]');
    if (canManage) {
      await page.click('[aria-label="Ajouter une tâche : Visite du site"]');
      await page.waitForSelector('dialog[open] .team-task-form');
      equal(await page.$eval('.task-project-context', element => element.textContent?.includes("Visite du site")), true, "Étape préremplie dans le formulaire");
      await page.type('[name="title"]', "Préparer la visite");
      await page.select('[name="assigneeId"]', members[2].id);
      await page.screenshot({ path: `${output}/${user.role}-ajout.png`, fullPage: true });
      await page.click('.team-task-form button[type="submit"]');
      await page.waitForSelector('dialog[open] .team-task-list');
      equal(tasks.at(-1)?.stepId, "visite", "La création conserve le lien à l’étape");
      equal(tasks.at(-1)?.projectId, project.id, "La création conserve le lien au projet");
      await page.click('[aria-label="Modifier la tâche Préparer la visite"]');
      await page.select('[name="stepId"]', "etudes");
      await page.click('.team-task-form button[type="submit"]');
      await page.waitForSelector('dialog[open] .team-task-list');
      equal(tasks.at(-1)?.stepId, "etudes", "Le déplacement d’étape reste possible");
      await page.keyboard.press("Escape");
      await page.waitForSelector('dialog[open]', { hidden: true });
      await page.click('[aria-label="Ajouter une tâche : Diagnostic"]');
      await page.waitForSelector('dialog[open]');
      await page.keyboard.press("Escape");
      equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Ajouter une tâche : Diagnostic", "Retour du focus après annulation");
    } else equal(await page.$(".step-add-task"), null, "Création réservée aux responsables");
    await page.click('[aria-label="Voir les tâches : Visite du site"]');
    await page.waitForSelector('dialog[open] .team-task-list');
    await page.select('.team-task-controls select', "in_progress");
    await page.waitForFunction(() => document.querySelector('dialog[open] [role="status"]')?.textContent?.includes("mise à jour"));
    equal(tasks[0].status, "in_progress", "L’avancement reste modifiable");
    equal(tasks[0].stepId, "visite", "L’avancement conserve l’étape");
    if (!canManage) equal(await page.$('[aria-label^="Modifier la tâche"]'), null, "Le technicien ne modifie pas l’affectation");
    await page.keyboard.press("Escape");
    await page.$$eval('.workflow-pagination button', buttons => (buttons.find(button => button.textContent?.includes("Tâches sans étape")) as HTMLButtonElement).click());
    await page.waitForSelector('dialog[open] .team-task-list');
    equal(await page.$eval('.team-task-info strong', element => element.textContent), "Coordonner la mission", "Les anciennes tâches générales restent accessibles");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `${output}/${user.role}-workflow.png`, fullPage: true });
    for (const width of [768, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Pas de débordement à ${width}px`);
      equal(await page.$$eval("[data-step]", values => values.length), 3, "Trois cartes par groupe sur mobile");
      await page.click('[aria-label="Voir les tâches : Visite du site"]');
      await page.waitForSelector('dialog[open]');
      equal(await page.$eval('dialog[open]', element => element.scrollWidth <= element.clientWidth), true, "La fenêtre reste lisible sur mobile");
      await page.keyboard.press("Escape");
    }
    await page.screenshot({ path: `${output}/${user.role}-mobile.png`, fullPage: true });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    await page.screenshot({ path: `${output}/${user.role}-sombre.png`, fullPage: true });
    if (canManage) {
      for (const [index, step] of WORKFLOW_STEPS.slice(0, -1).entries()) {
        await showProjectStep(page, step.id);
        await page.click(`[data-step="${step.id}"]`);
        await page.waitForFunction(count => document.querySelector('.project-progress-heading strong')?.textContent === String(count), {}, index + 1);
      }
      equal(await page.$(".project-completed-banner"), null, "Le projet attend sa clôture après facturation");
      await page.click('[data-step="cloture"]');
      await page.waitForSelector('dialog[open]');
      equal(project.completedSteps.length, 8, "Ouvrir la clôture ne la valide pas");
      await page.$$eval('dialog[open] button', buttons => (buttons.find(button => button.textContent?.includes("Valider la fin du projet")) as HTMLButtonElement).click());
      await page.waitForSelector('.project-completed-banner');
      equal(project.completedSteps.at(-1)?.stepId, "cloture", "Clôture enregistrée");
      equal(await page.$eval('[role="progressbar"]', element => element.getAttribute("aria-valuenow")), "100", "Projet terminé à 100 %");
    } else equal(await page.$(".project-next-action"), null, "Validation du workflow réservée à la gestion");
    equal(errors, [], "Aucune erreur JavaScript");
    await page.close();
  }
  console.log(`PASS ${checks} contrôles : pagination, modales, tâches, rôles, clôture et mobile.`);
} finally { await browser.close(); }
