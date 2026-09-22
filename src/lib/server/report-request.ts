import type { z } from "zod";
import { MAX_IMAGE_BYTES, MAX_REPORT_REQUEST_BYTES, reportHasMissingImages, type Report, type ReportImage } from "../report";
import { parseJsonRequest, RequestError } from "./request";

export async function parseReportRequest<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await parseJsonRequest(request, MAX_REPORT_REQUEST_BYTES));
  if (!parsed.success) throw new RequestError("Le rapport ou les pièces jointes sont invalides. Vérifiez la longueur des textes et le format des images.", 400);
  return parsed.data;
}

export function validateReportImages(images: ReportImage[], report?: Report | null) {
  for (const image of images) {
    const [prefix, base64] = image.dataUrl.split(",");
    const bytes = Buffer.from(base64, "base64");
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    const valid = prefix === "data:image/png;base64" ? png : prefix === "data:image/jpeg;base64" ? jpeg : prefix === "data:image/webp;base64" && webp;
    if (!valid || bytes.length > MAX_IMAGE_BYTES) throw new RequestError("Une image est invalide ou trop volumineuse. Ajoutez-la à nouveau.", 400);
  }
  if (report && reportHasMissingImages(report, images)) throw new RequestError("Une photographie référencée dans le rapport est manquante.", 400);
}

export function reportError(error: unknown) {
  const known = error instanceof RequestError;
  if (!known) console.error("Échec du rapport :", error instanceof Error ? error.name : "Erreur inconnue");
  return Response.json({ error: known ? error.message : "Impossible de générer le rapport. Réessayez dans quelques instants." }, {
    status: known ? error.status : 500, headers: { "Cache-Control": "no-store" },
  });
}
