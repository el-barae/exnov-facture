import { createProjectPlanFile, isEditableProjectPlan, loadedProjectPlan, parseProjectPlanFile, type LoadedProjectPlan, type ProjectPlanSource } from "./cad/project";
import type { CadPlan } from "./cad/types";
import { parsePlan } from "./cad/validation";
import { applyProjectAction, createProject, projectDocumentSchema, projectSchema, validateProjectFile, type CivilProject, type DocumentKind, type ProjectAction, type ProjectDetails } from "./projects";

const DATABASE = "exnov.projets.v1";
export const PROJECTS_CHANGED_EVENT = "exnov:projects-changed";
let databasePromise: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") { reject(new Error("Le stockage des projets est indisponible dans ce navigateur.")); return; }
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("projects", { keyPath: "id" });
        const files = request.result.createObjectStore("files", { keyPath: "id" });
        files.createIndex("projectId", "projectId");
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(new Error("Impossible d’ouvrir le stockage des projets. Vérifiez les autorisations du navigateur."));
      request.onblocked = () => reject(new Error("Fermez les autres onglets EXNOV puis réessayez pour ouvrir les projets."));
    }).catch(error => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}

function storageError(error: DOMException | null) {
  return error?.name === "QuotaExceededError"
    ? new Error("Le stockage du navigateur est plein. Libérez de l’espace puis réessayez. Aucune modification n’a été enregistrée.")
    : new Error("L’enregistrement a échoué. Vérifiez le stockage du navigateur puis réessayez.");
}
function announceChange() {
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(DATABASE);
    channel.postMessage("changed");
    channel.close();
  }
}
export function subscribeToProjectChanges(refresh: () => void) {
  window.addEventListener(PROJECTS_CHANGED_EVENT, refresh);
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DATABASE) : undefined;
  if (channel) channel.onmessage = refresh;
  return () => { window.removeEventListener(PROJECTS_CHANGED_EVENT, refresh); channel?.close(); };
}

export async function loadProjects(): Promise<CivilProject[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("projects", "readonly").objectStore("projects").getAll();
    request.onsuccess = () => {
      try { resolve(request.result.map(value => projectSchema.parse(value)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); }
      catch { reject(new Error("Un dossier enregistré est illisible. Les données existantes ont été conservées.")); }
    };
    request.onerror = () => reject(new Error("Impossible de charger les projets enregistrés."));
  });
}

export async function storeNewProject(details: ProjectDetails): Promise<CivilProject> {
  const project = createProject(details);
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("projects", "readwrite");
    transaction.objectStore("projects").add(project);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(storageError(transaction.error));
  });
  announceChange();
  return project;
}

export async function updateStoredProject(expected: CivilProject, action: ProjectAction, file?: File): Promise<CivilProject> {
  return updateProjectRecord(expected.id, action, file, expected.revision);
}

async function updateProjectRecord(projectId: string, action: ProjectAction, file?: File, expectedRevision?: number): Promise<CivilProject> {
  if (action.type === "attach" || action.type === "replacePlan") {
    if (!file) throw new Error("Le fichier doit être fourni pour enregistrer le document.");
    validateProjectFile(file);
    if (action.document.size !== file.size || action.document.name !== file.name) throw new Error("Le fichier ne correspond pas au document.");
    if (isEditableProjectPlan(action.document)) await parseProjectPlanFile(file);
  }
  const db = await database();
  const project = await new Promise<CivilProject>((resolve, reject) => {
    const transaction = db.transaction(["projects", "files"], "readwrite");
    let result: CivilProject;
    let failure: Error | undefined;
    const projects = transaction.objectStore("projects");
    const files = transaction.objectStore("files");
    const request = projects.get(projectId);
    const abort = (error: unknown) => {
      failure = error instanceof DOMException && error.name === "QuotaExceededError" ? storageError(error) : error instanceof Error ? error : new Error("Impossible de modifier le projet.");
      transaction.abort();
    };
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error("Ce projet n’existe plus. Choisissez un autre dossier.");
        const current = projectSchema.parse(request.result);
        if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new Error("Ce projet a changé dans un autre onglet. Le dossier a été actualisé ; réessayez votre action.");
        result = applyProjectAction(current, action);
        // Le fichier et sa référence sont enregistrés dans la même transaction.
        if (action.type === "replacePlan") {
          const existingFile = files.get(action.document.id);
          existingFile.onsuccess = () => {
            try {
              const record = existingFile.result;
              if (!record || record.projectId !== current.id || !(record.blob instanceof Blob)) {
                throw new Error("Le fichier du plan est introuvable dans ce projet. Aucune modification n’a été enregistrée.");
              }
              files.put({ id: action.document.id, projectId: current.id, blob: file });
              projects.put(result);
            } catch (error) { abort(error); }
          };
        } else {
          if (action.type === "attach") files.add({ id: action.document.id, projectId: current.id, blob: file });
          if (action.type === "removeDocument") files.delete(action.documentId);
          projects.put(result);
        }
      } catch (error) { abort(error); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(failure || storageError(transaction.error));
  });
  announceChange();
  return project;
}

export function attachProjectFile(project: CivilProject, kind: DocumentKind, file: File) {
  validateProjectFile(file);
  const document = projectDocumentSchema.parse({ id: crypto.randomUUID(), kind, name: file.name, size: file.size, mime: file.type, uploadedAt: new Date().toISOString() });
  return updateStoredProject(project, { type: "attach", document }, file);
}

export async function getProjectFile(projectId: string, documentId: string): Promise<Blob> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("files", "readonly").objectStore("files").get(documentId);
    request.onsuccess = () => {
      const record = request.result;
      if (!record || record.projectId !== projectId || !(record.blob instanceof Blob)) {
        reject(new Error("Le fichier est introuvable dans ce navigateur."));
      } else resolve(record.blob);
    };
    request.onerror = () => reject(new Error("Impossible de récupérer ce document."));
  });
}

/** Ajout atomique à la dernière révision, sans écraser les modifications concurrentes. */
export function attachGeneratedProjectFile(projectId: string, kind: DocumentKind, file: File) {
  validateProjectFile(file);
  const document = projectDocumentSchema.parse({ id: crypto.randomUUID(), kind, name: file.name, size: file.size, mime: file.type, uploadedAt: new Date().toISOString() });
  return updateProjectRecord(projectId, { type: "attach", document }, file);
}

/** Reads metadata and file from one IndexedDB snapshot before parsing the JSON. */
export async function loadProjectPlan(projectId: string, documentId: string): Promise<LoadedProjectPlan> {
  const db = await database();
  const snapshot = await new Promise<{ project: CivilProject; blob: Blob }>((resolve, reject) => {
    const transaction = db.transaction(["projects", "files"], "readonly");
    const projectRequest = transaction.objectStore("projects").get(projectId);
    const fileRequest = transaction.objectStore("files").get(documentId);
    transaction.oncomplete = () => {
      try {
        if (!projectRequest.result) throw new Error("Ce projet n’existe plus. Choisissez un autre dossier.");
        const project = projectSchema.parse(projectRequest.result);
        const document = project.documents.find(value => value.id === documentId);
        if (!document) throw new Error("Ce plan n’existe plus dans ce projet.");
        if (!isEditableProjectPlan(document)) throw new Error("Seuls les plans JSON peuvent être modifiés dans Plans 2D.");
        const record = fileRequest.result;
        if (!record || record.projectId !== project.id || !(record.blob instanceof Blob)) {
          throw new Error("Le fichier du plan est introuvable dans ce projet.");
        }
        if (record.blob.size !== document.size) throw new Error("Le fichier du plan ne correspond pas au document enregistré.");
        resolve({ project, blob: record.blob });
      } catch (error) { reject(error); }
    };
    transaction.onabort = () => reject(new Error("Impossible de charger le plan du projet."));
  });
  const plan = await parseProjectPlanFile(snapshot.blob);
  return loadedProjectPlan(snapshot.project, snapshot.project.documents.find(document => document.id === documentId)!, plan);
}

/** Replaces exactly the opened document revision, retaining the latest other project changes. */
export async function saveProjectPlan(source: ProjectPlanSource, plan: CadPlan): Promise<LoadedProjectPlan> {
  const valid = parsePlan({ ...plan, id: source.planId });
  const file = createProjectPlanFile(valid, source.fileName);
  const document = projectDocumentSchema.parse({
    id: source.documentId, kind: "plans", name: file.name, size: file.size,
    mime: file.type, uploadedAt: new Date().toISOString(),
  });
  const project = await updateProjectRecord(source.projectId, {
    type: "replacePlan", document, expectedDocumentRevision: source.revision,
  }, file);
  return loadedProjectPlan(project, project.documents.find(value => value.id === source.documentId)!, valid);
}

/** Adds a modifiable JSON plan to the latest project revision without replacing another file. */
export async function createProjectPlan(projectId: string, plan: CadPlan): Promise<LoadedProjectPlan> {
  const valid = parsePlan(plan);
  const file = createProjectPlanFile(valid);
  const document = projectDocumentSchema.parse({
    id: crypto.randomUUID(), kind: "plans", name: file.name, size: file.size,
    mime: file.type, uploadedAt: new Date().toISOString(), revision: 0,
  });
  const project = await updateProjectRecord(projectId, { type: "attach", document }, file);
  return loadedProjectPlan(project, project.documents.find(value => value.id === document.id)!, valid);
}
