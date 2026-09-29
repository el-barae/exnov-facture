import { beginProjectImport } from "@/lib/server/team-import";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
import { parseJsonRequest } from "@/lib/server/request";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireTeamUser(request);
    return jsonResponse(await beginProjectImport(user, await parseJsonRequest(request, 2_000_000)));
  } catch (error) { return apiError(error); }
}
