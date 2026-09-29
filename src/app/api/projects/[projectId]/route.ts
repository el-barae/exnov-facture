import { after } from "next/server";
import { flushFileCleanup } from "@/lib/server/team-file-cleanup";
import { updateTeamProject } from "@/lib/server/team-projects";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
import { parseJsonRequest } from "@/lib/server/request";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ projectId: string }> };
export async function PATCH(request: Request, context: Context) { try { const user = await requireTeamUser(request); const { projectId } = await context.params; after(async () => { await flushFileCleanup(); }); return jsonResponse({ project: await updateTeamProject(user, projectId, await parseJsonRequest(request, 100_000)) }); } catch (error) { return apiError(error); } }
