import { documentFilename, invoiceSchema, type DocumentType } from "../invoice";
export async function parseInvoiceRequest(request: Request) {
  const result = invoiceSchema.safeParse(await parseJsonRequest(request, 500000));
  if (!result.success) throw new RequestError(result.error.issues.map(i => `${i.path.join(".")} : ${i.message}`).join("\n"), 400);
  return result.data;
}
export async function parseJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new RequestError("Envoyez des données JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Le document est vide.", 400);
  const decoder = new TextDecoder();
  let text = "", size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RequestError("Le document est trop volumineux.", 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw new RequestError("Les données JSON sont invalides.", 400); }
}
export class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function exportError(error: unknown, format: string) {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  // Ne pas journaliser les données de facture ni les erreurs détaillées du moteur Word.
  console.error(`Échec export ${format}:`, error instanceof Error ? error.name : "Erreur inconnue");
  return Response.json({ error: `Impossible de générer le ${format}. Réessayez ou raccourcissez les textes très longs.` }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
export function fileResponse(bytes: Uint8Array, numero: number, format: "pdf" | "docx", type: DocumentType = "facture") {
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename="${documentFilename(type, numero, format)}"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
