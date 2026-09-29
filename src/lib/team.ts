import { z } from "zod";
import { stepIdSchema } from "./projects";

export const teamRoleSchema = z.enum(["admin", "manager", "technician", "technician_pro"]);
export type TeamRole = z.infer<typeof teamRoleSchema>;

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Administrateur",
  manager: "Gérant / Chef de projets",
  technician: "Technicien",
  technician_pro: "Technicien Pro",
};

/** Public profile. Credentials and session tokens never belong in this model. */
export const teamUserSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254),
  role: teamRoleSchema,
  active: z.boolean(),
});
export type TeamUser = z.infer<typeof teamUserSchema>;

export const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
};

const taskFields = {
  title: z.string().trim().min(1, "Renseignez le titre de la tâche.").max(200),
  description: z.string().trim().max(6000),
  assigneeId: z.string().uuid(),
  dueDate: z.iso.date().nullable(),
  stepId: stepIdSchema.nullable().default(null),
};
const revisionSchema = z.number().int().nonnegative();

export const projectTaskSchema = z.strictObject({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  ...taskFields,
  status: taskStatusSchema,
  revision: revisionSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectTask = z.infer<typeof projectTaskSchema>;

/** Project, status, revision and timestamps are assigned by the server. */
export const taskCreateSchema = z.strictObject({
  ...taskFields,
  description: taskFields.description.default(""),
  dueDate: taskFields.dueDate.default(null),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z.strictObject({
  title: taskFields.title.optional(),
  description: taskFields.description.optional(),
  assigneeId: taskFields.assigneeId.optional(),
  dueDate: taskFields.dueDate.optional(),
  stepId: stepIdSchema.nullable().optional(),
  status: taskStatusSchema.optional(),
  revision: revisionSchema,
}).refine(value => Object.entries(value).some(([key, field]) => key !== "revision" && field !== undefined), {
  message: "Indiquez la modification de la tâche.",
});
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

/** Technicians report progress; assignment and task scope remain manager-controlled. */
export const taskProgressSchema = z.strictObject({
  status: taskStatusSchema,
  revision: revisionSchema,
});

type Actor = TeamUser | null | undefined;
type ProjectAssignment = Pick<ProjectTask, "projectId" | "assigneeId">;

export function canManageTeam(user: Actor): boolean {
  return user?.active === true && user.role === "admin";
}

export function canManageProjects(user: Actor): boolean {
  return user?.active === true && (user.role === "admin" || user.role === "manager");
}

export function canUseAi(user: Actor): boolean {
  return canManageProjects(user) || (user?.active === true && user.role === "technician_pro");
}

function isActiveTechnician(user: Actor): user is TeamUser {
  return user?.active === true && (user.role === "technician" || user.role === "technician_pro");
}

/** Supply assignments fetched by the server, never assignments supplied by a client. */
export function canAccessProject(user: Actor, projectId: string, assignments: readonly ProjectAssignment[]): boolean {
  return canManageProjects(user) || (isActiveTechnician(user)
    && assignments.some(task => task.projectId === projectId && task.assigneeId === user.id));
}

export function canUploadToProject(user: Actor, projectId: string, assignments: readonly ProjectAssignment[]): boolean {
  return canAccessProject(user, projectId, assignments);
}

export function canUpdateTask(user: Actor, task: ProjectAssignment): boolean {
  return canManageProjects(user) || (isActiveTechnician(user) && task.assigneeId === user.id);
}

export class TeamPermissionError extends Error {
  readonly status = 403;

  constructor(message = "Vous n’avez pas les droits nécessaires pour cette action.") {
    super(message);
    this.name = "TeamPermissionError";
  }
}

export class TaskRevisionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("Cette tâche a été modifiée. Actualisez le projet avant de réessayer.");
    this.name = "TaskRevisionConflictError";
  }
}

/** The database must also compare the revision atomically when writing the update. */
export function parseTaskUpdate(user: Actor, task: ProjectTask, input: unknown): TaskUpdateInput {
  if (!canUpdateTask(user, task)) throw new TeamPermissionError();
  const update = canManageProjects(user) ? taskUpdateSchema.parse(input) : taskProgressSchema.parse(input);
  if (update.revision !== task.revision) throw new TaskRevisionConflictError();
  return update;
}
