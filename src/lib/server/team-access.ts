import "server-only";
import { ZodError } from "zod";
import { APIError } from "better-auth/api";
import { getAuth } from "./auth";
import { getDatabase } from "./database";
import { RequestError } from "./request";
import { canManageProjects, canUseAi, teamUserSchema, TeamPermissionError, TaskRevisionConflictError, type TeamUser } from "../team";

export function teamMode(): "team" | "demo" | "setup" {
  if (process.env.EXNOV_DEMO_MODE === "true") return "demo";
  return process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL ? "team" : "setup";
}
export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : new URL(request.url).origin;
  if (!origin || origin !== expected) throw new RequestError("Origine de la requête non autorisée.", 403);
}
export async function sessionUser(request: Request): Promise<TeamUser | null> {
  if (teamMode() !== "team") return null;
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return null;
  const result = await getDatabase().query(`SELECT u.id, u.name, u.email, m.role, m.active FROM "user" u JOIN team_members m ON m.user_id=u.id WHERE u.id=$1 AND m.active=true`, [session.user.id]);
  return result.rows[0] ? teamUserSchema.parse(result.rows[0]) : null;
}
export async function requireTeamUser(request: Request) {
  if (teamMode() !== "team") throw new RequestError("L’espace équipe n’est pas configuré.", 503);
  const user = await sessionUser(request);
  if (!user) throw new RequestError("Connectez-vous avec un compte actif.", 401);
  assertSameOrigin(request);
  return user;
}
export function apiError(error: unknown): Response {
  if (error instanceof APIError && error.body?.code === "FAILED_TO_GET_SESSION") {
    return jsonResponse({ error: "Le service de connexion est momentanément indisponible. Réessayez dans quelques instants." }, 503);
  }
  if (error instanceof RequestError || error instanceof TeamPermissionError || error instanceof TaskRevisionConflictError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof ZodError) return Response.json({ error: "Les données sont invalides. Vérifiez les champs renseignés." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  console.error("Échec espace équipe :", error instanceof Error ? error.name : "Erreur inconnue");
  return Response.json({ error: "L’opération a échoué. Réessayez dans quelques instants." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
export function jsonResponse(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store" } }); }

/** Chaque route coûteuse contrôle les droits avant tout export ou appel fournisseur. */
export async function protectApi(request: Request, capability: "ai" | "finance" | "export"): Promise<Response | null> {
  if (teamMode() === "demo") return null;
  try {
    const user = await requireTeamUser(request);
    if (capability === "ai" && !canUseAi(user)) throw new TeamPermissionError("L’IA est réservée aux administrateurs, chefs de projets et techniciens Pro.");
    if (capability === "finance" && !canManageProjects(user)) throw new TeamPermissionError("La facturation est réservée à la direction et aux chefs de projets.");
    if (capability === "ai") {
      const configured = Number(process.env.TEAM_AI_DAILY_LIMIT || 50);
      const limit = Number.isSafeInteger(configured) && configured > 0 ? configured : 50;
      const result = await getDatabase().query(`INSERT INTO team_ai_usage(user_id,day,requests) VALUES ($1,CURRENT_DATE,1) ON CONFLICT(user_id,day) DO UPDATE SET requests=team_ai_usage.requests+1 WHERE team_ai_usage.requests < $2 RETURNING requests`, [user.id, limit]);
      if (!result.rowCount) throw new RequestError("Le quota quotidien de demandes IA est atteint.", 429);
    }
    return null;
  } catch (error) { return apiError(error); }
}
