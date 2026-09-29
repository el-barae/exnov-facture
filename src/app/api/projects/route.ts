import { newTeamProject, listTeamProjects } from "@/lib/server/team-projects";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
import { parseJsonRequest } from "@/lib/server/request";
export const runtime = "nodejs";
export async function GET(request: Request) { try { return jsonResponse({ projects: await listTeamProjects(await requireTeamUser(request)) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { const user = await requireTeamUser(request); return jsonResponse({ project: await newTeamProject(user, await parseJsonRequest(request, 100_000)) }, 201); } catch (error) { return apiError(error); } }
