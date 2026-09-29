import "server-only";
import type { DatabaseClient as PoolClient } from "./database";
import { z } from "zod";
import { getDatabase, transaction } from "./database";
import { RequestError } from "./request";
import { applyProjectAction, createProject, projectDetailsSchema, projectSchema, projectSteps, stepIdSchema, type CivilProject, type ProjectAction } from "../projects";
import { canManageProjects, canManageTeam, parseTaskUpdate, projectTaskSchema, taskCreateSchema, teamRoleSchema, teamUserSchema, TeamPermissionError, type ProjectTask, type TeamUser } from "../team";
import { createManagedAuthUser, setManagedPassword } from "./auth";

export const uuidSchema = z.string().uuid();
export const projectUpdateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  action: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("complete"), stepId: stepIdSchema }),
    z.strictObject({ type: z.literal("reopen"), stepId: stepIdSchema }),
    z.strictObject({ type: z.literal("edit"), details: projectDetailsSchema }),
    z.strictObject({ type: z.literal("removeDocument"), documentId: uuidSchema }),
  ]),
});
export async function currentActor(client: PoolClient, actor: TeamUser): Promise<TeamUser> {
  const result = await client.query(`SELECT u.id,u.name,u.email,m.role,m.active FROM team_members m JOIN "user" u ON u.id=m.user_id WHERE m.user_id=$1 AND m.active=true FOR SHARE OF m`, [actor.id]);
  if (!result.rows[0]) throw new RequestError("Votre compte n’a plus accès à cet espace.", 403);
  return teamUserSchema.parse(result.rows[0]);
}
export async function accessibleProject(client: PoolClient, actor: TeamUser, id: string, lock = false): Promise<CivilProject> {
  uuidSchema.parse(id);
  const result = await client.query(`SELECT p.data FROM team_projects p WHERE p.id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM project_tasks t WHERE t.project_id=p.id AND t.assignee_id=$3)) ${lock ? "FOR UPDATE OF p" : ""}`, [id, canManageProjects(actor), actor.id]);
  if (!result.rows[0]) throw new RequestError("Projet introuvable ou accès non autorisé.", 404);
  return projectSchema.parse(result.rows[0].data);
}
export async function audit(client: PoolClient, user: TeamUser, projectId: string | null, action: string, details: unknown = {}) {
  await client.query("INSERT INTO team_audit(actor_id,project_id,action,details) VALUES($1,$2,$3,$4)", [user.id, projectId, action, JSON.stringify(details)]);
}
export function applyAction(project: CivilProject, action: ProjectAction) {
  try { return applyProjectAction(project, action); }
  catch (error) { throw new RequestError(error instanceof Error ? error.message : "Action de projet invalide.", 400); }
}
export async function writeProject(client: PoolClient, project: CivilProject) {
  await client.query("UPDATE team_projects SET data=$2,updated_at=now() WHERE id=$1", [project.id, JSON.stringify(project)]);
}
/** Les techniciens reçoivent les documents techniques et leur contexte, sans pièces financières. */
export function visibleProject(user: TeamUser, project: CivilProject): CivilProject {
  if (canManageProjects(user)) return project;
  const hidden = new Set(["devis", "facture", "bdp", "bdp-estimatif"]);
  return { ...project, documents: project.documents.filter(doc => !hidden.has(doc.kind)), requiredDocuments: project.requiredDocuments.filter(kind => !hidden.has(kind)), history: [] };
}
export async function listTeamProjects(actor: TeamUser): Promise<CivilProject[]> {
  const result = await getDatabase().query(`SELECT p.data FROM team_projects p WHERE $1::boolean OR EXISTS(SELECT 1 FROM project_tasks t WHERE t.project_id=p.id AND t.assignee_id=$2) ORDER BY p.updated_at DESC`, [canManageProjects(actor), actor.id]);
  return result.rows.map(row => visibleProject(actor, projectSchema.parse(row.data)));
}
export async function newTeamProject(actor: TeamUser, input: unknown) {
  const details = projectDetailsSchema.parse(input);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    if (!canManageProjects(user)) throw new TeamPermissionError();
    const project = createProject(details);
    await client.query("INSERT INTO team_projects(id,data,created_by) VALUES($1,$2,$3)", [project.id, JSON.stringify(project), user.id]);
    await audit(client, user, project.id, "project.created");
    return project;
  });
}
export async function updateTeamProject(actor: TeamUser, projectId: string, input: unknown) {
  const { revision, action } = projectUpdateSchema.parse(input);
  const saved = await transaction(async client => {
    const user = await currentActor(client, actor);
    if (!canManageProjects(user)) throw new TeamPermissionError();
    const project = await accessibleProject(client, user, projectId, true);
    if (project.revision !== revision) throw new RequestError("Le projet a changé. Actualisez le dossier avant de réessayer.", 409);
    const next = applyAction(project, action);
    if (project.withBdp && !next.withBdp) {
      const linked = await client.query("SELECT id FROM project_tasks WHERE project_id=$1 AND data->>'stepId'='chiffrage' LIMIT 1", [project.id]);
      if (linked.rowCount) throw new RequestError("Rattachez les tâches de chiffrage à une autre étape ou au projet avant de retirer cette étape.",409);
    }
    if (action.type === "removeDocument") {
      await client.query("INSERT INTO drive_file_cleanup(file_id) SELECT drive_file_id FROM project_files WHERE id=$1 AND project_id=$2 ON CONFLICT DO NOTHING", [action.documentId,project.id]);
      await client.query("DELETE FROM project_files WHERE id=$1 AND project_id=$2", [action.documentId,project.id]);
    }
    await writeProject(client, next);
    await audit(client, user, project.id, `project.${action.type}`);
    return next;
  });
  return saved;
}
export async function listTasks(actor: TeamUser, projectId: string): Promise<ProjectTask[]> {
  return transaction(async client => {
    const user = await currentActor(client, actor);
    await accessibleProject(client, user, projectId);
    const result = await client.query("SELECT data FROM project_tasks WHERE project_id=$1 AND ($2::boolean OR assignee_id=$3) ORDER BY data->>'createdAt'", [projectId, canManageProjects(user), user.id]);
    return result.rows.map(row => projectTaskSchema.parse(row.data));
  });
}
async function assertAssignee(client: PoolClient, id: string) {
  const result = await client.query("SELECT user_id FROM team_members WHERE user_id=$1 AND active=true FOR SHARE", [id]);
  if (!result.rowCount) throw new RequestError("Choisissez un collaborateur actif.", 400);
}
function assertTaskStep(project: CivilProject, stepId: ProjectTask["stepId"]) {
  if (stepId && !projectSteps(project).some(step => step.id === stepId)) throw new RequestError("Cette étape ne fait pas partie du parcours du projet.",400);
}
export async function createTask(actor: TeamUser, projectId: string, input: unknown) {
  const values = taskCreateSchema.parse(input);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    if (!canManageProjects(user)) throw new TeamPermissionError();
    const project = await accessibleProject(client, user, projectId, true);
    assertTaskStep(project, values.stepId);
    await assertAssignee(client, values.assigneeId);
    const now = new Date().toISOString();
    const task = projectTaskSchema.parse({ ...values, id: crypto.randomUUID(), projectId, revision: 0, status: "todo", createdAt: now, updatedAt: now });
    await client.query("INSERT INTO project_tasks(id,project_id,assignee_id,data) VALUES($1,$2,$3,$4)", [task.id, projectId, task.assigneeId, JSON.stringify(task)]);
    await audit(client, user, projectId, "task.created", { taskId: task.id, assigneeId: task.assigneeId, stepId: task.stepId });
    return task;
  });
}
export async function updateTask(actor: TeamUser, projectId: string, taskId: string, input: unknown) {
  uuidSchema.parse(taskId);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    const project = await accessibleProject(client, user, projectId, true);
    const result = await client.query("SELECT data FROM project_tasks WHERE id=$1 AND project_id=$2 FOR UPDATE", [taskId, projectId]);
    if (!result.rows[0]) throw new RequestError("Tâche introuvable.", 404);
    const task = projectTaskSchema.parse(result.rows[0].data);
    const patch = parseTaskUpdate(user, task, input);
    assertTaskStep(project, patch.stepId === undefined ? task.stepId : patch.stepId);
    if (patch.assigneeId) await assertAssignee(client, patch.assigneeId);
    const next = projectTaskSchema.parse({ ...task, ...patch, revision: task.revision + 1, updatedAt: new Date().toISOString() });
    await client.query("UPDATE project_tasks SET data=$2,assignee_id=$3 WHERE id=$1", [task.id, JSON.stringify(next), next.assigneeId]);
    await audit(client, user, projectId, "task.updated", { taskId: task.id, status: next.status, assigneeId: next.assigneeId, stepId: next.stepId });
    return next;
  });
}
const memberCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(254), password: z.string().min(12).max(128), role: teamRoleSchema });
const memberUpdateSchema = z.strictObject({ role: teamRoleSchema.optional(), active: z.boolean().optional(), password: z.string().min(12).max(128).optional() }).refine(input => Object.keys(input).length > 0);
export async function listMembers(user: TeamUser) {
  if (!canManageProjects(user)) throw new TeamPermissionError();
  const result = await getDatabase().query(`SELECT u.id,u.name,u.email,m.role,m.active FROM team_members m JOIN "user" u ON u.id=m.user_id ORDER BY u.name`);
  return result.rows.map(row => teamUserSchema.parse(row));
}
export async function createMember(actor: TeamUser, input: unknown) {
  const values = memberCreateSchema.parse(input);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    if (!canManageTeam(user)) throw new TeamPermissionError();
    const exists = await client.query('SELECT id FROM "user" WHERE lower(email)=lower($1)', [values.email]);
    if (exists.rowCount) throw new RequestError("Cette adresse possède déjà un compte.", 409);
    const created = await createManagedAuthUser(values, client);
    await client.query("INSERT INTO team_members(user_id,role) VALUES($1,$2)", [created.id, values.role]);
    await audit(client, user, null, "member.created", { userId: created.id, role: values.role });
    return { ...created, role: values.role, active: true } satisfies TeamUser;
  });
}
export async function updateMember(actor: TeamUser, userId: string, input: unknown) {
  uuidSchema.parse(userId);
  const values = memberUpdateSchema.parse(input);
  return transaction(async client => {
    // Sérialiser les changements de rôles pour conserver au moins un administrateur actif.
    await client.query("SELECT pg_advisory_xact_lock(78124911)");
    const user = await currentActor(client, actor);
    if (!canManageTeam(user)) throw new TeamPermissionError();
    const result = await client.query(`SELECT u.id,u.name,u.email,m.role,m.active FROM team_members m JOIN "user" u ON u.id=m.user_id WHERE u.id=$1 FOR UPDATE OF m`, [userId]);
    if (!result.rows[0]) throw new RequestError("Collaborateur introuvable.", 404);
    const current = teamUserSchema.parse(result.rows[0]);
    const updated = { ...current, role: values.role ?? current.role, active: values.active ?? current.active };
    if (current.active && current.role === "admin" && (!updated.active || updated.role !== "admin")) {
      const admins = await client.query("SELECT user_id FROM team_members WHERE role='admin' AND active=true AND user_id<>$1", [userId]);
      if (!admins.rowCount) throw new RequestError("Conservez au moins un administrateur actif.", 409);
    }
    await client.query("UPDATE team_members SET role=$2,active=$3 WHERE user_id=$1", [userId, updated.role, updated.active]);
    if (values.password) await setManagedPassword(userId, values.password, client);
    if (values.role !== undefined || values.active !== undefined) await client.query('DELETE FROM "session" WHERE "userId"=$1', [userId]);
    await audit(client, user, null, "member.updated", { userId, role: updated.role, active: updated.active, passwordReset: !!values.password });
    return updated;
  });
}
