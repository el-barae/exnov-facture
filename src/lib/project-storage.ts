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
  if (action.type === "attach") {
    if (!file) throw new Error("Le fichier doit être fourni pour enregistrer le document.");
    validateProjectFile(file);
    if (action.document.size !== file.size || action.document.name !== file.name) throw new Error("Le fichier ne correspond pas au document.");
  }
  const db = await database();
  const project = await new Promise<CivilProject>((resolve, reject) => {
    const transaction = db.transaction(["projects", "files"], "readwrite");
    let result: CivilProject;
    let failure: Error | undefined;
    const projects = transaction.objectStore("projects");
    const files = transaction.objectStore("files");
    const request = projects.get(expected.id);
    request.onsuccess = () => {
      try {
        const current = projectSchema.parse(request.result);
        if (current.revision !== expected.revision) throw new Error("Ce projet a changé dans un autre onglet. Le dossier a été actualisé ; réessayez votre action.");
        result = applyProjectAction(current, action);
        // Le fichier et sa référence sont enregistrés dans la même transaction.
        if (action.type === "attach") files.add({ id: action.document.id, projectId: current.id, blob: file });
        if (action.type === "removeDocument") files.delete(action.documentId);
        projects.put(result);
      } catch (error) {
        failure = error instanceof DOMException && error.name === "QuotaExceededError" ? storageError(error) : error instanceof Error ? error : new Error("Impossible de modifier le projet.");
        transaction.abort();
      }
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
