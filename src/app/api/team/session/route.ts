import { apiError, jsonResponse, sessionUser, teamMode } from "@/lib/server/team-access";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return jsonResponse({ mode: teamMode(), user: await sessionUser(request) }); }
  catch (error) { return apiError(error); }
}
