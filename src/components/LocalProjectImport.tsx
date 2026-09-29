"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, FolderInput, HardDrive, LoaderCircle, RefreshCw } from "lucide-react";
import { importLocalProject, listLocalProjectsForImport, type LocalProjectImportProgress } from "@/lib/project-storage";
import { canManageProjects } from "@/lib/team";
import type { CivilProject } from "@/lib/projects";
import { useTeam } from "./TeamProvider";

export function LocalProjectImport({ onImported }: { onImported: (project: CivilProject) => void }) {
  const { mode, user } = useTeam();
  const selectId = useId();
  const [projects, setProjects] = useState<CivilProject[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState<"loading" | "importing" | null>(null);
  const [progress, setProgress] = useState<LocalProjectImportProgress | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const running = useRef(false);
  const selected = projects?.find(project => project.id === selectedId);

  useEffect(() => {
    if (busy !== "importing") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function findProjects() {
    if (running.current) return;
    running.current = true; setBusy("loading"); setError(""); setNotice("");
    try {
      const values = await listLocalProjectsForImport();
      setProjects(values);
      setSelectedId(current => values.some(project => project.id === current) ? current : values[0]?.id ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible de lire les dossiers de ce navigateur."); }
    finally { running.current = false; setBusy(null); }
  }
  async function importSelected() {
    if (!selected || running.current || !canManageProjects(user)) return;
    running.current = true; setBusy("importing"); setError(""); setNotice(""); setProgress(null);
    try {
      const project = await importLocalProject(selected, setProgress);
      setImportedIds(previous => [...new Set([...previous, selected.id])]);
      setNotice(`« ${project.name} » est disponible dans l’espace équipe. Le dossier et les fichiers locaux sont conservés dans ce navigateur.`);
      onImported(project);
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : "L’import n’a pas pu se terminer."} Vous pouvez réessayer : les documents déjà transférés seront réutilisés et les copies locales sont conservées.`);
    } finally { running.current = false; setBusy(null); }
  }
  if (mode !== "team" || !canManageProjects(user)) return null;
  const isImported = !!selected && importedIds.includes(selected.id);
  const progressLabel = progress?.phase === "preparing" ? "Préparation du dossier…"
    : progress?.phase === "finalizing" ? "Vérification et finalisation du dossier…"
      : progress ? `${progress.completed} / ${progress.total} document${progress.total > 1 ? "s" : ""} importé${progress.completed > 1 ? "s" : ""}${progress.fileName ? ` · ${progress.fileName}` : ""}` : "Préparation de l’import…";

  return <section className="team-panel local-project-import" aria-labelledby={`${selectId}-title`}>
    <div className="local-import-heading"><div><h2 id={`${selectId}-title`}><HardDrive size={18}/> Vos anciens dossiers</h2><p>Retrouvez les projets enregistrés dans ce navigateur, puis choisissez un dossier à partager avec votre équipe.</p></div><button type="button" className="secondary-button" disabled={!!busy} onClick={() => void findProjects()}>{busy === "loading" ? <LoaderCircle size={16} className="animate-spin"/> : projects ? <RefreshCw size={16}/> : <FolderInput size={16}/>} {projects ? "Actualiser les dossiers locaux" : "Retrouver mes dossiers locaux"}</button></div>
    {projects && !projects.length && <p className="team-empty">Aucun dossier local dans ce navigateur. Ouvrez l’application depuis le navigateur où vos projets ont été créés pour les importer.</p>}
    {projects && projects.length > 0 && <div className="local-import-selection"><label className="field-label" htmlFor={selectId}>Dossier à importer<select id={selectId} value={selectedId} disabled={!!busy} onChange={event => { setSelectedId(event.target.value); setError(""); setNotice(""); setProgress(null); }}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}{importedIds.includes(project.id) ? " — Importé" : ""}</option>)}</select></label>{selected && <div className="local-import-summary"><strong>{selected.client}</strong><span>{selected.documents.length} document{selected.documents.length > 1 ? "s" : ""}{selected.reference ? ` · ${selected.reference}` : ""}</span></div>}<button type="button" className="primary-button" disabled={!!busy || !selected || isImported} onClick={() => void importSelected()}>{busy === "importing" ? <LoaderCircle size={16} className="animate-spin"/> : isImported ? <Check size={16}/> : <FolderInput size={16}/>} {isImported ? "Dossier importé" : busy === "importing" ? "Import en cours…" : "Importer dans l’espace équipe"}</button></div>}
    {busy === "importing" && progress && <div className="local-import-progress" role="status" aria-live="polite"><label>{progressLabel}<progress max={progress.total + 1} value={progress.phase === "complete" ? progress.total + 1 : progress.completed}/></label><p>Gardez cet onglet ouvert jusqu’à la fin de l’import.</p></div>}
    {error && <p className="project-error" role="alert">{error}</p>}
    {notice && <p className="project-success" role="status"><Check size={17}/>{notice}</p>}
  </section>;
}
