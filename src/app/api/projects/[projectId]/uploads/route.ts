import { beginUpload } from "@/lib/server/team-files";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
import {parseJsonRequest} from "@/lib/server/request";
export const runtime = "nodejs";
type Context = {params:Promise<{projectId:string}>};
export async function POST(request: Request, context: Context) { try { const user = await requireTeamUser(request); const { projectId } = await context.params; return jsonResponse({ upload: await beginUpload(user, projectId, await parseJsonRequest(request, 10_000)) }, 201); } catch (error) { return apiError(error); } }
