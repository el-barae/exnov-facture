import { cpsExportSchema, cpsFilename } from "@/lib/cps";
import { cpsError, parseCpsRequest } from "@/lib/server/cps-request";
import { generateCpsWord } from "@/lib/server/cps-word";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    const { document, logo } = await parseCpsRequest(request, cpsExportSchema);
    return new Response(new Uint8Array(generateCpsWord(document, logo)), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${cpsFilename(document)}"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return cpsError(error); }
}
