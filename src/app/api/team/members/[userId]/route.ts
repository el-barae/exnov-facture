import { updateMember } from "@/lib/server/team-projects";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
import { parseJsonRequest } from "@/lib/server/request";
export const runtime = "nodejs";
type Context = { params: Promise<{ userId: string }> };
export async function PATCH(request: Request, context: Context) { try { const user = await requireTeamUser(request); const { userId } = await context.params; return jsonResponse({ user: await updateMember(user, userId, await parseJsonRequest(request, 10_000)) }); } catch (error) { return apiError(error); } }
