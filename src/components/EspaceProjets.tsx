"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, BadgeCheck, Building2, Check, CheckCheck, ChevronRight, Circle, ClipboardCheck, Clock3, FileCheck2, FileText, FolderClosed, FolderOpen, FolderPlus, HardDrive, LayoutGrid, LoaderCircle, LockKeyhole, MapPin, Pencil, Plus, Receipt, RotateCcw, Search, SkipForward, Trash2, Upload, Users, Wrench } from "lucide-react";
import { attachProjectFile, getProjectFile, loadProjects, storeNewProject, subscribeToProjectChanges, updateStoredProject } from "@/lib/project-storage";
import { currentProjectStep, DOCUMENT_KINDS, documentLabel, missingDocuments, PROJECT_FILE_ACCEPT, projectProgress, projectSteps, requiredDocuments, WORKFLOW_STEPS, type CivilProject, type DocumentKind, type ProjectDetails, type ProjectDocument, type StepId } from "@/lib/projects";
import { FormulaireProjet } from "./FormulaireProjet";
import { ProjetDialog } from "./ProjetDialog";

const STEP_ICONS = { cadrage: Users, visite: MapPin, diagnostic: ClipboardCheck, chiffrage: Receipt, etudes: Wrench, livrables: FileText, validation: BadgeCheck, facturation: FileCheck2 };
function dateLabel(value: string, time = false) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", ...(time ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }) }).format(new Date(value));
}
function fileSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} Ko` : `${(size / (1024 * 1024)).toFixed(1)} Mo`; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Une erreur est survenue. Réessayez."; }
function mergeProject(projects: CivilProject[], updated: CivilProject) {
  if (projects.some(project => project.id === updated.id && project.revision > updated.revision)) return projects;
  return [...projects.filter(project => project.id !== updated.id), updated].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function UploadDocument({ kind, label = "Joindre le document", busy, onUpload }: { kind: DocumentKind; label?: string; busy: boolean; onUpload: (kind: DocumentKind, file: File) => void }) {
  const id = useId();
  return <label htmlFor={id} className={`secondary-button project-upload-button ${busy ? "is-disabled" : ""}`}>
    <Upload size={15}/><span>{label}</span>
    <input id={id} className="sr-only" type="file" data-upload-kind={kind} accept={PROJECT_FILE_ACCEPT} disabled={busy} onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) onUpload(kind, file);
    }}/>
  </label>;
}

function StepDialog({ project, stepId, busy, error, onClose, onComplete, onUpload, onDownload, onReopen }: {
  project: CivilProject; stepId: StepId; busy: boolean; error: string; onClose: () => void;
  onComplete: () => void; onUpload: (kind: DocumentKind, file: File) => void; onDownload: (doc: ProjectDocument) => void; onReopen: () => void;
}) {
  const [confirmReopen, setConfirmReopen] = useState(false);
  const step = WORKFLOW_STEPS.find(item => item.id === stepId)!;
  const current = currentProjectStep(project);
  const completion = project.completedSteps.find(item => item.stepId === stepId);
  const missing = missingDocuments(project, stepId);
  const required = requiredDocuments(project, stepId);
  const skipped = stepId === "chiffrage" && !project.withBdp;
  const isCurrent = current?.id === stepId;
  const optional = project.documents.filter(doc => !required.some(kind => kind.id === doc.kind) && DOCUMENT_KINDS.find(kind => kind.id === doc.kind)?.stepId === stepId);
  return <ProjetDialog title={step.title} busy={busy} onClose={onClose}>
    <p className="project-dialog-intro">{step.description}</p>
    {skipped ? <p className="project-info">Le chiffrage BDP n’est pas prévu dans cette mission.</p> : <>
      {completion ? <p className="project-success"><CheckCheck size={17}/> Étape validée le {dateLabel(completion.completedAt, true)}.</p>
        : isCurrent ? <p className={`project-step-notice ${missing.length ? "needs-documents" : "ready"}`}>{missing.length ? <Upload size={18}/> : <Check size={18}/>}<span>{missing.length ? `${missing.length} pièce${missing.length > 1 ? "s" : ""} manquante${missing.length > 1 ? "s" : ""} pour valider cette étape.` : "Cette étape est prête à être validée."}</span></p>
        : <p className="project-info"><LockKeyhole size={16}/> Vous pouvez préparer les documents. Validez d’abord « {current?.title} » pour avancer dans l’ordre.</p>}
      <div className="project-required-files">
        {required.map(kind => {
          const documents = project.documents.filter(doc => doc.kind === kind.id);
          return <div key={kind.id} className={`project-required-file ${documents.length ? "is-present" : "is-missing"}`}>
            <div className="project-required-file-title">{documents.length ? <Check size={17}/> : <FileText size={17}/>}<strong>{kind.label}</strong><span>{documents.length ? "Fourni" : "Requis"}</span></div>
            {documents.length ? documents.map(doc => <button type="button" key={doc.id} className="project-attached-file" disabled={busy} onClick={() => onDownload(doc)}><span>{doc.name}</span><ArrowDownToLine size={15}/></button>) : <UploadDocument kind={kind.id} busy={busy} onUpload={onUpload}/>}
          </div>;
        })}
        {!required.length && <p className="project-hint">Aucun document obligatoire pour cette étape.</p>}
        {optional.map(doc => <button key={doc.id} type="button" className="project-attached-file" disabled={busy} onClick={() => onDownload(doc)}><span>{doc.name}</span><ArrowDownToLine size={15}/></button>)}
      </div>
      {missing.length > 0 && <p className="project-hint">PDF, Word, Excel, images, DWG/DXF ou ZIP · 20 Mo maximum par fichier. Les pièces déjà fournies sont réutilisées.</p>}
      {confirmReopen && <div className="project-reopen-confirm"><strong>Reprendre à cette étape ?</strong><p>Cette validation et toutes les suivantes seront annulées. Les documents et l’historique resteront dans le dossier.</p><button type="button" className="secondary-button" disabled={busy} onClick={onReopen}><RotateCcw size={15}/> Confirmer la reprise</button></div>}
    </>}
    {error && <p className="project-error" role="alert">{error}</p>}
    <footer className="project-dialog-actions">
      {completion && !confirmReopen && <button type="button" className="project-text-button" disabled={busy} onClick={() => setConfirmReopen(true)}><RotateCcw size={14}/> Reprendre à cette étape</button>}
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Fermer</button>
      {isCurrent && <button type="button" className="primary-button" disabled={busy || missing.length > 0} onClick={onComplete}>{busy ? <LoaderCircle className="animate-spin" size={17}/> : <Check size={17}/>} Valider l’étape</button>}
    </footer>
  </ProjetDialog>;
}

export function EspaceProjets() {
  const [projects, setProjects] = useState<CivilProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const operationRunning = useRef(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const [form, setForm] = useState<"new" | CivilProject | null>(null);
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [uploadKind, setUploadKind] = useState<DocumentKind>("devis");
  const [documentToRemove, setDocumentToRemove] = useState<ProjectDocument | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const project = projects.find(value => value.id === selectedId);

  useEffect(() => {
    let mounted = true;
    const refresh = () => { void loadProjects().then(values => {
      if (!mounted) return;
      setProjects(previous => {
        // Une lecture démarrée avant une écriture ne remplace pas une révision plus récente.
        let merged = previous;
        for (const value of values) if (!merged.some(item => item.id === value.id && item.revision > value.revision)) merged = mergeProject(merged, value);
        return merged;
      });
      setSelectedId(value => value ?? values[0]?.id ?? null);
      setLoadError(""); setReady(true);
    }).catch(reason => { if (mounted) { setLoadError(errorMessage(reason)); setReady(true); } }); };
    refresh();
    const unsubscribe = subscribeToProjectChanges(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [loadAttempt]);

  async function run(operation: () => Promise<CivilProject>, message: string, after?: () => void) {
    if (operationRunning.current) return;
    operationRunning.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const updated = await operation();
      setProjects(values => mergeProject(values, updated)); setSelectedId(updated.id);
      setNotice(message); after?.();
    } catch (reason) {
      setError(errorMessage(reason));
      // Actualiser aussi après un conflit de révision, sans effacer le message ni le formulaire.
      try {
        const latest = await loadProjects();
        setProjects(previous => latest.reduce(mergeProject, previous));
        setForm(previous => previous && previous !== "new" ? latest.find(value => value.id === previous.id) ?? previous : previous);
      } catch { /* Le message d’erreur de l’action reste visible. */ }
    } finally { operationRunning.current = false; setBusy(false); }
  }
  function selectProject(value: CivilProject) {
    setSelectedId(value.id); setActiveStep(null); setError(""); setNotice(""); setUploadKind("devis");
  }
  function completeStep(stepId: StepId) {
    if (!project) return;
    const step = WORKFLOW_STEPS.find(value => value.id === stepId)!;
    void run(() => updateStoredProject(project, { type: "complete", stepId }), `« ${step.title} » validée.`, () => setActiveStep(null));
  }
  function clickStep(stepId: StepId) {
    if (!project || busy) return;
    setError(""); setNotice("");
    if (currentProjectStep(project)?.id === stepId && !missingDocuments(project, stepId).length) completeStep(stepId);
    else setActiveStep(stepId);
  }
  function upload(kind: DocumentKind, file: File) {
    if (project) void run(() => attachProjectFile(project, kind, file), `« ${file.name} » ajouté au dossier.`);
  }
  async function download(doc: ProjectDocument) {
    if (!project) return;
    setError("");
    try {
      const blob = await getProjectFile(project.id, doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = doc.name; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (reason) { setError(errorMessage(reason)); }
  }
  function saveDetails(details: ProjectDetails) {
    const editing = form !== "new" && form !== null ? form : undefined;
    void run(() => editing ? updateStoredProject(editing, { type: "edit", details }) : storeNewProject(details), editing ? "Projet mis à jour." : "Projet créé. Vous pouvez commencer le suivi.", () => { setForm(null); setQuery(""); setFilter("all"); });
  }
  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const visibleProjects = projects.filter(value => {
    const done = !currentProjectStep(value);
    return (filter === "all" || (filter === "done" ? done : !done)) && `${value.name} ${value.client} ${value.site} ${value.reference}`.toLocaleLowerCase("fr").includes(normalizedQuery);
  });
  const current = project ? currentProjectStep(project) : undefined;
  const missing = project && current ? missingDocuments(project, current.id) : [];

  return <main className="workspace projects-workspace">
    <header className="page-heading projects-page-heading"><div><div className="eyebrow"><span/> LE SUIVI DE VOS MISSIONS</div><h1>Projets</h1><p>Du premier échange aux livrables, chaque étape à sa place.</p></div><button type="button" className="primary-button" disabled={!ready || busy || !!loadError} onClick={() => { setError(""); setForm("new"); }}><Plus size={17}/> Nouveau projet</button></header>
    <div className="projects-layout">
      <aside className="projects-sidebar" aria-label="Liste des projets">
        <div className="projects-sidebar-title"><span><FolderClosed size={17}/> Mes projets</span><span className="projects-count">{projects.length}</span></div>
        <label className="projects-search"><Search size={16}/><input aria-label="Rechercher un projet" placeholder="Rechercher un projet…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <div className="projects-filters" aria-label="Filtrer les projets">{([["all", "Tous"], ["active", "En cours"], ["done", "Terminés"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <nav className="projects-list" aria-label="Projets existants">
          {!ready && <p className="project-sidebar-empty"><LoaderCircle className="animate-spin" size={17}/> Chargement des projets…</p>}
          {ready && !visibleProjects.length && <p className="project-sidebar-empty">{projects.length ? "Aucun projet ne correspond à votre recherche." : "Vos projets apparaîtront ici."}</p>}
          {visibleProjects.map(value => {
            const step = currentProjectStep(value);
            return <button type="button" key={value.id} className={`project-nav-item ${selectedId === value.id ? "is-selected" : ""}`} aria-current={selectedId === value.id ? "true" : undefined} disabled={busy} onClick={() => selectProject(value)}>
              <span className="project-nav-title"><FolderOpen size={16}/><strong>{value.name}</strong><ChevronRight size={14}/></span>
              <span className="project-nav-client">{value.client}</span>
              <span className="project-nav-status"><span className={step ? "" : "is-done"}>{step ? step.title : "Terminé"}</span><span>{projectProgress(value)} %</span></span>
              <span className="project-nav-progress"><span style={{ width: `${projectProgress(value)}%` }}/></span>
            </button>;
          })}
        </nav>
        <div className="projects-storage-note"><HardDrive size={16}/><p>Projets et fichiers enregistrés dans ce navigateur. Ils ne sont pas synchronisés entre appareils.</p></div>
      </aside>
      <section className="projects-content" aria-label="Suivi du projet">
        {loadError ? <div className="project-empty-state"><HardDrive size={36}/><h2>Le stockage est indisponible</h2><p role="alert">{loadError}</p><button type="button" className="secondary-button" onClick={() => setLoadAttempt(value => value + 1)}><RotateCcw size={16}/> Réessayer</button></div>
          : !ready ? <div className="project-empty-state"><LoaderCircle className="animate-spin" size={32}/><p>Ouverture de vos dossiers…</p></div>
          : !project ? <div className="project-empty-state"><div className="project-empty-icon"><FolderPlus size={38}/></div><span className="eyebrow">VOS PROJETS DE GÉNIE CIVIL</span><h2>Un parcours clair pour chaque mission.</h2><p>Créez votre premier projet, rassemblez ses documents et suivez son avancement, étape par étape.</p><div className="project-empty-journey"><span>Devis</span><ArrowRight size={15}/><span>Études</span><ArrowRight size={15}/><span>Livrables</span></div><button type="button" className="primary-button" onClick={() => { setError(""); setForm("new"); }}><Plus size={16}/> Créer mon premier projet</button></div>
          : <>
            <header className="project-overview">
              <div className="project-overview-top"><span className="project-reference">{project.reference || "DOSSIER PROJET"}</span><span className={`project-status-badge ${current ? "" : "is-complete"}`}>{current ? <Clock3 size={13}/> : <CheckCheck size={13}/>} {current ? "En cours" : "Terminé"}</span><button type="button" className="icon-button" aria-label="Modifier le projet" disabled={busy} onClick={() => { setError(""); setForm(project); }}><Pencil size={16}/></button></div>
              <h2>{project.name}</h2>
              <div className="project-meta"><span><Building2 size={14}/>{project.client}</span>{project.site && <span><MapPin size={14}/>{project.site}</span>}<span><Clock3 size={14}/>Créé le {dateLabel(project.createdAt)}</span></div>
              <div className="project-progress-heading"><span><strong>{project.completedSteps.length}</strong> / {projectSteps(project).length} étapes validées</span><strong>{projectProgress(project)} %</strong></div>
              <div className="project-progress-track" role="progressbar" aria-label="Avancement du projet" aria-valuenow={projectProgress(project)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${projectProgress(project)}%` }}/></div>
            </header>
            <div aria-live="polite">{notice && <p className="project-success project-page-message"><Check size={16}/>{notice}</p>}</div>
            {error && !form && !activeStep && !documentToRemove && <p role="alert" className="project-error project-page-message">{error}</p>}
            <section className="project-workflow-panel" aria-labelledby="project-workflow-title">
              <div className="project-panel-heading"><div><h3 id="project-workflow-title"><LayoutGrid size={17}/> Workflow du projet</h3><p>Cliquez sur l’étape en cours pour valider votre avancement.</p></div><div className="project-legend"><span><i className="completed"/>Validée</span><span><i className="current"/>En cours</span><span><i/>À venir</span></div></div>
              <ol className="project-workflow">{WORKFLOW_STEPS.map((step, index) => {
                const completed = project.completedSteps.some(value => value.stepId === step.id);
                const isCurrent = current?.id === step.id;
                const skipped = step.id === "chiffrage" && !project.withBdp;
                const status = skipped ? "skipped" : completed ? "completed" : isCurrent ? "current" : "upcoming";
                const needed = requiredDocuments(project, step.id);
                const remaining = missingDocuments(project, step.id);
                const Icon = STEP_ICONS[step.id];
                const statusLabel = skipped ? "Non applicable" : completed ? "Validée" : isCurrent ? "En cours" : "À venir";
                return <li key={step.id} className={`project-step-item ${status}`}>
                  <button type="button" className="project-step" data-step={step.id} data-status={status} aria-current={isCurrent ? "step" : undefined} aria-label={`${step.title} — ${statusLabel}${isCurrent ? remaining.length ? " — fournir les documents pour avancer" : " — cliquer pour valider" : " — consulter"}`} disabled={busy} onClick={() => clickStep(step.id)}>
                    <span className="project-step-top"><span className="project-step-icon">{completed ? <Check size={19}/> : skipped ? <SkipForward size={19}/> : <Icon size={19}/>}</span><span className="project-step-number">{String(index + 1).padStart(2, "0")}</span></span>
                    <strong>{step.title}</strong><span className="project-step-status">{isCurrent && <span/>}{statusLabel}</span>
                    <span className="project-step-documents">{skipped ? "Hors périmètre" : needed.length ? <><FileText size={12}/>{needed.length - remaining.length}/{needed.length} pièce{needed.length > 1 ? "s" : ""}</> : "Sans pièce obligatoire"}</span>
                  </button>
                  {index < WORKFLOW_STEPS.length - 1 && <ArrowRight size={15} className="project-step-connector" aria-hidden="true"/>}
                </li>;
              })}</ol>
              {current ? <div className="project-next-action"><div className="project-next-icon"><ArrowRight size={20}/></div><div><span>À FAIRE MAINTENANT</span><strong>{current.title}</strong><p>{missing.length ? `${missing.length} document${missing.length > 1 ? "s" : ""} requis${missing.length > 1 ? " restent" : " reste"} à joindre.` : "Les documents requis sont présents. Vous pouvez valider cette étape."}</p></div><button type="button" className="primary-button" disabled={busy} onClick={() => clickStep(current.id)}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : missing.length ? <Upload size={16}/> : <Check size={16}/>} {missing.length ? "Fournir les documents" : "Valider l’étape"}</button></div>
                : <div className="project-completed-banner"><CheckCheck size={23}/><div><strong>Toutes les étapes sont validées.</strong><p>Le dossier et ses documents restent consultables. Le règlement de la facture est à suivre séparément.</p></div></div>}
            </section>
            <div className="project-bottom-grid">
              <section className="project-documents-panel" aria-labelledby="project-documents-title">
                <div className="project-panel-heading"><div><h3 id="project-documents-title"><FolderOpen size={17}/> Documents du projet <span className="projects-count">{project.documents.length}</span></h3><p>Ajoutez vos pièces dès qu’elles sont disponibles.</p></div></div>
                <div className="project-document-upload"><label className="field-label" htmlFor="project-document-kind">Type de document<select id="project-document-kind" value={uploadKind} disabled={busy} onChange={event => setUploadKind(event.target.value as DocumentKind)}>{DOCUMENT_KINDS.map(kind => <option value={kind.id} key={kind.id}>{kind.label}</option>)}</select></label><UploadDocument kind={uploadKind} label="Ajouter" busy={busy} onUpload={upload}/></div>
                <p className="project-upload-limits">PDF, Office, images, DWG/DXF, ZIP · 20 Mo / fichier</p>
                {!project.documents.length ? <div className="project-documents-empty"><FileText size={27}/><p>Aucun document pour le moment.</p><span>Les pièces ajoutées ici seront reconnues par le workflow.</span></div>
                  : <ul className="project-document-list">{[...project.documents].reverse().map(doc => <li key={doc.id}><span className="project-document-icon"><FileText size={19}/></span><div><strong title={doc.name}>{doc.name}</strong><span>{documentLabel(doc.kind)} · {fileSize(doc.size)}</span><small>{dateLabel(doc.uploadedAt)}</small></div><button type="button" className="icon-button" aria-label={`Télécharger ${doc.name}`} disabled={busy} onClick={() => download(doc)}><ArrowDownToLine size={16}/></button><button type="button" className="icon-button project-remove-document" aria-label={`Retirer ${doc.name}`} disabled={busy} onClick={() => { setError(""); setDocumentToRemove(doc); }}><Trash2 size={15}/></button></li>)}</ul>}
              </section>
              <section className="project-history-panel" aria-labelledby="project-history-title"><div className="project-panel-heading"><div><h3 id="project-history-title"><Clock3 size={17}/> Activité récente</h3><p>Les actions du dossier, enregistrées au fil du projet.</p></div></div><ol className="project-history">{[...project.history].reverse().slice(0, 8).map(event => <li key={event.id}><Circle size={8}/><div><p>{event.message}</p><time dateTime={event.date}>{dateLabel(event.date, true)}</time></div></li>)}</ol>{project.history.length > 8 && <details className="project-older-history"><summary>Voir les {project.history.length - 8} activités précédentes</summary><ol className="project-history">{[...project.history].reverse().slice(8).map(event => <li key={event.id}><Circle size={8}/><div><p>{event.message}</p><time dateTime={event.date}>{dateLabel(event.date, true)}</time></div></li>)}</ol></details>}</section>
            </div>
          </>}
      </section>
    </div>
    {form && <FormulaireProjet key={form === "new" ? "new" : form.id} project={form === "new" ? undefined : form} busy={busy} error={error} onClose={() => { setForm(null); setError(""); }} onSave={saveDetails}/>}
    {project && activeStep && <StepDialog key={`${project.id}-${activeStep}`} project={project} stepId={activeStep} busy={busy} error={error} onClose={() => { setActiveStep(null); setError(""); }} onComplete={() => completeStep(activeStep)} onUpload={upload} onDownload={download} onReopen={() => void run(() => updateStoredProject(project, { type: "reopen", stepId: activeStep }), "Étape reprise. Les documents du dossier ont été conservés.", () => setActiveStep(null))}/>}
    {project && documentToRemove && <ProjetDialog title="Retirer ce document ?" busy={busy} onClose={() => { setDocumentToRemove(null); setError(""); }}><p className="project-dialog-intro">« {documentToRemove.name} » sera retiré de ce dossier. Conservez une copie si nécessaire.</p><p className="project-hint">Une pièce nécessaire à une étape déjà validée ne peut être retirée sans remplacement ou reprise de l’étape.</p>{error && <p className="project-error" role="alert">{error}</p>}<footer className="project-dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setDocumentToRemove(null); setError(""); }}>Annuler</button><button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => updateStoredProject(project, { type: "removeDocument", documentId: documentToRemove.id }), "Document retiré.", () => setDocumentToRemove(null))}><Trash2 size={16}/> Retirer le document</button></footer></ProjetDialog>}
  </main>;
}
