import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessProject, canManageProjects, canManageTeam, canUpdateTask, canUploadToProject, canUseAi,
  parseTaskUpdate, projectTaskSchema, taskCreateSchema, taskUpdateSchema, teamRoleSchema, teamUserSchema,
  TaskRevisionConflictError, TeamPermissionError, type ProjectTask, type TeamRole, type TeamUser,
} from "../src/lib/team";

const projectId = "10000000-0000-4000-8000-000000000001";
const otherProjectId = "10000000-0000-4000-8000-000000000002";
const userId = "20000000-0000-4000-8000-000000000001";
const otherUserId = "20000000-0000-4000-8000-000000000002";
const task: ProjectTask = {
  id: "30000000-0000-4000-8000-000000000001", projectId,
  title: "Relever les dimensions", description: "Préparer le relevé du bâtiment.",
  assigneeId: userId, stepId: null, status: "todo", dueDate: "2026-10-05", revision: 2,
  createdAt: "2026-09-28T08:00:00.000Z", updatedAt: "2026-09-28T09:00:00.000Z",
};
function user(role: TeamRole, active = true): TeamUser {
  return { id: userId, name: "Collaborateur", email: "collaborateur@example.com", role, active };
}

test("Les quatre rôles disposent uniquement des droits attendus", () => {
  const matrix: [TeamRole, boolean, boolean, boolean][] = [
    ["admin", true, true, true],
    ["manager", false, true, true],
    ["technician", false, false, false],
    ["technician_pro", false, false, true],
  ];
  for (const [role, manageTeam, manageProjects, ai] of matrix) {
    assert.equal(canManageTeam(user(role)), manageTeam, role);
    assert.equal(canManageProjects(user(role)), manageProjects, role);
    assert.equal(canUseAi(user(role)), ai, role);
  }
  assert.equal(teamRoleSchema.safeParse("superadmin").success, false);
});

test("Un compte désactivé ou absent perd tous ses droits, même s’il est administrateur", () => {
  for (const actor of [null, undefined, ...teamRoleSchema.options.map(role => user(role, false))]) {
    assert.equal(canManageTeam(actor), false);
    assert.equal(canManageProjects(actor), false);
    assert.equal(canUseAi(actor), false);
    assert.equal(canAccessProject(actor, projectId, [task]), false);
    assert.equal(canUploadToProject(actor, projectId, [task]), false);
    assert.equal(canUpdateTask(actor, task), false);
    assert.throws(() => parseTaskUpdate(actor, task, { status: "done", revision: 2 }), TeamPermissionError);
  }
});

test("Les responsables ont accès aux projets sans affectation", () => {
  for (const role of ["admin", "manager"] as const) {
    assert.equal(canAccessProject(user(role), projectId, []), true);
    assert.equal(canUploadToProject(user(role), projectId, []), true);
    assert.equal(canUpdateTask(user(role), { ...task, assigneeId: otherUserId }), true);
  }
});

test("Un technicien accède au projet et dépose son travail seulement s’il y est affecté", () => {
  for (const role of ["technician", "technician_pro"] as const) {
    assert.equal(canAccessProject(user(role), projectId, [task]), true);
    assert.equal(canUploadToProject(user(role), projectId, [task]), true);
    assert.equal(canAccessProject(user(role), projectId, []), false);
    assert.equal(canAccessProject(user(role), otherProjectId, [task]), false);
    assert.equal(canAccessProject(user(role), projectId, [{ ...task, assigneeId: otherUserId }]), false);
    assert.equal(canUploadToProject(user(role), projectId, [{ ...task, assigneeId: otherUserId }]), false);
  }
});

test("Le droit IA Pro ne donne aucun droit de gestion ou d’accès aux projets tiers", () => {
  const actor = user("technician_pro");
  assert.equal(canUseAi(actor), true);
  assert.equal(canManageTeam(actor), false);
  assert.equal(canManageProjects(actor), false);
  assert.equal(canAccessProject(actor, otherProjectId, [task]), false);
  assert.equal(canUpdateTask(actor, { ...task, assigneeId: otherUserId }), false);
});

test("Un technicien modifie son avancement mais ne peut s’attribuer une tâche tierce", () => {
  for (const role of ["technician", "technician_pro"] as const) {
    const actor = user(role);
    assert.deepEqual(parseTaskUpdate(actor, task, { status: "in_progress", revision: 2 }), { status: "in_progress", revision: 2 });
    assert.throws(() => parseTaskUpdate(actor, { ...task, assigneeId: otherUserId }, { status: "done", revision: 2 }), TeamPermissionError);
    for (const extra of [
      { assigneeId: otherUserId }, { title: "Tâche redéfinie" }, { description: "Autre périmètre" },
      { stepId: "etudes" }, { stepId: null }, { dueDate: null }, { projectId: otherProjectId }, { role: "admin" }, { active: true },
    ]) {
      assert.throws(() => parseTaskUpdate(actor, task, { status: "done", revision: 2, ...extra }));
    }
  }
});

test("Un responsable modifie la tâche mais ne peut modifier ses identifiants ni ses dates système", () => {
  const update = { title: " Relevé complet ", assigneeId: otherUserId, dueDate: null, status: "in_progress", revision: 2 };
  assert.deepEqual(parseTaskUpdate(user("manager"), task, update), { ...update, title: "Relevé complet" });
  for (const extra of [{ id: otherProjectId }, { projectId: otherProjectId }, { createdAt: task.createdAt }, { role: "admin" }]) {
    assert.throws(() => parseTaskUpdate(user("admin"), task, { ...update, ...extra }));
  }
  assert.equal(taskUpdateSchema.safeParse({ revision: 2 }).success, false);
  assert.equal(taskUpdateSchema.safeParse({ revision: 2, title: undefined }).success, false);
});

test("Une mise à jour exige une révision valide et refuse une version périmée", () => {
  for (const role of teamRoleSchema.options) {
    assert.throws(() => parseTaskUpdate(user(role), task, { status: "done", revision: 1 }), TaskRevisionConflictError);
    for (const revision of [undefined, -1, 1.5, "2"]) {
      assert.throws(() => parseTaskUpdate(user(role), task, { status: "done", revision }));
    }
  }
  assert.equal(task.status, "todo", "La validation ne modifie jamais l’objet source");
  assert.equal(task.revision, 2);
});

test("La création refuse les champs système, les rôles injectés et les dates inexistantes", () => {
  const input = { title: "  Visite du site  ", assigneeId: userId };
  assert.deepEqual(taskCreateSchema.parse(input), { title: "Visite du site", assigneeId: userId, description: "", dueDate: null, stepId: null });
  for (const extra of [
    { id: task.id }, { projectId }, { status: "done" }, { revision: 9 }, { role: "admin" },
    { dueDate: "2026-02-30" }, { dueDate: "2026-10-05T12:00:00Z" }, { assigneeId: "" }, { title: "   " },
  ]) {
    assert.equal(taskCreateSchema.safeParse({ ...input, ...extra }).success, false);
  }
  assert.deepEqual(projectTaskSchema.parse(task), task);
});

test("Le profil public valide les rôles et ne contient ni mot de passe ni jeton", () => {
  const actor = user("admin");
  assert.deepEqual(teamUserSchema.parse(actor), actor);
  for (const extra of [{ passwordHash: "secret" }, { sessionToken: "secret" }, { role: "owner" }, { active: "true" }]) {
    assert.equal(teamUserSchema.safeParse({ ...actor, ...extra }).success, false);
  }
});


test("Les anciennes tâches restent générales et les étapes sont validées", () => {
  const legacy = { ...task } as Partial<ProjectTask>;
  delete legacy.stepId;
  assert.equal(projectTaskSchema.parse(legacy).stepId, null);
  assert.equal(taskCreateSchema.parse({ title: "Calcul", assigneeId: userId, stepId: "etudes" }).stepId, "etudes");
  assert.equal(taskCreateSchema.safeParse({ title: "Calcul", assigneeId: userId, stepId: "inconnue" }).success, false);
});

test("Les responsables peuvent rattacher, déplacer et détacher une tâche sans changer son projet", () => {
  for (const role of ["admin", "manager"] as const) {
    for (const stepId of ["etudes", "livrables", null]) {
      assert.deepEqual(parseTaskUpdate(user(role), task, { stepId, revision: 2 }), { stepId, revision: 2 });
    }
  }
  const patch = parseTaskUpdate(user("technician"), { ...task, stepId: "etudes" }, { status: "done", revision: 2 });
  assert.equal(Object.hasOwn(patch, "stepId"), false, "L’avancement seul ne supprime pas le rattachement");
  assert.equal(taskUpdateSchema.safeParse({ stepId: "inconnue", revision: 2 }).success, false);
});
