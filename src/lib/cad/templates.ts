import { attachOpening, createWallDimension, resolvePlanGeometry } from "./architecture";
import type { CadEntity, CadPlan, EntityType, Point } from "./types";

export function createEmptyPlan(name = "Nouveau plan"): CadPlan {
  return {
    version: 1, id: crypto.randomUUID(), name, updatedAt: new Date().toISOString(),
    layers: [
      { id: "murs", name: "Murs et structure", color: "#6E9BAA", visible: true, locked: false },
      { id: "cotes", name: "Cotations", color: "#C39648", visible: true, locked: false },
      { id: "annotations", name: "Annotations", color: "#329A8E", visible: true, locked: false },
    ],
    entities: [],
  };
}

export function createExamplePlan(): CadPlan {
  const plan = createEmptyPlan("Maison · Exemple");
  // Dedicated layers let furniture, measured room outlines and openings be hidden independently.
  plan.layers.push(
    { id: "ouvertures", name: "Portes et fenêtres", color: "#659CBE", visible: true, locked: false },
    { id: "mobilier", name: "Mobilier", color: "#A489BB", visible: true, locked: false },
    { id: "pieces", name: "Surfaces des pièces", color: "#329A8E", visible: true, locked: false },
  );
  function add(type: EntityType, layerId: string, start: Point, end: Point, properties: Partial<CadEntity> = {}) {
    const entity: CadEntity = { id: crypto.randomUUID(), type, layerId, start, end, ...properties };
    plan.entities.push(entity);
    return entity;
  }
  const wall = (x1: number, y1: number, x2: number, y2: number) => add("wall", "murs", { x: x1, y: y1 }, { x: x2, y: y2 }, { thickness: 0.2 });
  const top = wall(0, 0, 10, 0), right = wall(10, 0, 10, 8), bottom = wall(10, 8, 0, 8);
  wall(0, 8, 0, 0);
  const partition = wall(6, 0, 6, 8);
  wall(6, 4, 10, 4);
  plan.entities.push(
    attachOpening(plan, "door", bottom.id, { x: 5, y: 8 }, 1.2, "ouvertures"),
    attachOpening(plan, "door", partition.id, { x: 6, y: 2.5 }, 0.9, "ouvertures"),
    attachOpening(plan, "door", partition.id, { x: 6, y: 6.5 }, 0.9, "ouvertures"),
    attachOpening(plan, "window", top.id, { x: 3, y: 0 }, 1.8, "ouvertures"),
    attachOpening(plan, "window", right.id, { x: 10, y: 2 }, 1.4, "ouvertures"),
    attachOpening(plan, "window", right.id, { x: 10, y: 6 }, 1.4, "ouvertures"),
  );
  const room = (text: string, left: number, top: number, right: number, bottom: number) => {
    const points = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    add("room", "pieces", points[0], points[3], { points, text, fontSize: 0.26 });
  };
  // Explicit finished-face outlines: displayed areas are calculated, never approximate labels.
  room("Séjour / cuisine", 0.1, 0.1, 5.9, 7.9);
  room("Chambre 1", 6.1, 0.1, 9.9, 3.9);
  room("Chambre 2", 6.1, 4.1, 9.9, 7.9);
  add("symbol", "mobilier", { x: 0.5, y: 1 }, { x: 2.7, y: 1.9 }, { symbolId: "sofa" });
  add("symbol", "mobilier", { x: 3.2, y: 4.8 }, { x: 4.8, y: 5.7 }, { symbolId: "table" });
  add("symbol", "mobilier", { x: 7.7, y: 0.5 }, { x: 9.3, y: 2.5 }, { symbolId: "bed" });
  add("symbol", "mobilier", { x: 7.7, y: 4.5 }, { x: 9.3, y: 6.5 }, { symbolId: "bed" });
  plan.entities.push(createWallDimension(plan, top.id, -0.8), createWallDimension(plan, right.id, -0.9));
  return resolvePlanGeometry(plan);
}
