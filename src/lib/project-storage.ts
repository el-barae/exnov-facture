import * as local from "./project-storage-local";
import { configureWorkspaceStorage } from "./client-storage";
import { createProjectPlanFile, isEditableProjectPlan, parseProjectPlanFile, loadedProjectPlan, type LoadedProjectPlan, type ProjectPlanSource } from "./cad/project";
import type { CadPlan } from "./cad/types";
import { parsePlan } from "./cad/validation";
import { validateProjectFile, type CivilProject, type DocumentKind, type ProjectAction, type ProjectDetails } from "./projects";

let mode: "team" | "demo" = "team";
export const PROJECTS_CHANGED_EVENT = local.PROJECTS_CHANGED_EVENT;
export function configureProjectStorage(next: "team" | "demo", userId?: string) { mode = next; configureWorkspaceStorage(next, userId); }
export function isTeamStorage() { return mode === "team"; }
async function responseJson<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Impossible de communiquer avec l’espace équipe.");
  return result as T;
}
async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  return responseJson<T>(await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers: data === undefined ? undefined : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) }));
}
function announceChange() { window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT)); }
export function subscribeToProjectChanges(refresh: () => void) {
  if (mode === "demo") return local.subscribeToProjectChanges(refresh);
  const visibleRefresh = () => { if (document.visibilityState === "visible") refresh(); };
  const timer = window.setInterval(visibleRefresh, 15_000);
  window.addEventListener(PROJECTS_CHANGED_EVENT, refresh);
  window.addEventListener("focus", visibleRefresh);
  return () => { clearInterval(timer); window.removeEventListener(PROJECTS_CHANGED_EVENT, refresh); window.removeEventListener("focus", visibleRefresh); };
}
export async function loadProjects(): Promise<CivilProject[]> {
  return mode === "demo" ? local.loadProjects() : (await request<{ projects: CivilProject[] }>("/api/projects")).projects;
}
export async function storeNewProject(details: ProjectDetails): Promise<CivilProject> {
  if (mode === "demo") return local.storeNewProject(details);
  const { project } = await request<{ project: CivilProject }>("/api/projects", "POST", details); announceChange(); return project;
}
export async function updateStoredProject(expected: CivilProject, action: ProjectAction, file?: File): Promise<CivilProject> {
  if (mode === "demo") return local.updateStoredProject(expected, action, file);
  if (action.type === "attach" || action.type === "replacePlan") {
    if (!file) throw new Error("Le fichier est requis.");
    return uploadFile(expected.id, action.document.kind, file, { expectedRevision: expected.revision, ...(action.type === "replacePlan" ? { replaceDocumentId: action.document.id, expectedDocumentRevision: action.expectedDocumentRevision } : {}) });
  }
  const { project } = await request<{ project: CivilProject }>(`/api/projects/${expected.id}`, "PATCH", { revision: expected.revision, action }); announceChange(); return project;
}
type UploadOptions = { expectedRevision?: number; replaceDocumentId?: string; expectedDocumentRevision?: number; importDocumentId?: string };
async function uploadFile(projectId: string, kind: DocumentKind, file: File, options: UploadOptions = {}): Promise<CivilProject> {
  validateProjectFile(file);
  if (isEditableProjectPlan({ kind, name: file.name })) await parseProjectPlanFile(file);
  const base = `/api/projects/${projectId}/uploads`;
  const { upload } = await request<{ upload: { id: string; chunkSize: number } }>(base, "POST", { kind, name: file.name, size: file.size, mime: file.type, ...options });
  const endpoint = `${base}/${upload.id}`;
  try {
    for (let offset = 0; offset < file.size; offset += upload.chunkSize) {
      await responseJson(await fetch(`${endpoint}?offset=${offset}`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/octet-stream" }, body: file.slice(offset, offset + upload.chunkSize) }));
    }
    const { project } = await request<{ project: CivilProject }>(endpoint, "POST"); announceChange(); return project;
  } catch (error) {
    await request(endpoint, "DELETE").catch(() => {});
    throw error;
  }
}
export function attachProjectFile(project: CivilProject, kind: DocumentKind, file: File) {
  return mode === "demo" ? local.attachProjectFile(project, kind, file) : uploadFile(project.id, kind, file, { expectedRevision: project.revision });
}
export function attachGeneratedProjectFile(projectId: string, kind: DocumentKind, file: File) {
  return mode === "demo" ? local.attachGeneratedProjectFile(projectId, kind, file) : uploadFile(projectId, kind, file);
}
export async function getProjectFile(projectId: string, documentId: string): Promise<Blob> {
  if (mode === "demo") return local.getProjectFile(projectId, documentId);
  const response = await fetch(`/api/projects/${projectId}/documents/${documentId}`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) await responseJson(response);
  return response.blob();
}
export async function loadProjectPlan(projectId: string, documentId: string): Promise<LoadedProjectPlan> {
  return mode === "demo" ? local.loadProjectPlan(projectId, documentId) : (await request<{ document: LoadedProjectPlan }>(`/api/projects/${projectId}/documents/${documentId}/plan`)).document;
}
export async function saveProjectPlan(source: ProjectPlanSource, plan: CadPlan): Promise<LoadedProjectPlan> {
  if (mode === "demo") return local.saveProjectPlan(source, plan);
  const valid = parsePlan({ ...plan, id: source.planId });
  const file = createProjectPlanFile(valid, source.fileName);
  const project = await uploadFile(source.projectId, "plans", file, { replaceDocumentId: source.documentId, expectedDocumentRevision: source.revision });
  return loadedProjectPlan(project, project.documents.find(doc => doc.id === source.documentId)!, valid);
}
export async function createProjectPlan(projectId: string, plan: CadPlan): Promise<LoadedProjectPlan> {
  if (mode === "demo") return local.createProjectPlan(projectId, plan);
  const valid = parsePlan(plan);
  const project = await uploadFile(projectId, "plans", createProjectPlanFile(valid));
  return loadedProjectPlan(project, project.documents.at(-1)!, valid);
}

export type LocalProjectImportProgress = {
  phase: "preparing" | "uploading" | "finalizing" | "complete";
  completed: number;
  total: number;
  fileName?: string;
};

/** Read only after the user chooses to look for projects on this browser. */
export function listLocalProjectsForImport(): Promise<CivilProject[]> {
  return local.loadProjects();
}

/** A retry resumes the server copy; the local project and its files remain intact. */
export async function importLocalProject(source: CivilProject, onProgress?: (progress: LocalProjectImportProgress) => void): Promise<CivilProject> {
  if (mode !== "team") throw new Error("Connectez-vous à l’espace équipe pour importer ce dossier.");
  const total = source.documents.length;
  onProgress?.({ phase: "preparing", completed: 0, total });
  const imported = await request<{ project: CivilProject; completed: boolean }>("/api/projects/import", "POST", source);
  if (imported.completed) {
    onProgress?.({ phase: "complete", completed: total, total });
    announceChange();
    return imported.project;
  }
  let project = imported.project;
  const existing = new Set(project.documents.map(document => document.id));
  let completed = source.documents.filter(document => existing.has(document.id)).length;
  for (const document of source.documents) {
    if (existing.has(document.id)) continue;
    onProgress?.({ phase: "uploading", completed, total, fileName: document.name });
    const blob = await local.getProjectFile(source.id, document.id);
    if (blob.size !== document.size) throw new Error(`Le fichier local « ${document.name} » ne correspond plus au dossier. Actualisez la liste avant de réessayer.`);
    const file = new File([blob], document.name, { type: document.mime || blob.type, lastModified: Date.parse(document.uploadedAt) });
    project = await uploadFile(project.id, document.kind, file, { importDocumentId: document.id });
    completed += 1;
    onProgress?.({ phase: "uploading", completed, total, fileName: document.name });
  }
  onProgress?.({ phase: "finalizing", completed, total });
  const result = await request<{ project: CivilProject }>(`/api/projects/import/${encodeURIComponent(source.id)}`, "POST");
  onProgress?.({ phase: "complete", completed: total, total });
  announceChange();
  return result.project;
}
