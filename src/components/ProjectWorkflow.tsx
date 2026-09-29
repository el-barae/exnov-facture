"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCheck, ClipboardCheck, FileCheck2, FileText, Flag, LayoutGrid, LoaderCircle, MapPin, Plus, Receipt, SkipForward, Upload, Users, Wrench } from "lucide-react";
import { currentProjectStep, missingDocuments, requiredDocuments, WORKFLOW_STEPS, type CivilProject, type StepId } from "@/lib/projects";
import { ProjectTaskDialogs, useProjectTasks } from "./ProjectTasks";

const STEP_ICONS = { cadrage: Users, visite: MapPin, diagnostic: ClipboardCheck, chiffrage: Receipt, etudes: Wrench, livrables: FileText, validation: BadgeCheck, facturation: FileCheck2, cloture: Flag };
const PAGE_SIZE = 3;

export function ProjectWorkflow({ project, busy, canManage, onStep, onUpload }: {
  project: CivilProject; busy: boolean; canManage: boolean; onStep: (stepId: StepId) => void; onUpload: () => void;
}) {
  const tasks = useProjectTasks(project);
  const current = currentProjectStep(project);
  const currentPage = Math.floor((current ? WORKFLOW_STEPS.findIndex(step => step.id === current.id) : WORKFLOW_STEPS.length - 1) / PAGE_SIZE);
  const [navigation, setNavigation] = useState({ anchor: current?.id, page: currentPage });
  const page = navigation.anchor === current?.id ? navigation.page : currentPage;
  const pageCount = Math.ceil(WORKFLOW_STEPS.length / PAGE_SIZE);
  const displayed = WORKFLOW_STEPS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const missing = current ? missingDocuments(project, current.id) : [];
  const generalTasks = tasks.tasks.filter(task => !task.stepId);
  const blocked = busy || tasks.busy;
  const navigate = (value: number) => setNavigation({ anchor: current?.id, page: value });
  return <section className="project-workflow-panel" aria-labelledby="project-workflow-title">
    <div className="project-panel-heading"><div><h3 id="project-workflow-title"><LayoutGrid size={17}/> Workflow du projet</h3><p>{canManage ? "Suivez les étapes et affectez les tâches de votre équipe." : "Retrouvez votre travail dans chaque étape du projet."}</p></div><div className="project-legend"><span><i className="completed"/>Validée</span><span><i className="current"/>En cours</span><span><i/>À venir</span></div></div>
    {tasks.error && !tasks.dialog && <p className="project-error" role="alert">{tasks.error} <button className="project-text-button" type="button" onClick={() => void tasks.refresh()}>Réessayer</button></p>}
    <div className="project-workflow-carousel" role="group" aria-label="Étapes du projet">
      <button className="workflow-arrow" type="button" aria-label="Étapes précédentes" disabled={page === 0 || blocked} onClick={() => navigate(page - 1)}><ArrowLeft size={20}/></button>
      <ol className="project-workflow" start={page * PAGE_SIZE + 1}>{displayed.map((step, index) => {
        const completed = project.completedSteps.some(value => value.stepId === step.id);
        const isCurrent = current?.id === step.id;
        const skipped = step.id === "chiffrage" && !project.withBdp;
        const status = skipped ? "skipped" : completed ? "completed" : isCurrent ? "current" : "upcoming";
        const needed = requiredDocuments(project, step.id);
        const remaining = missingDocuments(project, step.id);
        const assigned = tasks.tasks.filter(task => task.stepId === step.id);
        const Icon = STEP_ICONS[step.id];
        const statusLabel = skipped ? "Non applicable" : completed ? "Validée" : isCurrent ? "En cours" : "À venir";
        return <li key={step.id} className={`project-step-item ${status}`}>
          <button type="button" className="project-step" data-step={step.id} data-status={status} aria-current={isCurrent ? "step" : undefined} aria-label={`${step.title} — ${statusLabel} — ${canManage ? "consulter ou valider" : "voir mon travail"}`} disabled={blocked || (!canManage && (skipped || !tasks.ready))} onClick={() => canManage ? onStep(step.id) : tasks.open({ type: "list", stepId: step.id })}>
            <span className="project-step-top"><span className="project-step-icon">{completed ? <Check size={19}/> : skipped ? <SkipForward size={19}/> : <Icon size={19}/>}</span><span className="project-step-number">{String(page * PAGE_SIZE + index + 1).padStart(2, "0")}</span></span>
            <strong>{step.title}</strong><span className="project-step-status">{isCurrent && <span/>}{statusLabel}</span>
            <span className="project-step-documents">{skipped ? "Hors périmètre" : step.id === "cloture" ? "Validation de la fin du projet" : canManage ? needed.length ? <><FileText size={12}/>{needed.length - remaining.length}/{needed.length} pièce{needed.length > 1 ? "s" : ""}</> : "Sans pièce obligatoire" : "Vos tâches dans cette étape"}</span>
          </button>
          {tasks.enabled && !skipped && <div className="project-step-actions">
            <button type="button" className="step-task-count" aria-label={`Voir les tâches : ${step.title}`} disabled={blocked || !tasks.ready} onClick={() => tasks.open({ type: "list", stepId: step.id })}>{!tasks.ready ? "Chargement…" : <><strong>{assigned.filter(task => task.status === "done").length}/{assigned.length}</strong> {canManage ? "tâches terminées" : "de mes tâches"}</>}</button>
            {canManage && <button type="button" className="step-add-task" aria-label={`Ajouter une tâche : ${step.title}`} disabled={blocked || !tasks.ready} onClick={() => tasks.open({ type: "new", stepId: step.id })}><Plus size={15}/><span>Ajouter une tâche</span></button>}
          </div>}
        </li>;
      })}</ol>
      <button className="workflow-arrow" type="button" aria-label="Étapes suivantes" disabled={page === pageCount - 1 || blocked} onClick={() => navigate(page + 1)}><ArrowRight size={20}/></button>
    </div>
    <div className="workflow-pagination"><span aria-live="polite">Étapes {page * PAGE_SIZE + 1} à {Math.min((page + 1) * PAGE_SIZE, WORKFLOW_STEPS.length)} sur {WORKFLOW_STEPS.length}</span><div aria-label="Groupes d’étapes">{Array.from({ length: pageCount }, (_, index) => <button key={index} type="button" aria-label={`Afficher les étapes ${index * PAGE_SIZE + 1} à ${(index + 1) * PAGE_SIZE}`} aria-current={page === index ? "true" : undefined} disabled={blocked} onClick={() => navigate(index)}><span/></button>)}</div>{tasks.enabled && generalTasks.length > 0 && <button className="project-text-button" type="button" disabled={blocked} onClick={() => tasks.open({ type: "list", stepId: null })}>Tâches sans étape ({generalTasks.length})</button>}</div>
    {canManage && (current ? <div className="project-next-action"><div className="project-next-icon"><ArrowRight size={20}/></div><div><span>À FAIRE MAINTENANT</span><strong>{current.title}</strong><p>{current.id === "cloture" ? "Les étapes précédentes sont validées. Confirmez la fin de la mission." : missing.length ? `${missing.length} document${missing.length > 1 ? "s" : ""} requis${missing.length > 1 ? " restent" : " reste"} à joindre.` : "Les documents requis sont présents. Vous pouvez valider cette étape."}</p></div><button type="button" className="primary-button" disabled={blocked} onClick={() => onStep(current.id)}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : missing.length ? <Upload size={16}/> : <Check size={16}/>} {current.id === "cloture" ? "Valider la fin du projet" : missing.length ? "Fournir les documents" : "Valider l’étape"}</button></div>
      : <div className="project-completed-banner"><CheckCheck size={23}/><div><strong>La fin du projet est validée.</strong><p>Le dossier et ses documents restent consultables. Le règlement de la facture est à suivre séparément.</p></div></div>)}
    <ProjectTaskDialogs project={project} controller={tasks} onUpload={onUpload}/>
  </section>;
}
