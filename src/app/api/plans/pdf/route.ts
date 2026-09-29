import { protectApi } from "@/lib/server/team-access";
import { cadPdfFilename, cadPdfFitMessage, cadPdfLayout, parseCadPdfRequest } from "@/lib/cad/pdf";
import { MAX_PLAN_FILE_BYTES } from "@/lib/cad/validation";
import { generateCadPdf } from "@/lib/server/cad-pdf";
import { exportError, parseJsonRequest, RequestError } from "@/lib/server/request";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await protectApi(request, "export");
  if (denied) return denied;
  try {
    const body = await parseJsonRequest(request, MAX_PLAN_FILE_BYTES);
    let parsed: ReturnType<typeof parseCadPdfRequest>;
    try { parsed = parseCadPdfRequest(body); }
    catch (error) { throw new RequestError(error instanceof Error ? error.message : "La demande PDF est invalide."); }
    const { plan, settings } = parsed;
    const layout = cadPdfLayout(plan, settings);
    if (!layout.fits) throw new RequestError(cadPdfFitMessage(layout), 422);
    const bytes = await generateCadPdf(plan, settings);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${cadPdfFilename(plan)}"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return exportError(error, "PDF du plan");
  }
}
