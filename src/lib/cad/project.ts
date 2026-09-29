import type { CivilProject, ProjectDocument } from "../projects";
import type { CadPlan } from "./types";
import { MAX_PLAN_FILE_BYTES, parsePlan } from "./validation";

/** Identifies a project document, independently from the atelier’s local draft id. */
export type ProjectPlanSource = {
  projectId: string;
  documentId: string;
  revision: number;
  fileName: string;
  planId: string;
};
export type LoadedProjectPlan = { project: CivilProject; source: ProjectPlanSource; plan: CadPlan };

export function isEditableProjectPlan(document: Pick<ProjectDocument, "kind" | "name">): boolean {
  return document.kind === "plans" && document.name.toLowerCase().endsWith(".json");
}

export async function parseProjectPlanFile(file: Blob): Promise<CadPlan> {
  if (file.size === 0) throw new Error("Le fichier du plan est vide.");
  if (file.size > MAX_PLAN_FILE_BYTES) throw new Error("Un plan JSON ne peut pas dépasser 5 Mo.");
  let content: unknown;
  try { content = JSON.parse(await file.text()); }
  catch { throw new Error("Le fichier ne contient pas un JSON lisible. Importez un plan exporté depuis Plans 2D."); }
  return parsePlan(content);
}

export function createProjectPlanFile(plan: CadPlan, fileName?: string): File {
  const valid = parsePlan(plan);
  const safeName = valid.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "plan";
  const name = fileName ?? `${safeName}.json`;
  if (!name.toLowerCase().endsWith(".json") || name.length > 255 || /[\u0000-\u001f]/.test(name)) {
    throw new Error("Le nom du plan doit se terminer par .json et contenir au maximum 255 caractères.");
  }
  const file = new File([JSON.stringify(valid, null, 2)], name, { type: "application/json" });
  if (file.size > MAX_PLAN_FILE_BYTES) throw new Error("Un plan JSON ne peut pas dépasser 5 Mo.");
  return file;
}

export function loadedProjectPlan(project: CivilProject, document: ProjectDocument, plan: CadPlan): LoadedProjectPlan {
  return {
    project,
    source: { projectId: project.id, documentId: document.id, revision: document.revision ?? 0, fileName: document.name, planId: plan.id },
    plan,
  };
}
