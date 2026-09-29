"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Pencil, Plus, RefreshCw, Upload } from "lucide-react";
import { canManageProjects, TASK_STATUS_LABELS, taskStatusSchema, type ProjectTask, type TaskCreateInput, type TaskUpdateInput, type TeamUser } from "@/lib/team";
import { teamRequest } from "@/lib/team-client";
import { projectSteps, stepIdSchema, WORKFLOW_STEPS, type CivilProject, type StepId } from "@/lib/projects";
import { useTeam } from "./TeamProvider";
import { ProjetDialog } from "./ProjetDialog";

type TaskDialog = { type: "list" | "new"; stepId: StepId | null } | { type: "edit"; task: ProjectTask };

export function useProjectTasks(project: CivilProject) {
  const { user, mode } = useTeam();
  const enabled = mode === "team";
  const canManage = canManageProjects(user);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [members, setMembers] = useState<TeamUser[]>([]);
  const [ready, setReady] = useState(false);
  const requestVersion = useRef(0);
  const operation = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<TaskDialog | null>(null);
  const base = `/api/projects/${encodeURIComponent(project.id)}/tasks`;
  const refresh = useCallback(async () => {
    if (!enabled || operation.current) return;
    const request = ++requestVersion.current;
    try {
      const [result, team] = await Promise.all([teamRequest<{ tasks: ProjectTask[] }>(base), canManage ? teamRequest<{ users: TeamUser[] }>("/api/team/members") : Promise.resolve({ users: [] })]);
      if (request !== requestVersion.current) return;
      setTasks(result.tasks); setMembers(team.users); setError("");
    } catch (reason) {
      if (request === requestVersion.current) setError(reason instanceof Error ? reason.message : "Impossible de charger les tâches.");
    } finally { if (request === requestVersion.current) setReady(true); }
  }, [base, canManage, enabled]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => { window.clearInterval(interval); requestVersion.current += 1; };
  }, [refresh]);

  async function save(input: TaskCreateInput | TaskUpdateInput, task?: ProjectTask) {
    if (operation.current) return;
    operation.current = true; requestVersion.current += 1;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await teamRequest<{ task: ProjectTask }>(task ? `${base}/${encodeURIComponent(task.id)}` : base, {
        method: task ? "PATCH" : "POST", body: JSON.stringify(task ? { ...input, revision: task.revision } : input),
      });
      setTasks(previous => task ? previous.map(value => value.id === result.task.id ? result.task : value) : [...previous, result.task]);
      setNotice(task ? "Tâche mise à jour." : "Tâche créée et affectée.");
      setDialog({ type: "list", stepId: result.task.stepId });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible d’enregistrer cette tâche."); }
    finally { operation.current = false; setBusy(false); }
  }
  function open(next: TaskDialog) { if (!busy) { setDialog(next); setNotice(""); } }
  return { tasks: canManage ? tasks : tasks.filter(task => task.assigneeId === user?.id), members, enabled, canManage, ready, busy, error, notice, dialog, open, close: () => setDialog(null), refresh, save };
}

export function ProjectTaskDialogs({ project, controller, onUpload }: {
  project: CivilProject; controller: ReturnType<typeof useProjectTasks>; onUpload: () => void;
}) {
  const { tasks, members, canManage, busy, error, notice, dialog, open, close, refresh, save } = controller;
  if (!dialog) return null;
  const editing = dialog.type === "edit" ? dialog.task : null;
  const stepId = dialog.type === "edit" ? dialog.task.stepId : dialog.stepId;
  const step = WORKFLOW_STEPS.find(value => value.id === stepId);
  const label = step?.title ?? "Tâches sans étape";
  const activeMembers = members.filter(member => member.active || member.id === editing?.assigneeId);
  const visibleTasks = tasks.filter(task => (task.stepId ?? null) === stepId);
  const isForm = dialog.type !== "list";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    const values = new FormData(event.currentTarget);
    const input: TaskCreateInput = {
      title: String(values.get("title") ?? ""), description: String(values.get("description") ?? ""),
      assigneeId: String(values.get("assigneeId") ?? ""), dueDate: String(values.get("dueDate") ?? "") || null,
      stepId: editing ? (values.get("stepId") ? stepIdSchema.parse(values.get("stepId")) : null) : stepId,
    };
    await save(input, editing ?? undefined);
  }
  return <ProjetDialog key={isForm ? editing?.id ?? `new-${stepId}` : `list-${stepId}`} title={isForm ? editing ? "Modifier la tâche" : "Ajouter une tâche" : label} busy={busy} onClose={close}>
    <p className="project-dialog-intro task-project-context">{project.name} <span> / {label}</span></p>
    {error && <p className="project-error" role="alert">{error}</p>}
    {notice && <p className="project-success" role="status">{notice}</p>}
    {isForm && canManage ? <form className="team-task-form" onSubmit={submit}>
      <label className="field-label">Travail demandé<input name="title" required maxLength={200} defaultValue={editing?.title} disabled={busy}/></label>
      {editing && <label className="field-label">Étape du projet<select name="stepId" defaultValue={editing.stepId ?? ""} disabled={busy}><option value="">Tâche générale du projet</option>{projectSteps(project).map(value => <option key={value.id} value={value.id}>{value.title}</option>)}</select></label>}
      <label className="field-label">Consignes<textarea name="description" rows={3} maxLength={6000} defaultValue={editing?.description} disabled={busy}/></label>
      <div className="team-form-grid"><label className="field-label">Affecter à<select name="assigneeId" required defaultValue={editing?.assigneeId ?? ""} disabled={busy}><option value="" disabled>Choisir un collaborateur</option>{activeMembers.map(member => <option key={member.id} value={member.id}>{member.name}{member.active ? "" : " (désactivé)"}</option>)}</select></label><label className="field-label">Échéance<input name="dueDate" type="date" defaultValue={editing?.dueDate ?? ""} disabled={busy}/></label></div>
      {!activeMembers.length && <p className="project-hint">Un administrateur doit d’abord créer les comptes de l’équipe.</p>}
      <footer className="project-dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => open({ type: "list", stepId })}>Annuler</button><button className="primary-button" type="submit" disabled={busy || !activeMembers.length}>{busy && <LoaderCircle size={16} className="animate-spin"/>}{editing ? "Enregistrer" : "Créer et affecter"}</button></footer>
    </form> : <>
      <div className="team-actions task-dialog-actions"><button className="icon-button" type="button" aria-label="Actualiser les tâches" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16}/></button>{canManage && stepId && <button className="secondary-button" type="button" disabled={busy} onClick={() => open({ type: "new", stepId })}><Plus size={16}/> Ajouter une tâche</button>}</div>
      {!visibleTasks.length ? <p className="team-empty">{canManage ? "Aucune tâche pour cette étape." : "Aucune tâche ne vous est affectée ici."}</p> : <ul className="team-task-list">{visibleTasks.map(task => <li key={task.id} className={task.status === "done" ? "is-done" : ""}>
        <div className="team-task-info"><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}<div className="team-task-meta">{canManage && <span>{members.find(member => member.id === task.assigneeId)?.name ?? "Collaborateur"}</span>}{task.dueDate && <time dateTime={task.dueDate}>Échéance : {new Intl.DateTimeFormat("fr-FR").format(new Date(`${task.dueDate}T12:00:00`))}</time>}</div></div>
        <div className="team-task-controls"><label className="field-label"><span className="sr-only">Avancement de {task.title}</span><select value={task.status} disabled={busy} onChange={event => void save({ status: event.target.value as ProjectTask["status"], revision: task.revision }, task)}>{taskStatusSchema.options.map(status => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}</select></label>{canManage && <button className="icon-button" type="button" aria-label={`Modifier la tâche ${task.title}`} disabled={busy} onClick={() => open({ type: "edit", task })}><Pencil size={16}/></button>}<button className="secondary-button" type="button" disabled={busy} onClick={() => { close(); onUpload(); }}><Upload size={15}/> Déposer le travail</button></div>
      </li>)}</ul>}
    </>}
  </ProjetDialog>;
}
