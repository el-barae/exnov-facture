import { reportExportSchema, reportFilename } from "@/lib/report";
import { buildReportHtml } from "@/lib/document/report";
import { renderPdfHtml } from "@/lib/server/pdf";
import { loadAssets } from "@/lib/server/assets";
import { parseReportRequest, reportError, validateReportImages } from "@/lib/server/report-request";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { report, images } = await parseReportRequest(request, reportExportSchema);
    validateReportImages(images, report);
    const bytes = await renderPdfHtml(buildReportHtml(report, images, await loadAssets()), "report");
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${reportFilename(report)}"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return reportError(error); }
}
