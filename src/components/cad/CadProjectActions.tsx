"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, LoaderCircle, Save } from "lucide-react";
import { attachGeneratedProjectFile, createProjectPlan, loadProjectPlan, loadProjects, saveProjectPlan, subscribeToProjectChanges } from "@/lib/project-storage";
import type { CivilProject } from "@/lib/projects";
import type { LoadedProjectPlan, ProjectPlanSource } from "@/lib/cad/project";
import { projectPlanContent } from "@/lib/cad/project-draft";
import { exportDxf } from "@/lib/cad/dxf";
import type { CadPlan } from "@/lib/cad/types";
import { useProjectWorkspace, useWorkshopState } from "../ProjectWorkspace";

type Props = {
  plan: CadPlan; source: ProjectPlanSource | null; savedContent: string | null;
  onSaved: (result: LoadedProjectPlan, saved: CadPlan) => void;
  onReload: (result: LoadedProjectPlan) => void;
};

export function CadProjectActions({ plan, source, savedContent, onSaved, onReload }: Props) {
  const workspace = useProjectWorkspace();
  const linkedProject = workspace?.project;
  const [projects, setProjects] = useState<CivilProject[]>([]);
  const [selectedId, setSelectedId] = useWorkshopState("destination", linkedProject?.id ?? "");
  const [format, setFormat] = useState("json");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true;
    const refresh = () => void loadProjects().then(values => {
      if (mounted) { setProjects(values); setLoadError(""); }
    }).catch(reason => { if (mounted) setLoadError(reason instanceof Error ? reason.message : "Impossible de charger les projets."); });
    refresh(); const unsubscribe = subscribeToProjectChanges(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [attempt]);
  const destinationId = source?.projectId ?? linkedProject?.id ?? selectedId;
  const project = projects.find(item => item.id === destinationId);
  const dirty = !!source && projectPlanContent(plan) !== savedContent;
  const remoteDocument = source && project?.documents.find(document => document.id === source.documentId);
  const changedRemotely = !!source && !!project && (!remoteDocument || (remoteDocument.revision ?? 0) !== source.revision);

  async function save(copy = false) {
    if (running.current || !project || (!source && !plan.entities.length)) return;
    const snapshot = plan, destination = project;
    running.current = true; setBusy(true); setError(""); setStatus("");
    try {
      if (source && !copy) {
        const result = await saveProjectPlan(source, snapshot);
        onSaved(result, snapshot);
        setStatus(`Modifications enregistrées dans « ${source.fileName} », projet « ${destination.name} ».`);
      } else if (format === "json" || copy) {
        const result = await createProjectPlan(destination.id, snapshot);
        onSaved(result, snapshot);
        setStatus(`« ${result.source.fileName} » enregistré dans « ${destination.name} ».`);
      } else {
        const filename = plan.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "plan";
        await attachGeneratedProjectFile(destination.id, "plans", new File([exportDxf(snapshot)], `${filename}.dxf`, { type: "application/dxf" }));
        setStatus(`« ${filename}.dxf » enregistré dans « ${destination.name} ».`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible d’enregistrer ce plan."); }
    finally { running.current = false; setBusy(false); }
  }
  async function reload() {
    if (!source || running.current) return;
    running.current = true; setBusy(true); setError(""); setStatus("");
    try {
      const result = await loadProjectPlan(source.projectId, source.documentId);
      onReload(result);
      setStatus("Version du projet rechargée. Annuler permet de retrouver votre tracé précédent.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible de recharger ce plan."); }
    finally { running.current = false; setBusy(false); }
  }

  return <section className="project-document-actions cad-project-actions" aria-label="Enregistrer le plan dans un projet">
    <div className="cad-project-setup">
    {source || linkedProject ? <div className="project-document-destination"><FolderOpen size={17}/><div><span>Projet destinataire</span><strong>{project?.name ?? linkedProject?.name ?? "Projet du plan"}</strong></div></div>
      : <label className="field-label"><span>Projet destinataire</span><select aria-label="Projet destinataire" value={selectedId} disabled={busy || !!loadError} onChange={event => { setSelectedId(event.target.value); setError(""); setStatus(""); }}><option value="">Choisir un projet</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {source ? <div className="cad-project-link"><strong>{source.fileName}</strong><p>Ce plan est lié au document JSON du projet. L’enregistrement met à jour ce document.</p><span className={dirty ? "plans-unsaved" : "plans-saved"} role="status">{dirty ? "Modifications à enregistrer dans le projet" : "Plan enregistré dans le projet"}</span></div>
      : <><label className="field-label"><span>Format à enregistrer</span><select aria-label="Format du plan pour le projet" value={format} disabled={busy} onChange={event => setFormat(event.target.value)}><option value="json">JSON · plan modifiable</option><option value="dxf">DXF · échange CAO</option></select></label><span className="cad-project-format-hint">{format === "json" ? "Le JSON pourra être rouvert avec « Modifier dans Plans 2D » depuis le projet." : "Le DXF peut être téléchargé pour un logiciel CAO. Choisissez JSON pour le modifier dans cet atelier."}</span></>}
    </div>
    <div className="project-document-buttons cad-project-primary-actions">
      <button type="button" className="secondary-button" disabled={busy || !project || !!loadError || (!source && !plan.entities.length)} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>} {busy ? "Enregistrement…" : source ? "Enregistrer les modifications dans ce projet" : "Enregistrer dans ce projet"}</button>
      {destinationId && workspace && <button type="button" className="project-text-button" disabled={busy} onClick={() => workspace.onOpenProject(destinationId)}>Voir le projet</button>}
      {linkedProject && workspace && <button type="button" className="project-text-button" disabled={busy} onClick={workspace.onLeaveProject}>Ouvrir sans projet</button>}
    </div>
    {changedRemotely && <p className="plans-error" role="alert">{remoteDocument ? "Le document a changé depuis son ouverture. Vos modifications locales sont conservées ; rechargez la version du projet ou enregistrez une copie JSON." : "Le document a été retiré du projet. Votre dessin est conservé ; vous pouvez l’enregistrer comme nouvelle copie JSON."}</p>}
    {source && (changedRemotely || error) && <div className="project-document-buttons cad-project-recovery-actions">{remoteDocument && <button type="button" className="secondary-button" disabled={busy} onClick={() => void reload()}>Recharger la version du projet</button>}<button type="button" className="secondary-button" disabled={busy || !project} onClick={() => void save(true)}>Enregistrer une copie JSON</button></div>}
    {!linkedProject && !projects.length && !loadError && <p>Créez un dossier depuis l’espace Projets pour y conserver ce document.</p>}
    {loadError && <p className="error-message" role="alert">{loadError} <button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button></p>}
    {status && <p className="status-message" role="status">{status}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}
