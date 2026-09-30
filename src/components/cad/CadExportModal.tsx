"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileCode2, FileJson, FileText, LoaderCircle, Ruler, X } from "lucide-react";
import type { CadPlan } from "@/lib/cad/types";
import { exportSvg } from "@/lib/cad/svg";
import { exportDxf } from "@/lib/cad/dxf";
import { CAD_PDF_SCALES, cadPdfFilename, cadPdfFitMessage, cadPdfLayout, defaultCadPdfSettings, type CadPdfProject, type CadPdfSettings } from "@/lib/cad/pdf";

type Props = { plan: CadPlan; project?: CadPdfProject; onClose: () => void };
type Format = "svg" | "dxf" | "json";

export function CadExportModal({ plan, project, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const downloadUrls = useRef(new Set<string>());
  const pendingPdf = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [settings, setSettings] = useState(() => defaultCadPdfSettings(project));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const layout = useMemo(() => cadPdfLayout(plan, settings), [plan, settings]);
  useEffect(() => {
    mounted.current = true;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const urls = downloadUrls.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      mounted.current = false;
      pendingPdf.current?.abort();
      dialog?.close(); previousFocus?.focus();
      urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear();
    };
  }, []);

  const close = () => { pendingPdf.current?.abort(); onClose(); };
  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    downloadUrls.current.add(url);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.current.delete(url); }, 1000);
  };
  const download = (format: Format) => {
    try {
      setError("");
      const content = format === "svg" ? exportSvg(plan) : format === "dxf" ? exportDxf(plan) : JSON.stringify(plan, null, 2);
      const mime = format === "svg" ? "image/svg+xml;charset=utf-8" : format === "dxf" ? "application/dxf;charset=utf-8" : "application/json;charset=utf-8";
      saveBlob(new Blob([content], { type: mime }), cadPdfFilename(plan).replace(/\.pdf$/, `.${format}`));
      setStatus(`Téléchargement ${format.toUpperCase()} lancé.`);
    } catch {
      setError("L’export a échoué. Réessayez ou sauvegardez le plan au format JSON.");
    }
  };
  const downloadPdf = async () => {
    if (pendingPdf.current || !layout.fits) return;
    const controller = new AbortController();
    pendingPdf.current = controller;
    setBusy(true); setError(""); setStatus("Préparation du PDF à l’échelle…");
    const timeout = window.setTimeout(() => {
      if (mounted.current && pendingPdf.current === controller) {
        controller.abort(); pendingPdf.current = null; setBusy(false); setStatus("");
        setError("Le PDF prend trop de temps à générer. Réessayez.");
      }
    }, 70000);
    try {
      const response = await fetch("/api/plans/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, settings }), signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(typeof result?.error === "string" ? result.error : "Impossible de générer le PDF. Réessayez.");
      }
      if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Le serveur n’a pas retourné un fichier PDF.");
      const blob = await response.blob();
      if (!mounted.current || controller.signal.aborted || pendingPdf.current !== controller) return;
      saveBlob(blob, cadPdfFilename(plan));
      setStatus(`Téléchargement PDF lancé à l’échelle 1:${settings.scale}. Imprimez à 100 % / taille réelle.`);
    } catch (failure) {
      if (!mounted.current || controller.signal.aborted || pendingPdf.current !== controller) return;
      setStatus(""); setError(failure instanceof Error ? failure.message : "Impossible de générer le PDF. Réessayez.");
    } finally {
      window.clearTimeout(timeout);
      if (pendingPdf.current === controller) {
        pendingPdf.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  };
  const cancelPdf = () => {
    pendingPdf.current?.abort(); pendingPdf.current = null;
    setBusy(false); setStatus("Préparation du PDF annulée.");
  };
  const update = <K extends keyof CadPdfSettings>(key: K, value: CadPdfSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  return (
    <dialog ref={dialogRef} className="cad-export-dialog" aria-labelledby="cad-export-title" aria-describedby="cad-export-description" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
      <div className="cad-export-heading"><span className="cad-export-symbol"><Download size={22} aria-hidden="true" /></span><button type="button" className="cad-icon-button" onClick={close} aria-label="Fermer les options d’export"><X size={19} aria-hidden="true" /></button></div>
      <h2 id="cad-export-title">Votre plan, prêt à partager.</h2>
      <p id="cad-export-description">Choisissez le format adapté à votre prochain usage.</p>
      <form className="cad-pdf-form" onSubmit={(event) => { event.preventDefault(); void downloadPdf(); }}>
        <h3><FileText size={19} aria-hidden="true" /> PDF à l’échelle · cartouche EXNOV</h3>
        <fieldset disabled={busy} className="cad-pdf-fields">
          <legend className="sr-only">Mise en page du PDF</legend>
          <div className="cad-pdf-paper-fields">
            <label>Format<select value={settings.paper} onChange={(event) => update("paper", event.target.value as CadPdfSettings["paper"])}><option>A4</option><option>A3</option></select></label>
            <label>Orientation<select value={settings.orientation} onChange={(event) => update("orientation", event.target.value as CadPdfSettings["orientation"])}><option value="landscape">Paysage</option><option value="portrait">Portrait</option></select></label>
            <label>Échelle<select value={settings.scale} onChange={(event) => update("scale", Number(event.target.value) as CadPdfSettings["scale"])}>{CAD_PDF_SCALES.map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}</select></label>
          </div>
          <div className="cad-pdf-cartouche-fields">
            <label>Projet<input value={settings.project} maxLength={120} onChange={(event) => update("project", event.target.value)} placeholder="Facultatif" /></label>
            <label>Client<input value={settings.client} maxLength={100} onChange={(event) => update("client", event.target.value)} placeholder="Facultatif" /></label>
            <label>Référence<input value={settings.reference} maxLength={80} onChange={(event) => update("reference", event.target.value)} placeholder="Facultatif" /></label>
            <label>Dessiné par<input value={settings.drawnBy} maxLength={60} onChange={(event) => update("drawnBy", event.target.value)} placeholder="Facultatif" /></label>
            <label>Date<input type="date" value={settings.date} onChange={(event) => update("date", event.target.value)} /></label>
          </div>
        </fieldset>
        <p className={`cad-pdf-fit${layout.fits ? "" : " is-overflow"}`} role="status">
          {layout.fits ? `Le dessin tient sur la feuille : ${layout.drawingWidthMm.toFixed(1)} × ${layout.drawingHeightMm.toFixed(1)} mm pour une zone de ${layout.frameWidthMm} × ${layout.frameHeightMm} mm (marges du dessin incluses).` : cadPdfFitMessage(layout)}
        </p>
        <p className="cad-pdf-print-note">Échelle conservée : 1 m = {layout.millimetresPerMetre} mm sur le PDF. À imprimer à 100 % / taille réelle, sans ajustement à la page.</p>
        <div className="cad-pdf-actions"><button type="submit" className="cad-button cad-button-primary" disabled={busy || !layout.fits}>{busy ? <LoaderCircle size={17} className="cad-spinner" aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}{busy ? "Préparation du PDF…" : "Télécharger PDF"}</button>{busy && <button type="button" className="cad-button" onClick={cancelPdf}>Annuler la préparation</button>}</div>
      </form>
      <div className="cad-export-options">
        <button type="button" onClick={() => download("svg")}><FileCode2 size={23} aria-hidden="true" /><span><strong>Dessin vectoriel <b>SVG</b></strong><small>Illustration nette, à ouvrir dans un navigateur ou un éditeur vectoriel.</small></span><Download size={17} aria-hidden="true" /></button>
        <button type="button" onClick={() => download("dxf")}><Ruler size={23} aria-hidden="true" /><span><strong>Échange CAO <b>DXF</b></strong><small>Géométrie en mètres pour les logiciels de dessin technique.</small></span><Download size={17} aria-hidden="true" /></button>
        <button type="button" onClick={() => download("json")}><FileJson size={23} aria-hidden="true" /><span><strong>Plan modifiable <b>JSON</b></strong><small>Tous les objets et calques pour réimporter votre plan dans cet atelier.</small></span><Download size={17} aria-hidden="true" /></button>
      </div>
      <p className="cad-export-note">Les exports PDF, SVG et DXF utilisent les calques visibles. Le fichier JSON conserve l’ensemble du plan.</p>
      {status && <p className="cad-export-status" role="status">{status}</p>}
      {error && <p className="plans-error" role="alert">{error}</p>}
    </dialog>
  );
}
