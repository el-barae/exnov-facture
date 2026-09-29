/** Browser import checks: real IndexedDB, simulated team API, no external credentials. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { CivilProject } from "../src/lib/projects";

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results", "project-import");
await mkdir(out, { recursive: true });
const now = new Date().toISOString();
const source: CivilProject = {
  id: "00000000-0000-4000-8000-000000000080", name: "Dossier local à partager", client: "Commune de Tanger", site: "Tanger", reference: "IMPORT-001", withBdp: false,
  requiredDocuments: [], revision: 2, createdAt: now, updatedAt: now, completedSteps: [], history: [],
  documents: [
    { id: "00000000-0000-4000-8000-000000000081", kind: "rapport", name: "visite.pdf", size: 8, mime: "application/pdf", uploadedAt: now },
    { id: "00000000-0000-4000-8000-000000000082", kind: "photo", name: "photo.png", size: 8, mime: "image/png", uploadedAt: now },
  ],
};
const manager = { id: "00000000-0000-4000-8000-000000000010", name: "Chef de projets", email: "manager@example.test", role: "manager", active: true };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
let checks = 0;
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.evaluateOnNewDocument(() => {
    const original = indexedDB.open.bind(indexedDB);
    Reflect.set(window, "__importLocalReadCount", 0);
    indexedDB.open = (...args: Parameters<IDBFactory["open"]>) => { if (args[0] === "exnov.projets.v1") Reflect.set(window, "__importLocalReadCount", Reflect.get(window, "__importLocalReadCount") + 1); return original(...args); };
  });
  let project: CivilProject = { ...source, documents: [] };
  let completed = false;
  let failSecondUpload = true;
  let finalizations = 0;
  let cancelledUploads = 0;
  let starts = 0;
  const uploadAttempts: string[] = [];
  const uploads = new Map<string, string>();
  await page.setRequestInterception(true);
  page.on("request", async request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) { await request.continue(); return; }
    let body: unknown = {};
    let status = 200;
    if (url.pathname === "/api/team/session") body = { mode: "team", user: manager };
    else if (url.pathname === "/api/team/members") body = { users: [manager] };
    else if (url.pathname === "/api/projects") body = { projects: completed ? [project] : [] };
    else if (url.pathname.endsWith("/tasks")) body = { tasks: [] };
    else if (url.pathname === "/api/projects/import") {
      assert.deepEqual(JSON.parse(request.postData()!), source, "The source metadata reaches import unchanged");
      starts += 1; body = { project, completed };
    } else if (url.pathname === `/api/projects/import/${source.id}`) {
      assert.equal(project.documents.length, source.documents.length);
      finalizations += 1; completed = true; body = { project };
    } else if (url.pathname === `/api/projects/${source.id}/uploads`) {
      const input = JSON.parse(request.postData()!);
      assert.ok(source.documents.some(document => document.id === input.importDocumentId));
      uploadAttempts.push(input.importDocumentId);
      const id = `upload-${uploadAttempts.length}`;
      uploads.set(id, input.importDocumentId);
      body = { upload: { id, chunkSize: 4 } };
    } else if (url.pathname.includes("/uploads/")) {
      const uploadId = url.pathname.split("/").at(-1)!;
      const documentId = uploads.get(uploadId)!;
      if (request.method() === "PUT" && documentId === source.documents[1].id && failSecondUpload) {
        failSecondUpload = false; status = 503; body = { error: "Transfert interrompu pour le test." };
      } else if (request.method() === "POST") {
        project = { ...project, revision: project.revision + 1, documents: [...project.documents, source.documents.find(document => document.id === documentId)!] };
        body = { project };
      } else if (request.method() === "DELETE") cancelledUploads += 1;
    } else { status = 404; body = { error: "Unexpected API in import browser check" }; }
    await request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.setViewport({ width: 1440, height: 1050 });
  await page.goto(origin + "/projets", { waitUntil: "networkidle0" });
  await page.waitForSelector(".local-project-import");
  assert.equal(await page.evaluate(() => Reflect.get(window, "__importLocalReadCount")), 0, "Opening team projects does not inspect local dossiers"); checks++;
  await page.evaluate(async project => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("exnov.projets.v1", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("projects", { keyPath: "id" });
        request.result.createObjectStore("files", { keyPath: "id" }).createIndex("projectId", "projectId");
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["projects", "files"], "readwrite");
      transaction.objectStore("projects").add(project);
      for (const document of project.documents) transaction.objectStore("files").add({ id: document.id, projectId: project.id, blob: new Blob(["12345678"], { type: document.mime }) });
      transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, source);
  await page.click(".local-import-heading button");
  await page.waitForSelector(".local-import-selection select");
  assert.equal(await page.$eval(".local-import-selection select", element => (element as HTMLSelectElement).value), source.id); checks++;
  assert.equal(starts, 0, "Finding local dossiers does not publish them"); checks++;
  await page.click(".local-import-selection .primary-button");
  await page.waitForSelector(".local-project-import .project-error");
  assert.equal(finalizations, 0, "An interrupted import is not finalized"); checks++;
  assert.equal(cancelledUploads, 1, "An incomplete transfer is cancelled"); checks++;
  assert.match(await page.$eval(".local-project-import .project-error", element => element.textContent || ""), /réessayer/); checks++;
  await page.click(".local-import-selection .primary-button");
  await page.waitForSelector(".local-project-import .project-success");
  assert.equal(uploadAttempts.filter(id => id === source.documents[0].id).length, 1, "Retry skips the document already transferred"); checks++;
  assert.equal(uploadAttempts.filter(id => id === source.documents[1].id).length, 2); checks++;
  assert.equal(finalizations, 1); checks++;
  assert.equal(await page.$eval(".project-overview h2", element => element.textContent), source.name, "Successful import opens its project"); checks++;
  assert.match(await page.$eval(".local-project-import .project-success", element => element.textContent || ""), /conservés/); checks++;
  await page.screenshot({ path: path.join(out, "import-desktop.png"), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Import without overflow at ${width}px`); checks++;
  }
  await page.screenshot({ path: path.join(out, "import-mobile.png"), fullPage: true });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".local-import-heading button");
  await page.click(".local-import-heading button");
  await page.waitForSelector(".local-import-selection select");
  await page.click(".local-import-selection .primary-button");
  await page.waitForSelector(".local-project-import .project-success");
  assert.equal(uploadAttempts.length, 3, "An already completed import does not send documents again"); checks++;
  assert.equal(finalizations, 1); checks++;
  const localCopy = await page.evaluate(async project => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open("exnov.projets.v1", 1); request.onsuccess = () => resolve(request.result); });
    const saved = await new Promise<unknown>(resolve => { const request = db.transaction("projects").objectStore("projects").get(project.id); request.onsuccess = () => resolve(request.result); });
    const records = await new Promise<{ blob: Blob }[]>(resolve => { const request = db.transaction("files").objectStore("files").getAll(); request.onsuccess = () => resolve(request.result); });
    db.close(); return { project: saved, fileContents: await Promise.all(records.map(record => record.blob.text())) };
  }, source);
  assert.deepEqual(localCopy.project, source, "The local project is unchanged"); checks++;
  assert.deepEqual(localCopy.fileContents, ["12345678", "12345678"], "All local files remain intact"); checks++;
  assert.deepEqual(errors, []); checks++;
  console.log(`PASS ${checks} browser import checks: explicit local read, retry, idempotence, intact local copies and responsive layout.`);
} finally { await browser.close(); }
