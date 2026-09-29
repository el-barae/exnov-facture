"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, LoaderCircle, Save } from "lucide-react";
import { attachGeneratedProjectFile, loadProjects, subscribeToProjectChanges } from "@/lib/project-storage";
import type { CivilProject, DocumentKind } from "@/lib/projects";
import { useProjectWorkspace, useWorkshopState } from "./ProjectWorkspace";

export function ProjectDocumentActions({ kind, format, disabled, createFile, onSaved }: {
  kind: DocumentKind; format: string; disabled?: boolean; createFile: () => Promise<File | null>; onSaved?: () => void;
}) {
  const workspace = useProjectWorkspace();
  const linkedProject = workspace?.project;
  const [projects, setProjects] = useState<CivilProject[]>([]);
  const [selectedId, setSelectedId] = useWorkshopState("destination", linkedProject?.id ?? "");
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
    refresh();
    const unsubscribe = subscribeToProjectChanges(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [attempt]);
  const project = projects.find(item => item.id === selectedId);

  async function save() {
    if (running.current || disabled || !project) return;
    // Capturer la destination avant la génération, même si l’utilisateur change d’espace.
    const destination = project;
    running.current = true; setBusy(true); setError(""); setStatus("");
    try {
      const file = await createFile();
      if (!file) return;
      await attachGeneratedProjectFile(destination.id, kind, file);
      onSaved?.();
      setStatus(`« ${file.name} » enregistré dans « ${destination.name} ».`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L’enregistrement a échoué. Réessayez.");
    } finally { running.current = false; setBusy(false); }
  }

  return <section className="project-document-actions" aria-label="Enregistrer dans un projet">
    {linkedProject ? <div className="project-document-destination"><FolderOpen size={17}/><div><span>Projet destinataire</span><strong>{project?.name ?? linkedProject.name}</strong></div></div>
      : <label className="field-label">Projet destinataire<select aria-label="Projet destinataire" value={selectedId} disabled={busy || disabled || !!loadError} onChange={event => { setSelectedId(event.target.value); setError(""); setStatus(""); }}><option value="">Choisir un projet</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <p>Enregistrer le {format} dans les documents du dossier.</p>
    <div className="project-document-buttons"><button type="button" className="secondary-button" disabled={disabled || busy || !project || !!loadError} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>} {busy ? "Enregistrement…" : "Enregistrer dans ce projet"}</button>
      {selectedId && workspace && <button type="button" className="project-text-button" disabled={busy} onClick={() => workspace.onOpenProject(selectedId)}>Voir le projet</button>}
      {linkedProject && workspace && <button type="button" className="project-text-button" disabled={busy} onClick={workspace.onLeaveProject}>Ouvrir sans projet</button>}
    </div>
    {!linkedProject && !projects.length && !loadError && <p>Créez un dossier depuis l’espace Projets pour y conserver ce document.</p>}
    {loadError && <p className="error-message" role="alert">{loadError} <button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button></p>}
    {status && <p className="status-message" role="status">{status}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}
