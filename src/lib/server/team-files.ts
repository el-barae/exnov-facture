import "server-only";
import { createHash } from "node:crypto";
import { driveStorageConfigured, writeDriveFile, readDriveFile } from "./drive-files";
import { queueFileCleanup } from "./team-file-cleanup";
import { z } from "zod";
import type { DatabaseClient as PoolClient } from "./database";
import { transaction } from "./database";
import { RequestError } from "./request";
import { accessibleProject, applyAction, audit, currentActor, writeProject, uuidSchema, visibleProject } from "./team-projects";
import { canManageProjects, TeamPermissionError, type TeamUser } from "../team";
import { documentKindSchema, MAX_PROJECT_FILE_SIZE, projectDocumentSchema, validateProjectFile } from "../projects";
import { isEditableProjectPlan, parseProjectPlanFile } from "../cad/project";

export const uploadMetadataSchema = z.strictObject({
  name: z.string().min(1).max(255), size: z.number().int().positive().max(MAX_PROJECT_FILE_SIZE), mime: z.string().max(200),
  kind: documentKindSchema, expectedRevision: z.number().int().nonnegative().optional(),
  importDocumentId: uuidSchema.optional(), replaceDocumentId: uuidSchema.optional(), expectedDocumentRevision: z.number().int().nonnegative().optional(),
}).refine(value => !value.replaceDocumentId || value.expectedDocumentRevision !== undefined, "La révision du plan est requise.");
export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;
const FINANCIAL_KINDS = new Set(["devis", "facture", "bdp", "bdp-estimatif"]);
function assertDocumentWrite(user: TeamUser, metadata: UploadMetadata) {
  if (!canManageProjects(user) && FINANCIAL_KINDS.has(metadata.kind)) throw new TeamPermissionError("Les documents financiers sont réservés à la direction et aux chefs de projets.");
  if (metadata.replaceDocumentId && !isEditableProjectPlan(metadata)) throw new RequestError("Seuls les plans JSON peuvent être remplacés.", 400);
  if (metadata.importDocumentId && (!canManageProjects(user) || metadata.replaceDocumentId)) throw new TeamPermissionError("Cet import est réservé à la gestion de projets.");
  try { validateProjectFile(metadata); }
  catch (error) { throw new RequestError(error instanceof Error ? error.message : "Fichier invalide.",400); }
}
async function attachBytes(client: PoolClient, user: TeamUser, projectId: string, metadata: UploadMetadata, bytes: Buffer, createdFiles: string[]) {
  assertDocumentWrite(user, metadata);
  if (bytes.length !== metadata.size) throw new RequestError("Le transfert du fichier est incomplet.", 400);
  const project = await accessibleProject(client, user, projectId, true);
  if (metadata.expectedRevision !== undefined && metadata.expectedRevision !== project.revision) throw new RequestError("Le projet a changé. Actualisez le dossier avant de réessayer.", 409);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (metadata.importDocumentId) {
    const imported = await client.query("SELECT snapshot FROM project_imports WHERE project_id=$1 AND completed=false", [projectId]);
    const source = imported.rows[0]?.snapshot as { documents?: { id:string;name:string;size:number;kind:string }[] } | undefined;
    const expected = source?.documents?.find(doc => doc.id === metadata.importDocumentId);
    if (!expected || expected.name !== metadata.name || expected.size !== metadata.size || expected.kind !== metadata.kind) throw new RequestError("Ce fichier ne correspond pas au dossier en cours d’import.",400);
    const existing = await client.query("SELECT project_id,sha256 FROM project_files WHERE id=$1", [metadata.importDocumentId]);
    if (existing.rows[0]) {
      if (existing.rows[0].project_id === projectId && existing.rows[0].sha256 === checksum) return visibleProject(user,project);
      throw new RequestError("Ce document existe déjà avec un autre contenu.",409);
    }
  }
  let oldFileId: string | undefined;
  if (isEditableProjectPlan(metadata)) {
    try { await parseProjectPlanFile(new Blob([new Uint8Array(bytes)], { type: metadata.mime })); }
    catch (error) { throw new RequestError(error instanceof Error ? error.message : "Plan invalide.", 400); }
  }
  if (metadata.replaceDocumentId) {
    const original = project.documents.find(doc => doc.id === metadata.replaceDocumentId);
    if (!original || !isEditableProjectPlan(original)) throw new RequestError("Plan introuvable.", 404);
    const existing = await client.query("SELECT uploaded_by,drive_file_id FROM project_files WHERE id=$1 AND project_id=$2", [original.id, projectId]);
    if (!existing.rowCount) throw new RequestError("Fichier introuvable.", 404);
    oldFileId = existing.rows[0].drive_file_id;
    if (!canManageProjects(user) && existing.rows[0].uploaded_by !== user.id) throw new TeamPermissionError("Enregistrez une nouvelle copie pour proposer une modification du plan d’un autre collaborateur.");
    if ((original.revision ?? 0) !== metadata.expectedDocumentRevision) throw new RequestError("Ce plan a changé. Rechargez sa dernière version avant de réessayer.", 409);
  }
  const document = projectDocumentSchema.parse({ id: metadata.replaceDocumentId ?? metadata.importDocumentId ?? crypto.randomUUID(), kind: metadata.kind, name: metadata.name, size: metadata.size, mime: metadata.mime, uploadedAt: new Date().toISOString(), revision: 0 });
  const next = applyAction(project, metadata.replaceDocumentId ? { type: "replacePlan", document, expectedDocumentRevision: metadata.expectedDocumentRevision! } : { type: "attach", document });
  const stored = await writeDriveFile({ id: document.id, name: document.name, mime: document.mime, projectId, bytes });
  createdFiles.push(stored.fileId);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,78124914))", [stored.fileId]);
  if (metadata.replaceDocumentId) await client.query("UPDATE project_files SET drive_file_id=$3,sha256=$4 WHERE id=$1 AND project_id=$2", [document.id, projectId, stored.fileId, checksum]);
  else await client.query("INSERT INTO project_files(id,project_id,uploaded_by,drive_file_id,sha256) VALUES($1,$2,$3,$4,$5)", [document.id, projectId, user.id, stored.fileId, checksum]);
  if (oldFileId) await client.query("INSERT INTO drive_file_cleanup(file_id) VALUES($1) ON CONFLICT DO NOTHING", [oldFileId]);
  await writeProject(client, next);
  await audit(client, user, projectId, metadata.replaceDocumentId ? "document.updated" : "document.created", { documentId: document.id, name: document.name });
  return visibleProject(user, next);
}
export async function beginUpload(actor: TeamUser, projectId: string, input: unknown) {
  const metadata = uploadMetadataSchema.parse(input);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    await accessibleProject(client, user, projectId);
    assertDocumentWrite(user, metadata);
    if (!driveStorageConfigured()) throw new RequestError("Le stockage Google Drive doit être configuré par l’administrateur.",503);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 78124913))", [user.id]);
    await client.query("DELETE FROM project_uploads WHERE expires_at < now()");
    const active = await client.query("SELECT id FROM project_uploads WHERE user_id=$1", [user.id]);
    if (active.rowCount! >= 5) throw new RequestError("Terminez ou annulez vos transferts en cours avant d’en ajouter un autre.", 429);
    const id = crypto.randomUUID();
    await client.query("INSERT INTO project_uploads(id,project_id,user_id,metadata) VALUES($1,$2,$3,$4)", [id, projectId, user.id, JSON.stringify(metadata)]);
    return { id, chunkSize: 1024 * 1024 };
  });
}
export async function appendUpload(actor: TeamUser, projectId: string, uploadId: string, offset: number, bytes: Buffer) {
  uuidSchema.parse(uploadId);
  if (!Number.isSafeInteger(offset) || offset < 0 || bytes.length < 1 || bytes.length > 1024 * 1024) throw new RequestError("Bloc de transfert invalide.", 400);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    await accessibleProject(client, user, projectId);
    const result = await client.query("SELECT metadata,octet_length(bytes) AS received FROM project_uploads WHERE id=$1 AND project_id=$2 AND user_id=$3 AND expires_at>now() FOR UPDATE", [uploadId, projectId, user.id]);
    if (!result.rows[0]) throw new RequestError("Transfert introuvable ou expiré.", 404);
    const metadata = uploadMetadataSchema.parse(result.rows[0].metadata);
    const received: number = result.rows[0].received;
    if (received !== offset) throw new RequestError("Le transfert a changé. Recommencez l’enregistrement.", 409);
    if (offset + bytes.length > metadata.size) throw new RequestError("Le fichier dépasse la taille annoncée.", 413);
    await client.query("UPDATE project_uploads SET bytes=bytes || $2::bytea WHERE id=$1", [uploadId, bytes]);
    return { received: offset + bytes.length };
  });
}
export async function finishUpload(actor: TeamUser, projectId: string, uploadId: string) {
  uuidSchema.parse(uploadId);
  const createdFiles: string[] = [];
  try {
  const saved = await transaction(async client => {
    const user = await currentActor(client, actor);
    const result = await client.query("SELECT metadata,bytes FROM project_uploads WHERE id=$1 AND project_id=$2 AND user_id=$3 AND expires_at>now() FOR UPDATE", [uploadId, projectId, user.id]);
    if (!result.rows[0]) throw new RequestError("Transfert introuvable ou expiré.", 404);
    const project = await attachBytes(client, user, projectId, uploadMetadataSchema.parse(result.rows[0].metadata), result.rows[0].bytes, createdFiles);
    await client.query("DELETE FROM project_uploads WHERE id=$1", [uploadId]);
    return project;
  });
  return saved;
  } catch (error) {
    // Une erreur de commit ne doit pas perdre la trace des fichiers déjà créés.
    await queueFileCleanup(createdFiles);
    throw error;
  }
}
export async function cancelUpload(actor: TeamUser, projectId: string, uploadId: string) {
  uuidSchema.parse(projectId); uuidSchema.parse(uploadId);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    await client.query("DELETE FROM project_uploads WHERE id=$1 AND project_id=$2 AND user_id=$3", [uploadId, projectId, user.id]);
  });
}
export async function readTeamFile(actor: TeamUser, projectId: string, documentId: string) {
  uuidSchema.parse(documentId);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    const project = await accessibleProject(client, user, projectId);
    const document = project.documents.find(doc => doc.id === documentId);
    if (!document) throw new RequestError("Document introuvable.", 404);
    if (!canManageProjects(user) && FINANCIAL_KINDS.has(document.kind)) throw new TeamPermissionError();
    const result = await client.query("SELECT drive_file_id FROM project_files WHERE id=$1 AND project_id=$2", [documentId, projectId]);
    if (!result.rows[0]) throw new RequestError("Fichier introuvable.", 404);
    return { document, project: visibleProject(user, project), bytes: await readDriveFile(result.rows[0].drive_file_id) };
  });
}
