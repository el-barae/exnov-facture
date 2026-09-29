import { finishProjectImport } from "@/lib/server/team-import";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ localId: string }> }) {
  try {
    const user = await requireTeamUser(request);
    const { localId } = await context.params;
    return jsonResponse({ project: await finishProjectImport(user, localId) });
  } catch (error) { return apiError(error); }
}
