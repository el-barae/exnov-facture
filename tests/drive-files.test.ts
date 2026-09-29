import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { createDriveStorage, driveStorageConfigured } from "../src/lib/server/drive-files";
import { RequestError } from "../src/lib/server/request";
import { MAX_PROJECT_FILE_SIZE } from "../src/lib/projects";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  email: "facturo@unit-tests.iam.gserviceaccount.com",
  privateKey: keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  folderId: "shared-folder",
};
const documentInput = {
  id: "87a33cf4-79cf-42d2-8aef-a2c02c72216a",
  projectId: "ea7b40e7-7078-4177-95b6-30d151a59f4b",
  name: "Rapport étude.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-test-content"),
};
type FakeFile = { id: string; name: string; mimeType: string; parents: string[]; appProperties: Record<string, string>; driveId: string; size: string; trashed: boolean; bytes: Uint8Array };

function fakeGoogle(options: { personalFolder?: boolean; readOnly?: boolean; evilLocation?: boolean; failUpload?: boolean; unauthorizedOnce?: boolean } = {}) {
  const files = new Map<string, FakeFile>();
  const assertions: string[] = [];
  const calls: { url: URL; options: RequestInit }[] = [];
  let counter = 0;
  let unauthorized = options.unauthorizedOnce ?? false;
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options: init });
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal);
    if (url.href === "https://oauth2.googleapis.com/token") {
      const form = new URLSearchParams(init.body as URLSearchParams);
      assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      assertions.push(form.get("assertion")!);
      return Response.json({ access_token: `test-token-${assertions.length}`, expires_in: 3600, token_type: "Bearer" });
    }
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.match(new Headers(init.headers).get("authorization")!, /^Bearer test-token-/);
    if (unauthorized) { unauthorized = false; return new Response(null, { status: 401 }); }
    if (url.pathname === `/drive/v3/files/${config.folderId}`) return Response.json({
      id: config.folderId, mimeType: "application/vnd.google-apps.folder", trashed: false,
      ...(options.personalFolder ? {} : { driveId: "shared-drive" }), capabilities: { canAddChildren: !options.readOnly },
    });
    if (url.pathname === "/drive/v3/files/generateIds") return Response.json({ ids: [`drive-file-${++counter}`] });
    if (url.pathname === "/upload/drive/v3/files" && init.method === "POST") {
      assert.equal(url.searchParams.get("supportsAllDrives"), "true");
      const metadata = JSON.parse(init.body as string);
      files.set(metadata.id, { ...metadata, driveId: "shared-drive", trashed: false, size: "0", bytes: new Uint8Array() });
      return new Response(null, { headers: { Location: options.evilLocation ? "https://attacker.example/upload" : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${metadata.id}` } });
    }
    if (url.pathname === "/upload/drive/v3/files" && init.method === "PUT") {
      if (options.failUpload) return new Response("sensitive-provider-details", { status: 500 });
      const file = files.get(url.searchParams.get("upload_id")!)!;
      file.bytes = init.body as Uint8Array;
      file.size = String(file.bytes.byteLength);
      assert.equal(new Headers(init.headers).get("content-length"), file.size);
      return Response.json({ id: file.id });
    }
    const fileId = url.pathname.split("/").at(-1)!;
    const file = files.get(fileId);
    if (!file) return new Response(null, { status: 404 });
    assert.equal(url.searchParams.get("supportsAllDrives"), "true");
    if (init.method === "PATCH") {
      assert.deepEqual(JSON.parse(init.body as string), { trashed: true });
      file.trashed = true;
      return Response.json({ id: file.id, trashed: true });
    }
    if (url.searchParams.get("alt") === "media") return new Response(new Uint8Array(file.bytes));
    return Response.json({ ...file, bytes: undefined });
  };
  return { fetcher, calls, assertions, files };
}

test("Drive signe le JWT RS256, réutilise le jeton et transfère un document privé dans le dossier partagé", async () => {
  const google = fakeGoogle();
  const now = 1_800_000_000_000;
  const drive = createDriveStorage(config, { fetch: google.fetcher, now: () => now });
  const result = await drive.write(documentInput);
  assert.deepEqual(await drive.read(result.fileId), documentInput.bytes);
  const stored = google.files.get(result.fileId)!;
  assert.deepEqual(stored.parents, [config.folderId]);
  assert.deepEqual(stored.appProperties, { exnovDocumentId: documentInput.id, exnovProjectId: documentInput.projectId });
  assert.equal(stored.mimeType, "application/pdf");
  assert.equal(google.assertions.length, 1);
  const [header, claims, signature] = google.assertions[0].split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url").toString()), {
    iss: config.email, aud: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/drive",
    iat: now / 1000, exp: now / 1000 + 3600,
  });
  assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), keys.publicKey, Buffer.from(signature, "base64url")), true);
  assert.equal(google.calls.some(call => call.url.pathname.includes("permissions")), false);
});

test("Drive refuse un dossier personnel ou non modifiable avant de créer un fichier", async () => {
  for (const option of [{ personalFolder: true }, { readOnly: true }]) {
    const google = fakeGoogle(option);
    const drive = createDriveStorage(config, { fetch: google.fetcher });
    await assert.rejects(drive.write(documentInput), error => error instanceof RequestError && error.status === 503);
    assert.equal(google.files.size, 0);
  }
});

test("Une adresse de transfert externe est refusée et le fichier préparé est mis à la corbeille", async () => {
  const google = fakeGoogle({ evilLocation: true });
  const drive = createDriveStorage(config, { fetch: google.fetcher });
  await assert.rejects(drive.write(documentInput), /adresse de transfert/i);
  assert.equal(google.files.get("drive-file-1")!.trashed, true);
  assert.equal(google.calls.some(call => call.url.origin === "https://attacker.example"), false);
});

test("Un échec Google nettoie le fichier sans exposer la réponse du fournisseur", async () => {
  const google = fakeGoogle({ failUpload: true });
  const drive = createDriveStorage(config, { fetch: google.fetcher });
  await assert.rejects(drive.write(documentInput), error => error instanceof RequestError && error.status === 502 && !error.message.includes("sensitive-provider-details"));
  assert.equal(google.files.get("drive-file-1")!.trashed, true);
});

test("Les fichiers déplacés ou étrangers à l’application ne sont ni lus ni supprimés", async () => {
  const google = fakeGoogle();
  const drive = createDriveStorage(config, { fetch: google.fetcher });
  const { fileId } = await drive.write(documentInput);
  google.files.get(fileId)!.parents = ["other-folder"];
  await assert.rejects(drive.read(fileId), error => error instanceof RequestError && error.status === 403);
  await assert.rejects(drive.delete(fileId), error => error instanceof RequestError && error.status === 403);
  google.files.get(fileId)!.parents = [config.folderId];
  google.files.get(fileId)!.appProperties = {};
  await assert.rejects(drive.delete(fileId), error => error instanceof RequestError && error.status === 403);
  assert.equal(google.files.get(fileId)!.trashed, false);
});

test("La suppression utilise la corbeille et tolère un fichier déjà supprimé", async () => {
  const google = fakeGoogle();
  const drive = createDriveStorage(config, { fetch: google.fetcher });
  const { fileId } = await drive.write(documentInput);
  await drive.delete(fileId);
  await drive.delete(fileId);
  await drive.delete("already-missing");
  assert.equal(google.files.get(fileId)!.trashed, true);
  await assert.rejects(drive.read(fileId), error => error instanceof RequestError && error.status === 404);
  assert.equal(google.calls.some(call => call.options.method === "DELETE"), false);
});

test("Les tailles annoncées sont bornées et le téléchargement incomplet est détecté", async () => {
  const google = fakeGoogle();
  const drive = createDriveStorage(config, { fetch: google.fetcher });
  await assert.rejects(drive.write({ ...documentInput, bytes: Buffer.alloc(MAX_PROJECT_FILE_SIZE + 1) }), error => error instanceof RequestError && error.status === 400);
  assert.equal(google.calls.length, 0);
  const { fileId } = await drive.write(documentInput);
  google.files.get(fileId)!.size = String(documentInput.bytes.length + 1);
  await assert.rejects(drive.read(fileId), /incomplet/);
  google.files.get(fileId)!.size = String(documentInput.bytes.length - 1);
  await assert.rejects(drive.read(fileId), /dépasse la taille attendue/);
  google.files.get(fileId)!.size = String(MAX_PROJECT_FILE_SIZE + 1);
  await assert.rejects(drive.read(fileId), /taille.*pas valide/);
});

test("Les jetons expirés ou refusés sont renouvelés et la configuration absente reste bloquante", async () => {
  let now = 1_800_000_000_000;
  const google = fakeGoogle({ unauthorizedOnce: true });
  const drive = createDriveStorage(config, { fetch: google.fetcher, now: () => now });
  const { fileId } = await drive.write(documentInput);
  assert.equal(google.assertions.length, 2);
  now += 3_600_000;
  await drive.read(fileId);
  assert.equal(google.assertions.length, 3);
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  try {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    assert.equal(driveStorageConfigured(), false);
  } finally {
    if (key === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = key;
  }
});
