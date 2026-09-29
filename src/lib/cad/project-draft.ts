import type { ProjectPlanSource } from "./project";
import type { CadPlan } from "./types";

/** Document identity and timestamps do not make a geometry/name change. */
export function projectPlanContent(plan: CadPlan): string {
  return JSON.stringify({ name: plan.name, layers: plan.layers, entities: plan.entities });
}

/** Two files may contain the same embedded plan id; each still owns a separate draft. */
export function projectPlanDraft(plan: CadPlan, source: ProjectPlanSource): CadPlan {
  return { ...plan, id: `project:${source.projectId}:${source.documentId}` };
}
