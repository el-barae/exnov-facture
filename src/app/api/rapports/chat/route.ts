import { reportChatSchema } from "@/lib/report";
import { generateReport } from "@/lib/server/bedrock";
import { parseReportRequest, reportError, validateReportImages } from "@/lib/server/report-request";

export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const input = await parseReportRequest(request, reportChatSchema);
    validateReportImages(input.images, input.report);
    const reply = await generateReport(input, request.signal);
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return reportError(error); }
}
