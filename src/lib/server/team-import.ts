import "server-only";
import { transaction } from "./database";
import { canManageProjects, TeamPermissionError, type TeamUser } from "../team";
import { createProject, projectSchema } from "../projects";
import { accessibleProject, audit, currentActor, writeProject, uuidSchema } from "./team-projects";
import { RequestError } from "./request";

export async function beginProjectImport(actor: TeamUser, input: unknown) {
  const source = projectSchema.parse(input);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    if (!canManageProjects(user)) throw new TeamPermissionError();
    await client.query("SELECT pg_advisory_xact_lock(78124912)");
    const existing = await client.query("SELECT project_id,completed FROM project_imports WHERE local_id=$1", [source.id]);
    if (existing.rows[0]) return { project: await accessibleProject(client, user, existing.rows[0].project_id), completed: existing.rows[0].completed as boolean };
    const project = createProject(source);
    await client.query("INSERT INTO team_projects(id,data,created_by) VALUES($1,$2,$3)", [project.id, JSON.stringify(project), user.id]);
    await client.query("INSERT INTO project_imports(local_id,project_id,imported_by,snapshot) VALUES($1,$2,$3,$4)", [source.id, project.id, user.id, JSON.stringify(source)]);
    await audit(client, user, project.id, "project.import_started", { localId: source.id });
    return { project, completed: false };
  });
}
export async function finishProjectImport(actor: TeamUser, localId: string) {
  uuidSchema.parse(localId);
  return transaction(async client => {
    const user = await currentActor(client, actor);
    if (!canManageProjects(user)) throw new TeamPermissionError();
    const result = await client.query("SELECT project_id,snapshot,completed FROM project_imports WHERE local_id=$1 FOR UPDATE", [localId]);
    if (!result.rows[0]) throw new RequestError("Import introuvable.", 404);
    const current = await accessibleProject(client, user, result.rows[0].project_id, true);
    if (result.rows[0].completed) return current;
    const source = projectSchema.parse(result.rows[0].snapshot);
    for (const doc of source.documents) {
      if (!current.documents.some(existing => existing.id === doc.id && existing.size === doc.size && existing.kind === doc.kind)) throw new RequestError("Tous les fichiers doivent être transférés avant de reprendre les validations du dossier.", 409);
    }
    const date = new Date().toISOString();
    const next = projectSchema.parse({ ...current, completedSteps: source.completedSteps, createdAt: source.createdAt, updatedAt: date, revision: current.revision + 1, history: [...source.history, { id: crypto.randomUUID(), date, message: `Dossier local importé par ${user.name}.` }] });
    await writeProject(client, next);
    await client.query("UPDATE project_imports SET completed=true WHERE local_id=$1", [localId]);
    await audit(client, user, current.id, "project.import_completed", { localId });
    return next;
  });
}
