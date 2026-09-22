"use client";
import { useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { AtelierFacture } from "./AtelierFacture";
import { AtelierRapport } from "./AtelierRapport";

export function EspaceExnov() {
  const [service, setService] = useState<"factures" | "rapports">("factures");
  const [reportsVisited, setReportsVisited] = useState(false);
  function select(next: "factures" | "rapports") {
    if (next === "rapports") setReportsVisited(true);
    setService(next);
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
        </nav>
        <div className="header-account"><span className="company-location">Tanger, Maroc</span><span className="avatar">EX</span></div>
      </div>
    </header>
    <div hidden={service !== "factures"}><AtelierFacture/></div>
    {reportsVisited && <div hidden={service !== "rapports"}><AtelierRapport/></div>}
  </>;
}
