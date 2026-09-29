import { updateTask } from "@/lib/server/team-projects";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
import { parseJsonRequest } from "@/lib/server/request";
export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; taskId: string }> };
export async function PATCH(request: Request, context: Context) { try { const user = await requireTeamUser(request); const { projectId, taskId } = await context.params; return jsonResponse({ task: await updateTask(user, projectId, taskId, await parseJsonRequest(request, 20_000)) }); } catch (error) { return apiError(error); } }
