/** Test preload only: implements the Drive HTTP protocol without external requests. */
import { createPublicKey, randomUUID, verify } from "node:crypto";

if (process.env.EXNOV_DRIVE_TEST_MOCK !== "true") {
  throw new Error("Drive test preload requires EXNOV_DRIVE_TEST_MOCK=true.");
}
const testEmail = "test-service@facturo-test.iam.gserviceaccount.com";
const folderId = "test_shared_drive_folder_0001";
if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL !== testEmail || process.env.GOOGLE_DRIVE_FOLDER_ID !== folderId) {
  throw new Error("Drive mock accepts only isolated test credentials.");
}
const publicKey = createPublicKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
const realFetch = globalThis.fetch;
const files = new Map();
const allocations = new Set();
const sessions = new Map();
const token = "local-drive-test-access-token";
const sharedDriveId = "shared_drive_test_0001";
const fail = (message, status = 400) => Response.json({ error: { message } }, { status });

function metadata(file) {
  return { ...file.metadata, driveId: sharedDriveId, size: String(file.bytes.length), trashed: file.trashed };
}

async function googleRequest(request, url) {
  if (url.origin === "https://oauth2.googleapis.com" && url.pathname === "/token" && request.method === "POST") {
    const params = new URLSearchParams(await request.text());
    if (params.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer") return fail("Invalid JWT grant.");
    const parts = (params.get("assertion") ?? "").split(".");
    if (parts.length !== 3) return fail("Invalid JWT assertion.");
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || claims.iss !== testEmail || claims.aud !== url.href
      || !String(claims.scope).split(" ").includes("https://www.googleapis.com/auth/drive")
      || claims.exp <= now || claims.exp - claims.iat > 3600
      || !verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], "base64url"))) {
      return fail("Invalid service account assertion.", 401);
    }
    return Response.json({ access_token: token, token_type: "Bearer", expires_in: 3600 });
  }
  if (url.origin !== "https://www.googleapis.com") throw new Error(`Unimplemented Google test request: ${request.method} ${url.pathname}`);
  if (request.headers.get("authorization") !== `Bearer ${token}`) return fail("Invalid access token.", 401);
  if (url.pathname === "/drive/v3/files/generateIds" && request.method === "GET") {
    const id = `test_drive_file_${randomUUID().replaceAll("-", "")}`;
    allocations.add(id);
    return Response.json({ ids: [id] });
  }
  if (url.pathname === "/upload/drive/v3/files" && request.method === "POST" && url.searchParams.get("uploadType") === "resumable") {
    const value = await request.json();
    if (!allocations.has(value.id) || value.parents?.length !== 1 || value.parents[0] !== folderId) return fail("Invalid preallocated file or parent.");
    if (!value.appProperties?.exnovProjectId || !value.appProperties?.exnovDocumentId) return fail("Missing project scope.");
    sessions.set(value.id, value);
    return Response.json({}, { headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${value.id}` } });
  }
  if (url.pathname === "/upload/drive/v3/files" && request.method === "PUT") {
    const id = url.searchParams.get("upload_id");
    const value = sessions.get(id);
    if (!value) return fail("Unknown upload session.", 404);
    const bytes = new Uint8Array(await request.arrayBuffer());
    files.set(id, { metadata: value, bytes, trashed: false });
    sessions.delete(id);
    return Response.json({ id });
  }
  const match = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (id === folderId && request.method === "GET") {
      return Response.json({ id, driveId: sharedDriveId, mimeType: "application/vnd.google-apps.folder", trashed: false, capabilities: { canAddChildren: true } });
    }
    const file = files.get(id);
    if (!file) return fail("File not found.", 404);
    if (request.method === "GET" && url.searchParams.get("alt") === "media") {
      if (file.trashed) return fail("File is trashed.", 404);
      return new Response(new Uint8Array(file.bytes), { headers: { "content-type": file.metadata.mimeType } });
    }
    if (request.method === "GET") return Response.json(metadata(file));
    if (request.method === "PATCH" && (await request.json()).trashed === true) {
      file.trashed = true;
      return Response.json(metadata(file));
    }
  }
  throw new Error(`Unimplemented Google test request: ${request.method} ${url.pathname}`);
}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!url.hostname.endsWith("googleapis.com")) return realFetch(input, init);
  return googleRequest(new Request(input, init), url);
};
