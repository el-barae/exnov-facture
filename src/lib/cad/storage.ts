import type { CadPlan } from "./types";
import { parsePlan } from "./validation";

export const PLAN_PREFIX = "exnov.plans.v1.document.";
export const ACTIVE_PLAN_KEY = "exnov.plans.v1.active";

export class PlanConflictError extends Error {
  constructor() {
    super("Ce plan a été modifié ou supprimé dans un autre onglet. Votre version n’a pas écrasé la sauvegarde : exportez-la en JSON pour la conserver.");
    this.name = "PlanConflictError";
  }
}

export function loadPlans(storage: Storage): { plans: CadPlan[]; activeId: string | null; warning: string; snapshots: Record<string, string> } {
  const plans: CadPlan[] = [];
  const snapshots: Record<string, string> = Object.create(null);
  let invalid = 0;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(PLAN_PREFIX)) continue;
    try {
      const raw = storage.getItem(key);
      if (raw === null) throw new Error("Sauvegarde supprimée");
      const plan = parsePlan(JSON.parse(raw));
      if (key !== PLAN_PREFIX + plan.id) throw new Error("Identifiant incohérent");
      plans.push(plan);
      snapshots[plan.id] = raw;
    } catch { invalid++; }
  }
  return {
    plans: plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    snapshots,
    activeId: storage.getItem(ACTIVE_PLAN_KEY),
    warning: invalid ? `${invalid} sauvegarde(s) illisible(s) ont été conservées sans modification. Les autres plans restent disponibles.` : "",
  };
}

export function savePlan(storage: Storage, plan: CadPlan, expected?: string | null): string {
  const valid = parsePlan(plan);
  const key = PLAN_PREFIX + valid.id;
  const raw = JSON.stringify(valid);
  if (expected !== undefined && storage.getItem(key) !== expected) throw new PlanConflictError();
  storage.setItem(key, raw);
  // The drawing itself is already saved if the optional last-opened pointer fails.
  try { storage.setItem(ACTIVE_PLAN_KEY, valid.id); } catch { /* Keep the saved drawing available in the library. */ }
  return raw;
}
