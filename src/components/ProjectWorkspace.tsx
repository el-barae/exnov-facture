"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LoadedProjectPlan } from "@/lib/cad/project";
import type { CadPlan } from "@/lib/cad/types";
import type { CivilProject } from "@/lib/projects";

export type WorkshopDraft = Map<string, unknown>;
type Workspace = {
  project?: CivilProject; draft: WorkshopDraft; onOpenProject: (id: string) => void; onLeaveProject: () => void;
  planDocument?: LoadedProjectPlan;
  onOpenPlanDraft?: (plan: CadPlan) => void;
  onPlanSaved?: (document: LoadedProjectPlan) => void;
};
const Context = createContext<Workspace | null>(null);

export function ProjectWorkspace({ children, ...workspace }: Workspace & { children: ReactNode }) {
  return <Context.Provider value={workspace}>{children}</Context.Provider>;
}

export function useProjectWorkspace() { return useContext(Context); }

/** Brouillons en mémoire, séparés par atelier et projet, jusqu’à la déconnexion. */
export function useWorkshopState<T>(key: string, initial: T | (() => T)) {
  const workspace = useProjectWorkspace();
  const draft = workspace?.draft;
  const state = useState<T>(() => draft && draft.has(key) ? draft.get(key) as T : typeof initial === "function" ? (initial as () => T)() : initial);
  const value = state[0];
  useEffect(() => { if (draft) draft.set(key, value); }, [draft, key, value]);
  return state;
}

export function projectBrief(project?: CivilProject) {
  return project ? `Projet : ${project.name}\nClient / maître d’ouvrage : ${project.client}\nLocalisation : ${project.site || "À préciser"}\nRéférence du dossier : ${project.reference || "À préciser"}\n\n` : "";
}
