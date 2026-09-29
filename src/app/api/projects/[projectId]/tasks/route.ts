import { listTasks, createTask } from "@/lib/server/team-projects";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
import { parseJsonRequest } from "@/lib/server/request";
export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) { try { const user = await requireTeamUser(request); const { projectId } = await context.params; return jsonResponse({ tasks: await listTasks(user, projectId) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request, context: Context) { try { const user = await requireTeamUser(request); const { projectId } = await context.params; return jsonResponse({ task: await createTask(user, projectId, await parseJsonRequest(request, 20_000)) }, 201); } catch (error) { return apiError(error); } }
