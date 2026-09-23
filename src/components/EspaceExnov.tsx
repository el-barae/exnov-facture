"use client";
import { useEffect, useState } from "react";
import { FileText, FolderKanban, Sparkles } from "lucide-react";
import { AtelierFacture } from "./AtelierFacture";
import { AtelierRapport } from "./AtelierRapport";
import { EspaceProjets } from "./EspaceProjets";

type Service = "factures" | "rapports" | "projets";

export function EspaceExnov({ initialService = "factures" }: { initialService?: Service }) {
  const [service, setService] = useState<Service>(initialService);
  const [reportsVisited, setReportsVisited] = useState(false);
  const [projectsVisited, setProjectsVisited] = useState(initialService === "projets");
  useEffect(() => {
    const restore = () => {
      const next = window.location.pathname === "/projets" ? "projets" : new URLSearchParams(window.location.search).get("service") === "rapports" ? "rapports" : "factures";
      if (next === "rapports") setReportsVisited(true);
      if (next === "projets") setProjectsVisited(true);
      setService(next);
    };
    // Restaurer le service depuis l’URL après hydratation et lors des retours navigateur.
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  function select(next: Service) {
    if (next === "rapports") setReportsVisited(true);
    if (next === "projets") setProjectsVisited(true);
    setService(next);
    const url = next === "projets" ? "/projets" : next === "rapports" ? "/?service=rapports" : "/";
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.pushState(null, "", url);
  }
  return <>
    <header className="app-header">
      <div className="header-inner">
        <button type="button" className="brand-lockup" aria-label="EXNOV — Accueil" onClick={() => select("factures")}>
          <span className="brand-symbol">E<span>⌁</span></span>
          <span className="brand-word">EXNOV<small>BUREAU D’ÉTUDES</small></span>
        </button>
        <div className="header-divider"/>
        <nav className="service-switch" aria-label="Services EXNOV">
          <button type="button" aria-pressed={service === "factures"} onClick={() => select("factures")}><FileText size={15}/><span>Factures / Devis</span></button>
          <button type="button" aria-pressed={service === "rapports"} onClick={() => select("rapports")}><Sparkles size={15}/><span>Rapports IA</span></button>
          <button type="button" aria-pressed={service === "projets"} onClick={() => select("projets")}><FolderKanban size={15}/><span>Projets</span></button>
        </nav>
        <div className="header-account"><span className="company-location">Tanger, Maroc</span><span className="avatar">EX</span></div>
      </div>
    </header>
    <div hidden={service !== "factures"}><AtelierFacture/></div>
    {reportsVisited && <div hidden={service !== "rapports"}><AtelierRapport/></div>}
    {projectsVisited && <div hidden={service !== "projets"}><EspaceProjets/></div>}
  </>;
}
