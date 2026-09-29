/** Isolated HTTP integration test: real PostgreSQL engine, Better Auth and Next.js. */
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { applyProjectAction, createProject, type CivilProject } from "../src/lib/projects";
import type { ProjectTask, TeamRole, TeamUser } from "../src/lib/team";

const appPort = Number(process.env.TEAM_TEST_PORT ?? 3013);
const origin = `http://127.0.0.1:${appPort}`;
const password = `Test-${randomBytes(24).toString("base64url")}`;
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const adminEmail = "admin@team-test.example";
let checks = 0;

async function availablePort(port = 0) {
  const server = createServer();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function runScript(script: string, environment: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", script], {
    cwd: process.cwd(), env: environment, stdio: ["ignore", "pipe", "pipe"], timeout: 120000,
  });
  let output = "";
  child.stdout.on("data", chunk => { output += String(chunk); });
  child.stderr.on("data", chunk => { output += String(chunk); });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, `${script} failed:\n${output}`);
}

async function stopProcess(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, "exit");
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { await done; } finally { clearTimeout(force); }
}

async function request(path: string, options: {
  method?: string; cookie?: string; body?: unknown; rawBody?: Uint8Array; origin?: string;
} = {}) {
  return fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.rawBody ? { "Content-Type": "application/octet-stream" } : options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.method && options.method !== "GET" ? { origin: options.origin ?? origin } : {}),
    },
    ...(options.rawBody ? { body: new Uint8Array(options.rawBody) } : options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
}

async function expectStatus(response: Response, status: number | number[], label: string) {
  const expected = Array.isArray(status) ? status : [status];
  assert.ok(expected.includes(response.status), `${label}: expected ${expected.join("/")}, got ${response.status}: ${await response.clone().text()}`);
  checks++;
  return response;
}

async function json<T>(response: Response, status: number | number[], label: string): Promise<T> {
  await expectStatus(response, status, label);
  return response.json() as Promise<T>;
}

async function signIn(email: string) {
  const response = await request("/api/auth/sign-in/email", { method: "POST", body: { email, password } });
  await expectStatus(response, 200, `login ${email}`);
  const cookie = response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
  assert.ok(cookie, "The real sign-in endpoint must issue a session cookie");
  assert.ok(response.headers.getSetCookie().some(value => /httponly/i.test(value)), "Session cookies must be HttpOnly");
  return cookie;
}

const db = await PGlite.create();
const databasePort = await availablePort();
const socket = new PGLiteSocketServer({ db, port: databasePort, host: "127.0.0.1", maxConnections: 20 });
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?sslmode=disable`,
  DATABASE_DIRECT_URL: `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?sslmode=disable`,
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  BETTER_AUTH_URL: origin,
  EXNOV_DEMO_MODE: "false",
  EXNOV_ADMIN_NAME: "Administrateur test",
  EXNOV_ADMIN_EMAIL: adminEmail,
  EXNOV_ADMIN_PASSWORD: password,
  NEXT_TELEMETRY_DISABLED: "1",
  EXNOV_DRIVE_TEST_MOCK: "true",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test-service@facturo-test.iam.gserviceaccount.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
  GOOGLE_DRIVE_FOLDER_ID: "test_shared_drive_folder_0001",
};
let app: ChildProcess | undefined;
let appLog = "";

try {
  // Never send test writes to an application already using this port.
  await availablePort(appPort);
  await socket.start();
  console.log("PostgreSQL test engine ready; applying migrations.");
  await runScript("scripts/db-migrate.ts", environment);
  await runScript("scripts/db-migrate.ts", environment);
  await runScript("scripts/db-bootstrap.ts", environment);
  console.log("Migrations are repeatable; administrator created.");

  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    cwd: process.cwd(),
    env: { ...environment, NODE_OPTIONS: [environment.NODE_OPTIONS, `--import=${new URL("./helpers/drive-mock.mjs", import.meta.url).href}`].filter(Boolean).join(" ") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout?.on("data", chunk => { appLog = (appLog + String(chunk)).slice(-30000); });
  app.stderr?.on("data", chunk => { appLog = (appLog + String(chunk)).slice(-30000); });
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    assert.equal(app.exitCode, null, `Next.js stopped unexpectedly:\n${appLog}`);
    try {
      const response = await fetch(`${origin}/api/team/session`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) { ready = true; break; }
    } catch { /* The server may still be compiling the first route. */ }
    await delay(500);
  }
  assert.ok(ready, `Next.js did not become ready:\n${appLog}`);

  const session = await json<{ mode: string; user: TeamUser | null }>(await request("/api/team/session"), 200, "anonymous session");
  assert.equal(session.mode, "team");
  assert.equal(session.user, null);
  await expectStatus(await request("/api/projects"), 401, "anonymous project list");
  await expectStatus(await request("/api/team/members"), 401, "anonymous team list");
  await expectStatus(await request("/api/plans/generate", { method: "POST", body: {} }), 401, "anonymous AI");
  await expectStatus(await request("/api/auth/sign-up/email", {
    method: "POST", body: { name: "Intrus", email: "signup@team-test.example", password },
  }), [400, 403, 404, 422], "public signup disabled");

  const adminCookie = await signIn(adminEmail);
  const adminSession = await json<{ user: TeamUser }>(await request("/api/team/session", { cookie: adminCookie }), 200, "authenticated administrator");
  await expectStatus(await request(`/api/team/members/${adminSession.user.id}`, {
    method: "PATCH", cookie: adminCookie, body: { active: false },
  }), 409, "last administrator cannot be disabled");
  const actors = new Map<TeamRole | "outsider", { cookie: string; user: TeamUser }>();
  for (const role of ["manager", "technician", "technician_pro", "outsider"] as const) {
    const email = `${role}@team-test.example`;
    const response = await json<{ member?: TeamUser; user?: TeamUser }>(await request("/api/team/members", {
      method: "POST", cookie: adminCookie, body: { name: role, email, password, role: role === "outsider" ? "technician" : role },
    }), [200, 201], `admin creates ${role}`);
    const created = response.member ?? response.user;
    assert.ok(created?.id, "Creating a member returns its public profile");
    assert.equal("password" in created, false);
    assert.equal("passwordHash" in created, false);
    actors.set(role, { cookie: await signIn(email), user: created });
  }
  const manager = actors.get("manager")!;
  const technician = actors.get("technician")!;
  const pro = actors.get("technician_pro")!;
  const outsider = actors.get("outsider")!;
  for (const name of ["", "x".repeat(161)]) {
    await expectStatus(await request("/api/auth/update-user", {
      method: "POST", cookie: technician.cookie, body: { name },
    }), 400, "profile update cannot corrupt the shared member list");
  }
  await expectStatus(await request("/api/auth/update-user", {
    method: "POST", cookie: technician.cookie,
    body: { name: "Technicien test", role: "admin", active: true, emailVerified: true },
  }), 200, "technician updates own display name");
  const updatedProfile = await json<{ user: TeamUser }>(await request("/api/team/session", {
    cookie: technician.cookie,
  }), 200, "profile after attempted privilege injection");
  assert.equal(updatedProfile.user.role, "technician");
  assert.equal(updatedProfile.user.name, "Technicien test");
  await expectStatus(await request("/api/team/members", { cookie: adminCookie }), 200, "member list survives invalid profile updates");
  await expectStatus(await request("/api/team/members", { cookie: manager.cookie }), 200, "manager reads assignable members");
  await expectStatus(await request("/api/team/members", {
    method: "POST", cookie: manager.cookie, body: { name: "Escalade", email: "escalation@team-test.example", password, role: "admin" },
  }), 403, "manager cannot create administrators");
  await expectStatus(await request(`/api/team/members/${technician.user.id}`, {
    method: "PATCH", cookie: technician.cookie, body: { role: "admin" },
  }), 403, "technician cannot elevate own role");

  const details = { name: "Projet partagé", client: "Client test", site: "Tanger", reference: "TEAM-001", withBdp: false, requiredDocuments: [] };
  await expectStatus(await request("/api/projects", { method: "POST", cookie: technician.cookie, body: details }), 403, "technician cannot create projects");
  await expectStatus(await request("/api/projects", { method: "POST", cookie: pro.cookie, body: details }), 403, "Pro cannot create projects");
  const { project } = await json<{ project: CivilProject }>(await request("/api/projects", {
    method: "POST", cookie: manager.cookie, body: details,
  }), [200, 201], "manager creates project");
  const projectPath = `/api/projects/${project.id}`;
  const taskInput = { title: "Relevé du bâtiment", description: "Déposer le relevé.", assigneeId: technician.user.id, dueDate: "2026-10-05" };
  const { task } = await json<{ task: ProjectTask }>(await request(`${projectPath}/tasks`, {
    method: "POST", cookie: manager.cookie, body: taskInput,
  }), [200, 201], "manager assigns technician");
  const { task: proTask } = await json<{ task: ProjectTask }>(await request(`${projectPath}/tasks`, {
    method: "POST", cookie: manager.cookie, body: { ...taskInput, title: "Plan assisté", assigneeId: pro.user.id },
  }), [200, 201], "manager assigns Pro");
  const assigned = await json<{ projects: CivilProject[] }>(await request("/api/projects", { cookie: technician.cookie }), 200, "assigned project list");
  assert.deepEqual(assigned.projects.map(value => value.id), [project.id]);
  const hidden = await json<{ projects: CivilProject[] }>(await request("/api/projects", { cookie: outsider.cookie }), 200, "unassigned project list");
  assert.equal(hidden.projects.length, 0);
  await expectStatus(await request(`${projectPath}/tasks`, { cookie: outsider.cookie }), [403, 404], "tasks hidden from unassigned technician");
  const technicianTasks = await json<{ tasks: ProjectTask[] }>(await request(`${projectPath}/tasks`, { cookie: technician.cookie }), 200, "technician reads own work");
  assert.deepEqual(technicianTasks.tasks.map(value => value.id), [task.id]);
  await expectStatus(await request(`${projectPath}/tasks`, {
    method: "POST", cookie: technician.cookie, body: taskInput,
  }), 403, "technician cannot assign tasks");

  const taskPath = `${projectPath}/tasks/${task.id}`;
  await expectStatus(await request(taskPath, {
    method: "PATCH", cookie: technician.cookie, body: { revision: task.revision, status: "done", assigneeId: outsider.user.id },
  }), [400, 403, 422], "technician cannot change task assignee");
  await expectStatus(await request(`${projectPath}/tasks/${proTask.id}`, {
    method: "PATCH", cookie: technician.cookie, body: { revision: proTask.revision, status: "done" },
  }), [403, 404], "technician cannot update colleague task");
  await expectStatus(await request(taskPath, {
    method: "PATCH", cookie: technician.cookie, origin: "https://untrusted.example", body: { revision: task.revision, status: "done" },
  }), 403, "cross-origin write rejected");
  const { task: progressed } = await json<{ task: ProjectTask }>(await request(taskPath, {
    method: "PATCH", cookie: technician.cookie, body: { revision: task.revision, status: "in_progress" },
  }), 200, "technician updates own progress");
  assert.equal(progressed.status, "in_progress");
  assert.equal(progressed.revision, task.revision + 1);
  await expectStatus(await request(taskPath, {
    method: "PATCH", cookie: technician.cookie, body: { revision: task.revision, status: "done" },
  }), 409, "outdated revision rejected");
  await expectStatus(await request(projectPath, {
    method: "PATCH", cookie: technician.cookie, body: { revision: project.revision, action: { type: "edit", details: { ...details, name: "Intrusion" } } },
  }), 403, "technician cannot edit project scope");

  // Binary uploads use the real Drive client against the isolated protocol fixture.
  const fileBytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");
  const metadata = { name: "releve.pdf", size: fileBytes.length, mime: "application/pdf", kind: "rapport", expectedRevision: project.revision };
  const { upload } = await json<{ upload: { id: string; chunkSize: number } }>(await request(`${projectPath}/uploads`, {
    method: "POST", cookie: technician.cookie, body: metadata,
  }), 201, "assigned technician starts upload");
  assert.ok(upload.chunkSize <= 1024 * 1024);
  const uploadPath = `${projectPath}/uploads/${upload.id}`;
  await expectStatus(await request(uploadPath, { method: "POST", cookie: technician.cookie }), 400, "incomplete upload cannot publish");
  const beforeUpload = await json<{ projects: CivilProject[] }>(await request("/api/projects", { cookie: technician.cookie }), 200, "project before upload commit");
  assert.equal(beforeUpload.projects[0].documents.length, 0);
  assert.equal(beforeUpload.projects[0].revision, project.revision);
  const split = Math.floor(fileBytes.length / 2);
  const firstChunk = fileBytes.slice(0, split);
  const received = await json<{ received: number }>(await request(`${uploadPath}?offset=0`, {
    method: "PUT", cookie: technician.cookie, rawBody: firstChunk,
  }), 200, "first upload chunk");
  assert.equal(received.received, split);
  await expectStatus(await request(`${uploadPath}?offset=0`, {
    method: "PUT", cookie: technician.cookie, rawBody: firstChunk,
  }), 409, "duplicate chunk rejected");
  await expectStatus(await request(`${uploadPath}?offset=${split}`, {
    method: "PUT", cookie: pro.cookie, rawBody: fileBytes.slice(split),
  }), 404, "colleague cannot append another user's transfer");
  await expectStatus(await request(`${uploadPath}?offset=${split}`, {
    method: "PUT", cookie: outsider.cookie, rawBody: fileBytes.slice(split),
  }), 404, "unassigned technician cannot append transfer by ID");
  await expectStatus(await request(`${uploadPath}?offset=${split}`, {
    method: "PUT", cookie: technician.cookie, rawBody: fileBytes.slice(split),
  }), 200, "upload resumes after incomplete commit");
  const { project: withReport } = await json<{ project: CivilProject }>(await request(uploadPath, {
    method: "POST", cookie: technician.cookie,
  }), 200, "complete upload publishes atomically");
  assert.equal(withReport.documents.length, 1);
  assert.equal(withReport.revision, project.revision + 1);
  const downloadPath = `${projectPath}/documents/${withReport.documents[0].id}`;
  const downloaded = await expectStatus(await request(downloadPath, { cookie: technician.cookie }), 200, "technician downloads project work");
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), fileBytes);
  assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
  assert.match(downloaded.headers.get("content-disposition") ?? "", /^attachment;/);
  await expectStatus(await request(downloadPath, { cookie: manager.cookie }), 200, "manager sees technician work");
  await expectStatus(await request(downloadPath, { cookie: outsider.cookie }), 404, "document ID cannot bypass assignment");
  await expectStatus(await request(downloadPath), 401, "anonymous document download rejected");
  await expectStatus(await request(uploadPath, { method: "POST", cookie: technician.cookie }), 404, "transfer cannot publish twice");
  const { project: otherProject } = await json<{ project: CivilProject }>(await request("/api/projects", {
    method: "POST", cookie: manager.cookie, body: { ...details, name: "Autre dossier", reference: "TEAM-002" },
  }), 201, "manager creates second project");
  await expectStatus(await request(`/api/projects/${otherProject.id}/documents/${withReport.documents[0].id}`, {
    cookie: manager.cookie,
  }), 404, "document scoped to actual project");
  for (const actor of [technician, pro]) {
    await expectStatus(await request(`${projectPath}/uploads`, {
      method: "POST", cookie: actor.cookie, body: { ...metadata, name: "facture.pdf", kind: "facture" },
    }), 403, "technician cannot upload financial documents");
  }
  const { upload: financeUpload } = await json<{ upload: { id: string } }>(await request(`${projectPath}/uploads`, {
    method: "POST", cookie: manager.cookie, body: { ...metadata, kind: "facture", name: "facture.pdf", expectedRevision: withReport.revision },
  }), 201, "manager starts financial upload");
  const financeUploadPath = `${projectPath}/uploads/${financeUpload.id}`;
  await expectStatus(await request(`${financeUploadPath}?offset=0`, { method: "PUT", cookie: manager.cookie, rawBody: fileBytes }), 200, "financial document bytes");
  const { project: withFinance } = await json<{ project: CivilProject }>(await request(financeUploadPath, { method: "POST", cookie: manager.cookie }), 200, "manager publishes financial document");
  const financeDocument = withFinance.documents.find(document => document.kind === "facture")!;
  assert.ok(financeDocument);
  const financePath = `${projectPath}/documents/${financeDocument.id}`;
  await expectStatus(await request(financePath, { cookie: technician.cookie }), 403, "financial download denied to technician");
  await expectStatus(await request(financePath, { cookie: pro.cookie }), 403, "AI access does not grant financial access");
  await expectStatus(await request(financePath, { cookie: adminCookie }), 200, "administrator downloads financial document");

  // Import a local dossier, including its file and previously completed step.
  let localProject = createProject({ ...details, name: "Dossier local", requiredDocuments: ["rapport"] }, "2026-09-01T09:00:00.000Z");
  const localDocument = { ...withReport.documents[0], id: crypto.randomUUID(), name: "rapport-local.pdf" };
  localProject = applyProjectAction(localProject, { type: "attach", document: localDocument }, "2026-09-02T09:00:00.000Z");
  localProject = applyProjectAction(localProject, { type: "complete", stepId: "cadrage" }, "2026-09-03T09:00:00.000Z");
  await expectStatus(await request("/api/projects/import", { method: "POST", cookie: technician.cookie, body: localProject }), 403, "technician cannot import projects");
  const importing = await json<{ project: CivilProject; completed: boolean }>(await request("/api/projects/import", {
    method: "POST", cookie: manager.cookie, body: localProject,
  }), 200, "manager begins local import");
  assert.equal(importing.completed, false);
  assert.notEqual(importing.project.id, localProject.id);
  assert.equal(importing.project.completedSteps.length, 0);
  const retryImport = await json<{ project: CivilProject; completed: boolean }>(await request("/api/projects/import", {
    method: "POST", cookie: manager.cookie, body: localProject,
  }), 200, "restarting import reuses the same project");
  assert.equal(retryImport.project.id, importing.project.id);
  const finishImportPath = `/api/projects/import/${localProject.id}`;
  await expectStatus(await request(finishImportPath, { method: "POST", cookie: manager.cookie }), 409, "import cannot restore validation before file transfer");
  const importPath = `/api/projects/${importing.project.id}`;
  const importMetadata = { ...metadata, name: localDocument.name, expectedRevision: undefined, importDocumentId: localDocument.id };
  async function transferImport(bytes: Uint8Array, expected: number) {
    const { upload: importedUpload } = await json<{ upload: { id: string } }>(await request(`${importPath}/uploads`, {
      method: "POST", cookie: manager.cookie, body: importMetadata,
    }), 201, "begin imported document transfer");
    const path = `${importPath}/uploads/${importedUpload.id}`;
    await expectStatus(await request(`${path}?offset=0`, { method: "PUT", cookie: manager.cookie, rawBody: bytes }), 200, "transfer imported bytes");
    const response = await expectStatus(await request(path, { method: "POST", cookie: manager.cookie }), expected, "commit imported document");
    if (expected !== 200) await expectStatus(await request(path, { method: "DELETE", cookie: manager.cookie }), 200, "cancel rejected import transfer");
    return response;
  }
  const firstImport = await (await transferImport(fileBytes, 200)).json() as { project: CivilProject };
  const duplicateImport = await (await transferImport(fileBytes, 200)).json() as { project: CivilProject };
  assert.equal(duplicateImport.project.documents.length, 1);
  assert.equal(duplicateImport.project.documents[0].id, localDocument.id);
  assert.equal(duplicateImport.project.revision, firstImport.project.revision, "An identical imported file does not create a second version");
  const differentBytes = fileBytes.slice();
  differentBytes[differentBytes.length - 1] ^= 1;
  await transferImport(differentBytes, 409);
  const { project: imported } = await json<{ project: CivilProject }>(await request(finishImportPath, {
    method: "POST", cookie: manager.cookie,
  }), 200, "completed import restores local workflow");
  assert.deepEqual(imported.completedSteps, localProject.completedSteps);
  assert.equal(imported.createdAt, localProject.createdAt);
  assert.equal(imported.documents.length, 1);
  const completedImport = await json<{ project: CivilProject; completed: boolean }>(await request("/api/projects/import", {
    method: "POST", cookie: manager.cookie, body: localProject,
  }), 200, "completed import can be retried safely");
  assert.equal(completedImport.completed, true);
  assert.equal(completedImport.project.id, imported.id);
  const { project: importedAgain } = await json<{ project: CivilProject }>(await request(finishImportPath, {
    method: "POST", cookie: manager.cookie,
  }), 200, "finishing import again is idempotent");
  assert.equal(importedAgain.revision, imported.revision);
  const importedDownload = await expectStatus(await request(`${importPath}/documents/${localDocument.id}`, {
    cookie: manager.cookie,
  }), 200, "imported document downloads from Drive");
  assert.deepEqual(new Uint8Array(await importedDownload.arrayBuffer()), fileBytes);
  const storedReferences = await db.query<{ drive_file_id: string; sha256: string }>("SELECT drive_file_id,sha256 FROM project_files");
  assert.equal(storedReferences.rows.length, 3);
  assert.ok(storedReferences.rows.every(row => row.drive_file_id.startsWith("test_drive_file_") && /^[a-f0-9]{64}$/.test(row.sha256)));
  const columns = await db.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='project_files'");
  assert.equal(columns.rows.some(row => row.column_name === "bytes"), false, "Published files live in Drive; PostgreSQL stores references and hashes");

  // A file above the serverless buffered-response limit must use a streamed response.
  const largeBytes = new TextEncoder().encode("reference,mesure\n" + "TECH-001,123.456\n".repeat(360000));
  assert.ok(largeBytes.length > 4.5 * 1024 * 1024);
  const { upload: largeUpload } = await json<{ upload: { id: string; chunkSize: number } }>(await request(`${projectPath}/uploads`, {
    method: "POST", cookie: technician.cookie,
    body: { name: "releve-volumineux.csv", kind: "autre", mime: "text/csv", size: largeBytes.length },
  }), 201, "begin document exceeding 4.5 MB");
  const largePath = `${projectPath}/uploads/${largeUpload.id}`;
  for (let offset = 0; offset < largeBytes.length; offset += largeUpload.chunkSize) {
    await expectStatus(await request(`${largePath}?offset=${offset}`, {
      method: "PUT", cookie: technician.cookie, rawBody: largeBytes.slice(offset, offset + largeUpload.chunkSize),
    }), 200, "large document uploaded in bounded chunks");
  }
  const { project: withLargeDocument } = await json<{ project: CivilProject }>(await request(largePath, {
    method: "POST", cookie: technician.cookie,
  }), 200, "publish large document to Drive");
  const largeDocument = withLargeDocument.documents.find(document => document.name === "releve-volumineux.csv")!;
  assert.ok(largeDocument);
  const largeDownload = await expectStatus(await request(`${projectPath}/documents/${largeDocument.id}`, {
    cookie: technician.cookie,
  }), 200, "stream large document download");
  assert.equal(largeDownload.headers.get("content-length"), null);
  assert.equal(largeDownload.headers.get("cache-control"), "no-store");
  assert.equal(largeDownload.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await largeDownload.arrayBuffer()), largeBytes);

  // Task stage links remain subordinate to the project and its available workflow.
  const stageDetails = { ...details, name: "Projet avec étapes", withBdp: true };
  const { project: stageProject } = await json<{ project: CivilProject }>(await request("/api/projects", {
    method: "POST", cookie: manager.cookie, body: stageDetails,
  }), 201, "create project with optional costing stage");
  const stagePath = `/api/projects/${stageProject.id}`;
  const { task: stageTask } = await json<{ task: ProjectTask }>(await request(`${stagePath}/tasks`, {
    method: "POST", cookie: manager.cookie, body: { ...taskInput, stepId: "chiffrage" },
  }), 201, "attach task to costing stage");
  assert.equal(stageTask.projectId, stageProject.id);
  assert.equal(stageTask.stepId, "chiffrage");
  await expectStatus(await request(`${projectPath}/tasks`, {
    method: "POST", cookie: manager.cookie, body: { ...taskInput, stepId: "chiffrage" },
  }), 400, "reject stage excluded from project");
  await expectStatus(await request(`${stagePath}/tasks`, {
    method: "POST", cookie: manager.cookie, body: { ...taskInput, stepId: "inconnue" },
  }), 400, "reject unknown stage");
  const stageTaskPath = `${stagePath}/tasks/${stageTask.id}`;
  await expectStatus(await request(stageTaskPath, {
    method: "PATCH", cookie: technician.cookie, body: { stepId: "etudes", revision: 0 },
  }), 400, "technician cannot change task stage");
  const { task: doneStageTask } = await json<{ task: ProjectTask }>(await request(stageTaskPath, {
    method: "PATCH", cookie: technician.cookie, body: { status: "done", revision: 0 },
  }), 200, "technician progress preserves task stage");
  assert.equal(doneStageTask.stepId, "chiffrage");
  const removeCosting = { revision: stageProject.revision, action: { type: "edit", details: { ...stageDetails, withBdp: false } } };
  await expectStatus(await request(stagePath, {
    method: "PATCH", cookie: manager.cookie, body: removeCosting,
  }), 409, "cannot remove stage containing even completed tasks");
  const { task: movedTask } = await json<{ task: ProjectTask }>(await request(stageTaskPath, {
    method: "PATCH", cookie: manager.cookie, body: { stepId: "etudes", revision: doneStageTask.revision },
  }), 200, "manager moves task to another stage");
  assert.equal(movedTask.stepId, "etudes");
  assert.equal(movedTask.projectId, stageProject.id);
  await expectStatus(await request(stageTaskPath, {
    method: "PATCH", cookie: manager.cookie, body: { stepId: null, revision: doneStageTask.revision },
  }), 409, "stale stage update rejected");
  const { task: generalTask } = await json<{ task: ProjectTask }>(await request(stageTaskPath, {
    method: "PATCH", cookie: manager.cookie, body: { stepId: null, revision: movedTask.revision },
  }), 200, "manager makes task general again");
  assert.equal(generalTask.stepId, null);
  const { project: withoutCosting } = await json<{ project: CivilProject }>(await request(stagePath, {
    method: "PATCH", cookie: manager.cookie, body: removeCosting,
  }), 200, "optional stage can be removed after reassigning tasks");
  assert.deepEqual(withoutCosting.completedSteps, [], "Completing a task does not validate a workflow stage");
  await expectStatus(await request(stageTaskPath, {
    method: "PATCH", cookie: manager.cookie, body: { stepId: "chiffrage", revision: generalTask.revision },
  }), 400, "cannot move task to removed stage");
  await db.query("UPDATE project_tasks SET data=data-'stepId' WHERE id=$1", [stageTask.id]);
  const { tasks: legacyTasks } = await json<{ tasks: ProjectTask[] }>(await request(`${stagePath}/tasks`, {
    cookie: technician.cookie,
  }), 200, "legacy task without step remains accessible");
  assert.equal(legacyTasks[0].stepId, null);
  assert.equal(legacyTasks[0].projectId, stageProject.id);

  for (const path of ["/api/plans/generate", "/api/cps/generate", "/api/rapports/chat"]) {
    await expectStatus(await request(path, { method: "POST", cookie: technician.cookie, body: {} }), 403, `technician denied AI ${path}`);
    await expectStatus(await request(path, { method: "POST", cookie: pro.cookie, body: {} }), [400, 422], `Pro reaches AI input validation ${path}`);
  }

  await expectStatus(await request(`/api/team/members/${technician.user.id}`, {
    method: "PATCH", cookie: adminCookie, body: { active: false },
  }), 200, "administrator deactivates technician");
  await expectStatus(await request("/api/projects", { cookie: technician.cookie }), [401, 403], "existing session loses access immediately");
  await expectStatus(await request("/api/auth/sign-in/email", {
    method: "POST", body: { email: technician.user.email, password },
  }), [401, 403], "inactive member cannot start a new session");
  const persisted = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'");
  assert.ok(persisted.rows[0].count > 0, "Migrations created PostgreSQL tables");
  console.log(`Team integration passed (${checks} HTTP checks): authentication, four roles, assignments, task stages, documents, conflicts, CSRF, AI and deactivation.`);
  if (process.env.TEAM_TEST_HOLD === "1") {
    console.log(`Local test application ready at ${origin} (test process ${process.pid}). Send SIGTERM to finish.`);
    await new Promise<void>(resolve => { process.once("SIGTERM", resolve); process.once("SIGINT", resolve); });
  }
} catch (error) {
  console.error(appLog);
  throw error;
} finally {
  await stopProcess(app);
  await socket.stop();
  await db.close();
}
