import type { CadPlan } from "./types";
import { parsePlan } from "./validation";

export const MAX_CAD_AI_PROMPT = 4000;
export const MAX_CAD_AI_MESSAGES = 12;
export const MAX_CAD_AI_ENTITIES = 200;
export const MAX_CAD_AI_REQUEST_BYTES = 1024 * 1024;

export type CadAiMessage = { role: "user" | "assistant"; content: string };
export type CadAiReply = { message: string; plan: CadPlan | null };
export type CadAiRequest = { messages: CadAiMessage[]; plan: CadPlan; selectedEntityId: string | null };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Les données de l’assistant sont invalides.");
  return value as Record<string, unknown>;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/.test(value)) {
    throw new Error(`Le texte doit contenir entre 1 et ${limit} caractères.`);
  }
  return value.trim();
}

function boundedPlan(value: unknown): CadPlan {
  const input = record(value);
  if (!Array.isArray(input.entities) || input.entities.length > MAX_CAD_AI_ENTITIES) {
    throw new Error(`L’assistant accepte au maximum ${MAX_CAD_AI_ENTITIES} objets par plan.`);
  }
  return parsePlan(input);
}

export function parseCadAiRequest(value: unknown): CadAiRequest {
  const input = record(value);
  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > MAX_CAD_AI_MESSAGES) {
    throw new Error(`La conversation doit contenir entre 1 et ${MAX_CAD_AI_MESSAGES} messages.`);
  }
  const messages = input.messages.map((value, index): CadAiMessage => {
    const message = record(value);
    const role = index % 2 === 0 ? "user" : "assistant";
    if (message.role !== role) throw new Error("La conversation doit alterner les demandes et les réponses, en commençant par une demande.");
    return { role, content: text(message.content, MAX_CAD_AI_PROMPT) };
  });
  if (messages.at(-1)?.role !== "user") throw new Error("La conversation doit se terminer par votre demande.");
  const plan = boundedPlan(input.plan);
  const selectedEntityId = input.selectedEntityId ?? null;
  if (selectedEntityId !== null && (typeof selectedEntityId !== "string" || !plan.entities.some(entity => entity.id === selectedEntityId))) {
    throw new Error("L’objet sélectionné n’existe plus dans ce plan.");
  }
  return { messages, plan, selectedEntityId };
}

/** Validate both at the API boundary and immediately before applying a proposal. */
export function validateCadAiPlan(value: unknown, source: CadPlan): CadPlan {
  const current = boundedPlan(source);
  const proposed = boundedPlan(value);
  if (proposed.id !== current.id || proposed.version !== current.version) throw new Error("La proposition appartient à un autre plan.");
  const sourceEntities = new Map(current.entities.map(entity => [entity.id, entity]));
  for (const layer of current.layers.filter(layer => layer.locked || !layer.visible)) {
    const nextLayer = proposed.layers.find(candidate => candidate.id === layer.id);
    const previousEntities = current.entities.filter(entity => entity.layerId === layer.id);
    const nextEntities = proposed.entities.filter(entity => entity.layerId === layer.id);
    if (JSON.stringify(layer) !== JSON.stringify(nextLayer) || JSON.stringify(previousEntities) !== JSON.stringify(nextEntities)) {
      throw new Error("L’assistant ne peut pas modifier les calques verrouillés ou masqués, ni leurs objets.");
    }
    // An opening changes its host wall's visible geometry even if the wall record is unchanged.
    const wallIds = new Set(previousEntities.filter(entity => entity.type === "wall").map(entity => entity.id));
    const openings = (plan: CadPlan) => plan.entities.filter(entity => entity.wallAttachment && wallIds.has(entity.wallAttachment.wallId)).map(entity => ({
      entity, visible: plan.layers.find(candidate => candidate.id === entity.layerId)?.visible,
    }));
    if (JSON.stringify(openings(current)) !== JSON.stringify(openings(proposed))) {
      throw new Error("L’assistant ne peut pas modifier les ouvertures d’un mur sur un calque verrouillé ou masqué.");
    }
  }
  for (const entity of proposed.entities) {
    // Imported legacy objects may be degenerate; unchanged objects must survive a revision.
    if (JSON.stringify(sourceEntities.get(entity.id)) === JSON.stringify(entity)) continue;
    const dx = entity.end.x - entity.start.x;
    const dy = entity.end.y - entity.start.y;
    if (entity.type === "text") {
      if (!entity.text?.trim()) throw new Error("Une annotation proposée est vide.");
    } else if ((entity.type === "rectangle" && (dx === 0 || dy === 0)) || Math.hypot(dx, dy) < 0.000001) {
      throw new Error("Un objet proposé possède des dimensions nulles.");
    }
  }
  return { ...proposed, updatedAt: current.updatedAt };
}

export function parseCadAiReply(value: unknown, source: CadPlan): CadAiReply {
  const input = record(value);
  const message = text(input.message, 3000);
  if (input.plan === undefined) throw new Error("La proposition de plan est absente.");
  return { message, plan: input.plan === null ? null : validateCadAiPlan(input.plan, source) };
}
