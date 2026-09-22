"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Maximize2, Minimize2 } from "lucide-react";
import type { Invoice } from "@/lib/invoice";
import { buildInvoiceHtml } from "@/lib/document/html";

export function ApercuFacture({ invoice }: { invoice: Invoice }) {
  const container = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(700), [height, setHeight] = useState(1123), [count, setCount] = useState(1), [expanded, setExpanded] = useState(false), [error, setError] = useState("");
  const html = useMemo(() => buildInvoiceHtml(invoice), [invoice]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "exnov-pages") { setHeight(event.data.height); setCount(event.data.count); setError(""); }
      if (event.data?.type === "exnov-error") setError(event.data.message);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    function close(event: KeyboardEvent) { if (event.key === "Escape") setExpanded(false); }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  const scale = Math.min(width / 794, 1);
  return <section className={`preview-panel ${expanded ? "preview-expanded" : ""}`} aria-label={invoice.typeDocument === "devis" ? "Aperçu du devis" : "Aperçu de la facture"}>
    <div className="preview-toolbar"><div className="flex items-center gap-2"><Eye size={17}/><h2 className="text-sm font-semibold">Aperçu du document</h2><span className="live-dot" title="Mise à jour automatique"/></div><button type="button" className="icon-button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Réduire l’aperçu" : "Agrandir l’aperçu"}>{expanded ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button></div>
    <div className="preview-details"><span>A4 · 210 × 297 mm</span><span>{count} {count > 1 ? "pages" : "page"} · {Math.round(scale * 100)} %</span></div>
    {error && <p role="alert" className="mx-5 my-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="preview-scroll"><div ref={container} className="preview-canvas"><div className="paper-shadow" style={{ width: 794 * scale, height: height * scale }}><iframe ref={frame} title={invoice.typeDocument === "devis" ? "Devis au format A4" : "Facture au format A4"} srcDoc={html} sandbox="allow-scripts" style={{ width: 794, height, transform: `scale(${scale})`, transformOrigin: "top left" }} tabIndex={-1}/></div></div></div>
    <div className="preview-caption"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600"/> Aperçu identique au PDF téléchargé</div>
  </section>;
}
