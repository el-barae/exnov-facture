import { resolvePlanGeometry, SYMBOLS, validateRoomPoints } from "./architecture";
import type { CadEntity, CadLayer, CadPlan, EntityType, Point, SymbolId } from "./types";

export const MAX_PLAN_ENTITIES = 5000;
export const MAX_PLAN_LAYERS = 32;
export const MAX_PLAN_FILE_BYTES = 5 * 1024 * 1024;
const COORDINATE_LIMIT = 100_000;
const ENTITY_TYPES = new Set<EntityType>(["line", "wall", "rectangle", "circle", "dimension", "text", "door", "window", "symbol", "room"]);
const INVALID_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/;

function invalid(message: string): never { throw new Error(`Plan invalide : ${message}`); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} doit être un objet.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > maxLength || (!allowEmpty && !value.trim()) || INVALID_CONTROLS.test(value)) invalid(`${label} n’est pas un texte valide (maximum ${maxLength} caractères).`);
  if (Array.from(value).some((character) => character.length === 1 && /[\ud800-\udfff]/.test(character))) invalid(`${label} contient du texte Unicode invalide.`);
  return value;
}
function identifier(value: unknown, label: string): string {
  const result = string(value, label, 120);
  if (/[\r\n\t]/.test(result)) invalid(`${label} contient un caractère interdit.`);
  return result;
}
function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) invalid(`${label} doit être un nombre entre ${min} et ${max}.`);
  return value;
}
function point(value: unknown, label: string): Point {
  const record = object(value, label);
  return { x: number(record.x, `${label}.x`, -COORDINATE_LIMIT, COORDINATE_LIMIT), y: number(record.y, `${label}.y`, -COORDINATE_LIMIT, COORDINATE_LIMIT) };
}
function boolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") invalid(`${label} doit être vrai ou faux.`);
  return value;
}

/** Validate and copy untrusted JSON. Unknown fields are discarded. */
export function parsePlan(input: unknown): CadPlan {
  const plan = object(input, "le plan");
  if (plan.version !== 1) invalid("la version du fichier n’est pas prise en charge.");
  const id = identifier(plan.id, "l’identifiant du plan");
  const name = string(plan.name, "le nom du plan", 120);
  if (!Array.isArray(plan.layers) || plan.layers.length < 1 || plan.layers.length > MAX_PLAN_LAYERS) invalid(`le plan doit contenir de 1 à ${MAX_PLAN_LAYERS} calques.`);
  if (!Array.isArray(plan.entities) || plan.entities.length > MAX_PLAN_ENTITIES) invalid(`le plan doit contenir au maximum ${MAX_PLAN_ENTITIES} objets.`);
  const layerIds = new Set<string>();
  const layers: CadLayer[] = plan.layers.map((value, index) => {
    const layer = object(value, `le calque ${index + 1}`);
    const layerId = identifier(layer.id, "l’identifiant du calque");
    if (layerIds.has(layerId)) invalid("les identifiants de calques doivent être uniques.");
    layerIds.add(layerId);
    if (typeof layer.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(layer.color)) invalid("la couleur d’un calque doit être au format #RRGGBB.");
    return { id: layerId, name: string(layer.name, "le nom du calque", 80), color: layer.color, visible: boolean(layer.visible, "la visibilité du calque", true), locked: boolean(layer.locked, "le verrouillage du calque", false) };
  });
  const entityIds = new Set<string>();
  const entities: CadEntity[] = plan.entities.map((value, index) => {
    const entity = object(value, `l’objet ${index + 1}`);
    const entityId = identifier(entity.id, "l’identifiant de l’objet");
    if (entityIds.has(entityId)) invalid("les identifiants d’objets doivent être uniques.");
    entityIds.add(entityId);
    if (typeof entity.type !== "string" || !ENTITY_TYPES.has(entity.type as EntityType)) invalid("un type d’objet n’est pas reconnu.");
    const type = entity.type as EntityType;
    const layerId = identifier(entity.layerId, "le calque de l’objet");
    if (!layerIds.has(layerId)) invalid("un objet fait référence à un calque inexistant.");
    const result: CadEntity = { id: entityId, type, layerId, start: point(entity.start, "le point de départ"), end: point(entity.end, "le point d’arrivée") };
    if (entity.text !== undefined || type === "text") result.text = string(entity.text ?? "Texte", "l’annotation", 2000, true);
    if (entity.thickness !== undefined || type === "wall") result.thickness = number(entity.thickness ?? 0.2, "l’épaisseur", 0.001, 100);
    if (entity.fontSize !== undefined || type === "text" || type === "dimension") result.fontSize = number(entity.fontSize ?? (type === "dimension" ? 0.24 : 0.3), "la taille du texte", 0.01, 50);
    if (entity.wallAttachment !== undefined) {
      if (type !== "door" && type !== "window") invalid("seules les portes et fenêtres peuvent être attachées à un mur.");
      const attachment = object(entity.wallAttachment, "l’attache au mur");
      result.wallAttachment = { wallId: identifier(attachment.wallId, "le mur support"), t: number(attachment.t, "la position sur le mur", -COORDINATE_LIMIT, COORDINATE_LIMIT), width: number(attachment.width, "la largeur de l’ouverture", 0.01, COORDINATE_LIMIT) };
    }
    if ((type === "door" || type === "window") && !result.wallAttachment) invalid("une ouverture doit être attachée à un mur.");
    if (entity.wallId !== undefined) {
      if (type !== "dimension") invalid("seules les cotes peuvent référencer un mur.");
      result.wallId = identifier(entity.wallId, "le mur de la cote");
    }
    if (entity.offset !== undefined || result.wallId) {
      if (type !== "dimension" || !result.wallId) invalid("le décalage nécessite une cote liée à un mur.");
      result.offset = number(entity.offset ?? 0.6, "le décalage de la cote", -COORDINATE_LIMIT, COORDINATE_LIMIT);
    }
    if (type === "room") {
      if (!Array.isArray(entity.points) || entity.points.length < 3 || entity.points.length > 64) invalid("une pièce doit avoir entre 3 et 64 sommets.");
      result.points = entity.points.map((value, index) => point(value, `le sommet ${index + 1}`));
      validateRoomPoints(result.points);
    } else if (entity.points !== undefined) invalid("seules les pièces peuvent contenir un contour polygonal.");
    if (type === "symbol") {
      if (!SYMBOLS.some((symbol) => symbol.id === entity.symbolId)) invalid("le symbole demandé est inconnu.");
      result.symbolId = entity.symbolId as SymbolId;
      if (Math.abs(result.end.x - result.start.x) < 0.01 || Math.abs(result.end.y - result.start.y) < 0.01) invalid("la largeur et la hauteur d’un symbole doivent être supérieures à 0,01 m.");
    } else if (entity.symbolId !== undefined) invalid("la référence de symbole exige un objet de type symbole.");
    if (entity.rotation !== undefined) {
      if (type !== "symbol") invalid("la rotation est réservée aux symboles.");
      result.rotation = number(entity.rotation, "la rotation du symbole", -36000, 36000);
    }
    if (entity.swing !== undefined) {
      if (type !== "door" || (entity.swing !== 1 && entity.swing !== -1)) invalid("le sens d’ouverture d’une porte doit être 1 ou -1.");
      result.swing = entity.swing;
    }
    return result;
  });
  const updatedAt = plan.updatedAt === undefined ? new Date().toISOString() : string(plan.updatedAt, "la date de modification", 64);
  if (!Number.isFinite(Date.parse(updatedAt))) invalid("la date de modification n’est pas valide.");
  const resolved = resolvePlanGeometry({ version: 1, id, name, updatedAt, layers, entities });
  // Recheck derived coordinates: a finite wall and finite offset can still exceed bounds.
  for (const entity of resolved.entities) { point(entity.start, "le point de départ calculé"); point(entity.end, "le point d’arrivée calculé"); }
  return resolved;
}
