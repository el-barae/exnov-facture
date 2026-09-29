import { listMembers, createMember } from "@/lib/server/team-projects";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
import { parseJsonRequest } from "@/lib/server/request";
export const runtime = "nodejs";
export async function GET(request: Request) { try { return jsonResponse({ users: await listMembers(await requireTeamUser(request)) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { const user = await requireTeamUser(request); return jsonResponse({ user: await createMember(user, await parseJsonRequest(request, 10_000)) }, 201); } catch (error) { return apiError(error); } }
