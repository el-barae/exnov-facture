import { protectApi } from "@/lib/server/team-access";
import { MAX_CAD_AI_REQUEST_BYTES, parseCadAiRequest } from "@/lib/cad/ai";
import { generateCadPlan } from "@/lib/server/cad-ai";
import { parseJsonRequest, RequestError } from "@/lib/server/request";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await protectApi(request, "ai");
  if (denied) return denied;
  try {
    const body = await parseJsonRequest(request, MAX_CAD_AI_REQUEST_BYTES);
    let input;
    try { input = parseCadAiRequest(body); }
    catch (error) { throw new RequestError(error instanceof Error ? error.message : "La demande de plan est invalide.", 400); }
    return Response.json(await generateCadPlan(input, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof RequestError ? error.message : "Impossible de générer le plan. Réessayez dans quelques instants." }, {
      status: error instanceof RequestError ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
