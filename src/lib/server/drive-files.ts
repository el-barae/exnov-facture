import "server-only";

import { createPrivateKey, sign } from "node:crypto";
import { MAX_PROJECT_FILE_SIZE } from "../projects";
import { RequestError } from "./request";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
// The dedicated service account must access an existing administrator-owned folder.
// No user picker or domain-wide delegation is used in this integration.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const driveIdPattern = /^[a-zA-Z0-9_-]{1,200}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

type DriveConfiguration = { email: string; privateKey: string; folderId: string };
type DriveWriteInput = { id: string; name: string; mime: string; projectId: string; bytes: Buffer };
type DriveFile = {
  id?: string; mimeType?: string; driveId?: string; parents?: string[]; trashed?: boolean;
  size?: string; capabilities?: { canAddChildren?: boolean };
  appProperties?: { exnovDocumentId?: string; exnovProjectId?: string };
};

function configuration(environment = process.env): DriveConfiguration {
  const email = environment.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKey = environment.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() ?? "";
  const folderId = environment.GOOGLE_DRIVE_FOLDER_ID?.trim() ?? "";
  if (!/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/.test(email) || !privateKey || !driveIdPattern.test(folderId)) {
    throw new RequestError("Le Drive partagé n’est pas configuré. Contactez l’administrateur.", 503);
  }
  return { email, privateKey, folderId };
}

export function driveStorageConfigured(): boolean {
  try { configuration(); return true; } catch { return false; }
}

/** Injectable HTTP/time dependencies keep tests isolated from real Google accounts. */
export function createDriveStorage(config: DriveConfiguration, dependencies: { fetch?: typeof fetch; now?: () => number } = {}) {
  const fetcher = dependencies.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = dependencies.now ?? Date.now;
  let cachedToken: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;

  async function send(url: string, options: RequestInit = {}): Promise<Response> {
    try {
      return await fetcher(url, { ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(60_000) });
    } catch {
      throw new RequestError("Google Drive ne répond pas. Réessayez dans quelques instants.", 502);
    }
  }

  async function responseJson<T>(response: Response): Promise<T> {
    try { return await response.json() as T; }
    catch { throw new RequestError("La réponse de Google Drive est invalide.", 502); }
  }

  async function issueToken(): Promise<string> {
    const issuedAt = Math.floor(now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({ iss: config.email, scope: DRIVE_SCOPE, aud: GOOGLE_TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 })).toString("base64url");
    let assertion: string;
    try {
      const key = createPrivateKey(config.privateKey);
      if (key.asymmetricKeyType !== "rsa") throw new Error("INVALID_KEY_TYPE");
      assertion = `${header}.${claims}.${sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), key).toString("base64url")}`;
    } catch {
      throw new RequestError("La clé du compte de service Google est invalide. Contactez l’administrateur.", 503);
    }
    const response = await send(GOOGLE_TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!response.ok) throw new RequestError("L’autorisation Google Drive a échoué. Vérifiez le compte de service.", 502);
    const result = await responseJson<{ access_token?: string; expires_in?: number; token_type?: string }>(response);
    if (typeof result.access_token !== "string" || !result.access_token || typeof result.expires_in !== "number" || result.expires_in <= 0 || result.token_type?.toLowerCase() !== "bearer") {
      throw new RequestError("L’autorisation reçue de Google Drive est invalide.", 502);
    }
    cachedToken = { value: result.access_token, expiresAt: now() + Math.min(result.expires_in, 3600) * 1000 - 60_000 };
    return result.access_token;
  }

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > now()) return cachedToken.value;
    pendingToken ??= issueToken().finally(() => { pendingToken = undefined; });
    return pendingToken;
  }

  async function request(url: string, options: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${await accessToken()}`);
      const response = await send(url, { ...options, headers });
      if (response.status !== 401 || attempt === 1) return response;
      cachedToken = undefined;
      await response.body?.cancel();
    }
    throw new RequestError("L’autorisation Google Drive a expiré.", 502);
  }

  function fileUrl(fileId: string, fields?: string) {
    if (!driveIdPattern.test(fileId)) throw new RequestError("Identifiant de fichier Drive invalide.", 400);
    const url = new URL(`${DRIVE_FILES_URL}/${fileId}`);
    url.searchParams.set("supportsAllDrives", "true");
    if (fields) url.searchParams.set("fields", fields);
    return url;
  }

  async function sharedFolder() {
    const response = await request(fileUrl(config.folderId, "id,mimeType,driveId,trashed,capabilities(canAddChildren)").href);
    if (!response.ok) throw new RequestError("Le dossier Drive est inaccessible au compte de service. Vérifiez son partage.", 502);
    const folder = await responseJson<DriveFile>(response);
    if (folder.id !== config.folderId || folder.mimeType !== FOLDER_MIME || !folder.driveId || folder.trashed) {
      throw new RequestError("Choisissez un dossier situé dans un Drive partagé de l’entreprise.", 503);
    }
    return folder;
  }

  async function managedFile(fileId: string, missingIsSuccess = false): Promise<DriveFile | null> {
    const folder = await sharedFolder();
    const response = await request(fileUrl(fileId, "id,driveId,parents,trashed,appProperties,size").href);
    if (response.status === 404 && missingIsSuccess) return null;
    if (response.status === 404) throw new RequestError("Le document n’est plus disponible dans Google Drive.", 404);
    if (!response.ok) throw new RequestError("Impossible de consulter le document dans Google Drive.", 502);
    const file = await responseJson<DriveFile>(response);
    if (file.trashed && missingIsSuccess) return null;
    if (file.id !== fileId || file.driveId !== folder.driveId || !file.parents?.includes(config.folderId)
      || !uuidPattern.test(file.appProperties?.exnovDocumentId ?? "") || !uuidPattern.test(file.appProperties?.exnovProjectId ?? "")) {
      throw new RequestError("Ce fichier n’appartient pas au dossier de l’application.", 403);
    }
    if (file.trashed) throw new RequestError("Le document a été placé dans la corbeille Google Drive.", 404);
    return file;
  }

  async function trash(fileId: string, checkOwnership = true): Promise<void> {
    if (checkOwnership && !await managedFile(fileId, true)) return;
    const response = await request(fileUrl(fileId).href, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
    });
    if (!response.ok && response.status !== 404) throw new RequestError("Impossible de placer le fichier dans la corbeille Google Drive.", 502);
  }

  async function write(input: DriveWriteInput): Promise<{ fileId: string }> {
    if (!uuidPattern.test(input.id) || !uuidPattern.test(input.projectId) || !input.name.trim() || input.name.length > 255 || !input.bytes.length || input.bytes.length > MAX_PROJECT_FILE_SIZE) {
      throw new RequestError("Les informations du document à transférer sont invalides.", 400);
    }
    const folder = await sharedFolder();
    if (folder.capabilities?.canAddChildren !== true) throw new RequestError("Le compte de service ne peut pas déposer de fichiers dans ce dossier Drive.", 503);
    const generated = await request(`${DRIVE_FILES_URL}/generateIds?count=1&space=drive&type=files`);
    if (!generated.ok) throw new RequestError("Impossible de préparer le fichier Google Drive.", 502);
    const { ids } = await responseJson<{ ids?: string[] }>(generated);
    const fileId = ids?.[0];
    if (!fileId || !driveIdPattern.test(fileId)) throw new RequestError("Google Drive n’a pas fourni un identifiant valide.", 502);
    const mime = /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(input.mime) && !input.mime.startsWith("application/vnd.google-apps.") ? input.mime : "application/octet-stream";
    try {
      const response = await request(`${DRIVE_UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true&fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(input.bytes.length) },
        body: JSON.stringify({ id: fileId, name: input.name, mimeType: mime, parents: [config.folderId], appProperties: { exnovDocumentId: input.id, exnovProjectId: input.projectId } }),
      });
      if (!response.ok) throw new RequestError("Impossible de commencer le transfert vers Google Drive.", 502);
      let location: URL;
      try { location = new URL(response.headers.get("location") ?? ""); }
      catch { throw new RequestError("Google Drive n’a pas fourni une adresse de transfert valide.", 502); }
      if (location.origin !== "https://www.googleapis.com" || location.pathname !== "/upload/drive/v3/files" || location.username || location.password) {
        throw new RequestError("L’adresse de transfert fournie par Google Drive est invalide.", 502);
      }
      const uploaded = await request(location.href, {
        method: "PUT", headers: { "Content-Type": mime, "Content-Length": String(input.bytes.length) }, body: new Uint8Array(input.bytes),
      });
      if (!uploaded.ok) throw new RequestError("Le transfert vers Google Drive a échoué. Recommencez l’enregistrement.", 502);
      if ((await responseJson<{ id?: string }>(uploaded)).id !== fileId) throw new RequestError("Google Drive n’a pas confirmé le fichier attendu.", 502);
      return { fileId };
    } catch (error) {
      // The ID was allocated by Google for this write; failed uploads must not become live documents.
      try { await trash(fileId, false); } catch { /* A process crash or API outage still requires orphan reconciliation. */ }
      throw error;
    }
  }

  async function read(fileId: string): Promise<Buffer> {
    const metadata = await managedFile(fileId);
    const size = Number(metadata?.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PROJECT_FILE_SIZE) throw new RequestError("La taille du fichier Google Drive n’est pas valide.", 502);
    const url = fileUrl(fileId);
    url.searchParams.set("alt", "media");
    const response = await request(url.href);
    if (!response.ok || !response.body) throw new RequestError("Impossible de télécharger le document depuis Google Drive.", 502);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_PROJECT_FILE_SIZE || received > size) {
          await reader.cancel();
          throw new RequestError("Le fichier Google Drive dépasse la taille attendue.", 502);
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError("Le téléchargement Google Drive a été interrompu.", 502);
    } finally { reader.releaseLock(); }
    if (received !== size) throw new RequestError("Le téléchargement Google Drive est incomplet.", 502);
    return Buffer.concat(chunks);
  }

  return { write, read, delete: (fileId: string) => trash(fileId) };
}

let storage: { configuration: DriveConfiguration; client: ReturnType<typeof createDriveStorage> } | undefined;
function getStorage() {
  const config = configuration();
  if (!storage || Object.keys(config).some(key => config[key as keyof DriveConfiguration] !== storage!.configuration[key as keyof DriveConfiguration])) {
    storage = { configuration: config, client: createDriveStorage(config) };
  }
  return storage.client;
}

export function writeDriveFile(input: DriveWriteInput): Promise<{ fileId: string }> { return getStorage().write(input); }
export function readDriveFile(fileId: string): Promise<Buffer> { return getStorage().read(fileId); }
export function deleteDriveFile(fileId: string): Promise<void> { return getStorage().delete(fileId); }
