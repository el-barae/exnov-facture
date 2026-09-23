import type { z } from "zod";
import { MAX_CPS_LOGO_BYTES, MAX_CPS_REQUEST_BYTES, type CpsLogo } from "../cps";
import { parseJsonRequest, RequestError } from "./request";

export async function parseCpsRequest<T>(request: Request, schema: z.ZodType<T>) {
  const result = schema.safeParse(await parseJsonRequest(request, MAX_CPS_REQUEST_BYTES));
  if (!result.success) throw new RequestError("Les données du CPS sont invalides. Vérifiez les champs, la longueur des textes et le logo.", 400);
  return result.data;
}
export function validateCpsLogo(logo: CpsLogo | null) {
  if (!logo) return;
  const bytes = Buffer.from(logo.dataUrl.split(",")[1], "base64");
  if (bytes.length < 45 || bytes.length > MAX_CPS_LOGO_BYTES ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString("ascii", 12, 16) !== "IHDR" || bytes.readUInt32BE(16) !== logo.width || bytes.readUInt32BE(20) !== logo.height ||
    bytes.toString("ascii", bytes.length - 8, bytes.length - 4) !== "IEND") {
    throw new RequestError("Le logo PNG est invalide. Importez à nouveau votre image.", 400);
  }
}
export function cpsError(error: unknown) {
  const known = error instanceof RequestError;
  if (!known) console.error("Échec CPS :", error instanceof Error ? error.name : "Erreur inconnue");
  return Response.json({ error: known ? error.message : "Impossible de préparer le CPS. Réessayez." }, {
    status: known ? error.status : 500, headers: { "Cache-Control": "no-store" },
  });
}
