import { protectApi } from "@/lib/server/team-access";
import { cpsGenerateSchema } from "@/lib/cps";
import { generateCps } from "@/lib/server/cps-ai";
import { cpsError, parseCpsRequest } from "@/lib/server/cps-request";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const denied = await protectApi(request, "ai");
  if (denied) return denied;
  try {
    const input = await parseCpsRequest(request, cpsGenerateSchema);
    return Response.json(await generateCps(input, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return cpsError(error); }
}
