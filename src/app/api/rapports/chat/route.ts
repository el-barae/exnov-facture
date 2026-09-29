import { protectApi } from "@/lib/server/team-access";
import { reportChatSchema } from "@/lib/report";
import { generateReport } from "@/lib/server/bedrock";
import { parseReportRequest, reportError, validateReportImages } from "@/lib/server/report-request";

export const runtime = "nodejs";
// Fluid Compute : marge pour la validation autour de l’attente Bedrock (270 s).
export const maxDuration = 300;
export async function POST(request: Request) {
  const denied = await protectApi(request, "ai");
  if (denied) return denied;
  try {
    const input = await parseReportRequest(request, reportChatSchema);
    validateReportImages(input.images, input.report);
    const reply = await generateReport(input, request.signal);
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return reportError(error); }
}
