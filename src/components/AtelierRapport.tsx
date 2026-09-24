"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, FileDown, FilePlus2, ImagePlus, LoaderCircle, Send, Sparkles, Square, X } from "lucide-react";
import { exampleReport, MAX_REPORT_IMAGES, MAX_REPORT_TURNS, MAX_REPORT_PROMPT_LENGTH, reportFilename, reportReplySchema, type Report, type ReportImage, type ReportMessage } from "@/lib/report";
import { buildReportHtml } from "@/lib/document/report";
import { prepareReportImage } from "@/lib/report-images";
import { ApercuDocument } from "./ApercuDocument";

const suggestions = [
  "Rédige un rapport de visite de chantier à partir de mes observations et des photos jointes.",
  "Prépare un rapport d’avancement des travaux avec les points à suivre et les prochaines actions.",
  "Rédige un compte rendu de réunion de chantier structuré par sujet et par action.",
];

export function AtelierRapport() {
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [images, setImages] = useState<ReportImage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"chat" | "pdf" | "images" | null>(null);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const [showExample, setShowExample] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const request = useRef<AbortController | null>(null);
  const upload = useRef<HTMLInputElement>(null), composer = useRef<HTMLTextAreaElement>(null), conversation = useRef<HTMLDivElement>(null);
  const example = useMemo(() => exampleReport(), []);
  const visibleReport = report || (showExample ? example : null);
  const html = useMemo(() => visibleReport ? buildReportHtml(visibleReport, images) : "", [visibleReport, images]);
  const atLimit = messages.length >= MAX_REPORT_TURNS * 2;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [messages, busy]);

  async function attach(files: FileList | null) {
    if (!files?.length || busy) return;
    const selected = Array.from(files);
    if (images.length + selected.length > MAX_REPORT_IMAGES) { setError(`Vous pouvez joindre jusqu’à ${MAX_REPORT_IMAGES} photos par rapport.`); return; }
    setBusy("images"); setError(""); setStatus("");
    try {
      const prepared: ReportImage[] = [];
      for (const file of selected) prepared.push(await prepareReportImage(file));
      setImages(current => [...current, ...prepared]);
    } catch (error) { setError(error instanceof Error ? error.message : "Impossible de préparer les images."); }
    finally { setBusy(null); if (upload.current) upload.current.value = ""; }
  }

  function removeImage(id: string) {
    setImages(current => current.filter(image => image.id !== id));
    setReport(current => current ? { ...current, sections: current.sections.map(section => ({ ...section, images: section.images.filter(image => image.imageId !== id) })) } : null);
    setStatus("");
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !prompt.trim() || atLimit) return;
    const nextMessages: ReportMessage[] = [...messages, { role: "user", content: prompt.trim() }];
    const controller = new AbortController(); request.current = controller;
    setBusy("chat"); setError(""); setStatus(""); setPendingPrompt(prompt.trim());
    try {
      const response = await fetch("/api/rapports/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, images, report }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "La génération a échoué. Veuillez réessayer.");
      const reply = reportReplySchema.parse(body);
      setMessages([...nextMessages, { role: "assistant", content: reply.message }]);
      if (reply.report) { setReport(reply.report); setShowExample(false); }
      setPrompt("");
    } catch (error) {
      if (controller.signal.aborted) setStatus("Génération annulée. Votre demande et le dernier rapport sont conservés.");
      else setError(error instanceof Error && error.name === "TimeoutError" ? "La génération prend trop de temps. Réessayez avec une demande plus courte." : error instanceof Error ? error.message : "La génération a échoué.");
    } finally { request.current = null; setBusy(null); setPendingPrompt(""); }
  }

  async function download() {
    if (busy || !visibleReport) return;
    setBusy("pdf"); setError(""); setStatus("");
    try {
      const response = await fetch("/api/rapports/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: visibleReport, images }), signal: AbortSignal.timeout(65_000),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Impossible de télécharger le PDF."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = reportFilename(visibleReport);
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("Le rapport PDF a été téléchargé.");
    } catch (error) { setError(error instanceof Error && error.name === "TimeoutError" ? "La génération du PDF prend trop de temps. Réessayez." : error instanceof Error ? error.message : "Le téléchargement a échoué."); }
    finally { setBusy(null); }
  }

  function startNew() {
    setMessages([]); setReport(null); setImages([]); setPrompt(""); setShowExample(false); setError(""); setStatus("");
    composer.current?.focus();
  }

  return <main className="workspace report-workspace">
    <header className="page-heading"><div><div className="eyebrow"><span/> RAPPORTS EXNOV</div><h1>Vos observations deviennent un rapport.</h1><p>Décrivez votre projet, ajoutez vos photos et affinez le document par conversation.</p></div><button type="button" className="secondary-button new-invoice" disabled={!!busy} onClick={startNew}><FilePlus2 size={17}/> Nouveau rapport</button></header>
    <div className="workspace-grid report-grid">
      <section className="report-chat" aria-label="Assistant de rédaction">
        <div className="report-chat-heading"><span className="report-assistant-icon"><Sparkles size={20}/></span><div><h2>Assistant EXNOV</h2><p>Rédaction · Analyse des photos · Mise en page</p></div><span className="report-ai-badge">IA</span></div>
        <div className="report-conversation" ref={conversation} role="log" aria-label="Conversation" aria-live="polite" aria-busy={busy === "chat"}>
          {!messages.length && !pendingPrompt && <div className="report-welcome"><h3>Quel rapport préparons-nous ?</h3><p>Indiquez le projet, le destinataire, les constats et le résultat attendu. Vous pourrez ensuite demander des modifications.</p><div className="report-suggestions">{suggestions.map((suggestion, index) => <button key={suggestion} type="button" disabled={!!busy} onClick={() => { setPrompt(suggestion); composer.current?.focus(); }}><span>0{index + 1}</span>{["Visite de chantier", "Avancement des travaux", "Compte rendu de réunion"][index]}<span>↗</span></button>)}</div></div>}
          {messages.map((message, index) => <div className={`report-message ${message.role}`} key={index}><span>{message.role === "user" ? "Vous" : "EXNOV · Assistant"}</span><p>{message.content}</p></div>)}
          {pendingPrompt && <div className="report-message user"><span>Vous</span><p>{pendingPrompt}</p></div>}
          {busy === "chat" && <div className="report-thinking"><LoaderCircle size={16} className="animate-spin"/><p>Analyse et rédaction en cours…<small>La préparation du rapport peut prendre quelques minutes.</small></p></div>}
        </div>
        <form className="report-composer" onSubmit={send}>
          {!!images.length && <div className="report-attachments">{images.map(image => <div className="report-attachment" key={image.id}>
            {/* Les miniatures locales en base64 ne passent pas par l’optimiseur Next. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.dataUrl} alt={image.name}/><span title={image.name}>{image.name}</span><button type="button" disabled={!!busy} aria-label={`Retirer ${image.name}`} onClick={() => removeImage(image.id)}><X size={13}/></button>
          </div>)}</div>}
          <label className="sr-only" htmlFor="report-prompt">Votre demande</label><textarea id="report-prompt" ref={composer} value={prompt} onChange={event => setPrompt(event.target.value)} disabled={!!busy || atLimit} maxLength={MAX_REPORT_PROMPT_LENGTH} rows={5} placeholder={report ? "Ajoute une conclusion, développe les observations, modifie le titre…" : "Ex. : Rapport de visite du chantier à Tanger, le 22 septembre. Voici mes observations…"}/>
          <input type="file" ref={upload} accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => void attach(event.target.files)}/>
          <div className="report-composer-actions"><button type="button" className="secondary-button" disabled={!!busy || images.length >= MAX_REPORT_IMAGES} onClick={() => upload.current?.click()}>{busy === "images" ? <LoaderCircle size={16} className="animate-spin"/> : <ImagePlus size={16}/>} Photos <span>{images.length}/{MAX_REPORT_IMAGES}</span></button>{busy === "chat" ? <button className="secondary-button" type="button" onClick={() => request.current?.abort()}><Square size={14}/> Annuler</button> : <button type="submit" className="primary-button" disabled={!!busy || !prompt.trim() || atLimit}><Send size={15}/>{report ? "Modifier le rapport" : "Envoyer"}</button>}</div>
          <p className="report-upload-hint">JPG, PNG ou WebP · 12 Mo par photo avant optimisation</p>
          {atLimit && <p className="report-limit">Cette conversation a atteint {MAX_REPORT_TURNS} demandes. Téléchargez votre rapport puis commencez-en un nouveau.</p>}
        </form>
        <div className="report-feedback">{error && <p role="alert" className="report-error">{error}</p>}<div role="status">{status && <p className="report-status"><Check size={15}/>{status}</p>}</div></div>
      </section>
      <div className="document-column"><div className="document-sticky">
        {visibleReport ? <><div className="report-preview-label"><span>{report ? "VOTRE RAPPORT" : "EXEMPLE DE MISE EN PAGE"}</span><span>Identité EXNOV</span></div><ApercuDocument html={html} label="Rapport"/></> : <div className="report-empty-preview"><div className="report-paper-icon"><FileDown size={45}/></div><span className="eyebrow">VOTRE DOCUMENT, PRÊT À PARTAGER</span><h2>Un rapport à votre image.</h2><p>Une présentation A4 soignée, vos photos légendées et l’en-tête EXNOV sur chaque page.</p><button className="secondary-button" type="button" onClick={() => setShowExample(true)}>Voir un exemple</button><div className="report-style-swatch"><i/><i/><i/><span>EXNOV · Expertise & Innovation</span></div></div>}
        <div className="export-panel"><div className="mb-4"><h2>{report ? "Votre rapport est prêt à relire." : showExample ? "Découvrez le rendu PDF." : "De la conversation au document."}</h2><p>{report ? "Vérifiez les constats et les informations avant de partager votre rapport." : "Titres, sections, photos et pagination aux couleurs EXNOV."}</p></div><button type="button" className="primary-button w-full" disabled={!!busy || !visibleReport} onClick={() => void download()}>{busy === "pdf" ? <LoaderCircle size={18} className="animate-spin"/> : <FileDown size={18}/>} {busy === "pdf" ? "Génération du PDF…" : !report && showExample ? "Télécharger l’exemple PDF" : "Télécharger le rapport PDF"}</button></div>
      </div></div>
    </div>
    <footer className="app-footer report-footer"><span>BET EXNOV S.A.R.L · Expertise & Innovation</span><p>Les demandes et photos sont envoyées à AWS Bedrock lors de la rédaction. La conversation reste dans cette session et disparaît au rechargement.</p></footer>
  </main>;
}
