import { z } from "zod";
export const STORAGE_KEY = "exnov.facturation.v1";
const savedSchema = z.object({
  dernierNumero: z.number().int().min(1).max(999999999).optional(),
  client: z.object({ destinataire: z.string().max(500), reference: z.string().max(150) }).optional(),
});
export type SavedPreferences = z.infer<typeof savedSchema>;
export function readPreferences(): SavedPreferences {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try { const result = savedSchema.safeParse(JSON.parse(raw)); return result.success ? result.data : {}; }
  catch { return {}; }
}
export function savePreferences(patch: SavedPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPreferences(), ...patch }));
}
