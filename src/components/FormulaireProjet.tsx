"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, FolderPlus, LoaderCircle } from "lucide-react";
import { DEFAULT_REQUIRED_DOCUMENTS, DOCUMENT_KINDS, projectDetailsSchema, WORKFLOW_STEPS, type CivilProject, type DocumentKind, type ProjectDetails } from "@/lib/projects";
import { ProjetDialog } from "./ProjetDialog";

export function FormulaireProjet({ project, busy, error, onClose, onSave }: {
  project?: CivilProject; busy: boolean; error: string; onClose: () => void; onSave: (details: ProjectDetails) => void;
}) {
  const [details, setDetails] = useState<ProjectDetails>(() => project ? {
    name: project.name, client: project.client, site: project.site, reference: project.reference,
    withBdp: project.withBdp, requiredDocuments: project.requiredDocuments,
  } : { name: "", client: "", site: "", reference: "", withBdp: true, requiredDocuments: [...DEFAULT_REQUIRED_DOCUMENTS] });
  const [validationError, setValidationError] = useState("");
  const configurationLocked = !!project?.completedSteps.length;
  function toggleDocument(kind: DocumentKind) {
    setDetails(value => ({ ...value, requiredDocuments: value.requiredDocuments.includes(kind) ? value.requiredDocuments.filter(id => id !== kind) : [...value.requiredDocuments, kind] }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = projectDetailsSchema.safeParse(details);
    if (!parsed.success) { setValidationError(parsed.error.issues[0].message); return; }
    setValidationError("");
    onSave(parsed.data);
  }
  return <ProjetDialog title={project ? "Modifier le projet" : "Nouveau projet"} busy={busy} onClose={onClose}>
    <p className="project-dialog-intro">Un dossier pour suivre la mission, ses documents et chaque étape validée.</p>
    <form onSubmit={submit} className="project-form">
      <fieldset disabled={busy}>
        <label className="field-label">Nom du projet <span className="project-required">*</span><input autoFocus name="projectName" required maxLength={160} placeholder="Ex. Aménagement du souk communal" value={details.name} onChange={event => setDetails({ ...details, name: event.target.value })}/></label>
        <label className="field-label">Maître d’ouvrage <span className="project-required">*</span><input name="projectClient" required maxLength={160} placeholder="Nom du client ou de l’organisme" value={details.client} onChange={event => setDetails({ ...details, client: event.target.value })}/></label>
        <div className="project-form-row">
          <label className="field-label">Site / localisation<input name="projectSite" maxLength={250} placeholder="Ville, adresse ou ouvrage" value={details.site} onChange={event => setDetails({ ...details, site: event.target.value })}/></label>
          <label className="field-label">Référence<input name="projectReference" maxLength={80} placeholder="Ex. PRJ-2026-001" value={details.reference} onChange={event => setDetails({ ...details, reference: event.target.value })}/></label>
        </div>
        <div className="project-options">
          <label className="check-label"><input type="checkbox" name="withBdp" disabled={configurationLocked} checked={details.withBdp} onChange={event => setDetails({ ...details, withBdp: event.target.checked })}/><span>Inclure l’étape de chiffrage BDP<small>Décochez si cette mission ne comprend pas de bordereau des prix.</small></span></label>
          <details className="project-requirements-settings"><summary>Documents requis par étape</summary>
            <p>Les pièces cochées doivent être jointes avant la validation de leur étape. Adaptez cette liste à la mission.</p>
            <div className="project-requirements-options">{DOCUMENT_KINDS.filter(kind => kind.id !== "autre" && (details.withBdp || kind.stepId !== "chiffrage")).map(kind => <label className="check-label" key={kind.id}>
              <input type="checkbox" disabled={configurationLocked} checked={details.requiredDocuments.includes(kind.id)} onChange={() => toggleDocument(kind.id)}/>
              <span>{kind.label}<small>{WORKFLOW_STEPS.find(step => step.id === kind.stepId)!.title}</small></span>
            </label>)}</div>
          </details>
          {configurationLocked && <p className="project-hint">Pour changer le parcours ou les pièces requises, reprenez d’abord la première étape du workflow. Les documents seront conservés.</p>}
        </div>
      </fieldset>
      {(error || validationError) && <p className="project-error" role="alert">{error || validationError}</p>}
      <footer className="project-dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="animate-spin"/> : project ? <ArrowRight size={17}/> : <FolderPlus size={17}/>} {project ? "Enregistrer" : "Créer le projet"}</button></footer>
    </form>
  </ProjetDialog>;
}
