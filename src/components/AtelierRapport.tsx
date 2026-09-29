"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, FileDown, FilePlus2, ImagePlus, LoaderCircle, Send, Sparkles, Square, X } from "lucide-react";
import { exampleReport, MAX_REPORT_IMAGES, MAX_REPORT_TURNS, MAX_REPORT_PROMPT_LENGTH, reportFilename, reportReplySchema, type Report, type ReportImage, type ReportMessage } from "@/lib/report";
import { buildReportHtml } from "@/lib/document/report";
import { prepareReportImage } from "@/lib/report-images";
import { ApercuDocument } from "./ApercuDocument";
import { ProjectDocumentActions } from "./ProjectDocumentActions";
import { projectBrief, useProjectWorkspace, useWorkshopState } from "./ProjectWorkspace";

const suggestions = [
  { label: "Visite de chantier", subject: "rapport de visite de chantier", details: "Zones visitées et travaux observés :\nConstats localisés :\nDocuments et essais disponibles :\nActions convenues, responsables et échéances :" },
  { label: "Avancement des travaux", subject: "rapport d’avancement des travaux", details: "Période concernée :\nTravaux réalisés et en cours, par lot :\nPlanning prévu et écarts constatés :\nBlocages, décisions attendues et prochaines étapes :" },
  { label: "Diagnostic d’un ouvrage", subject: "rapport de diagnostic d’un ouvrage", details: "Ouvrage et périmètre examiné :\nDésordres observés et localisation :\nMesures et documents disponibles :\nInvestigations complémentaires envisagées :" },
  { label: "Visite de réception", subject: "rapport de visite préalable à la réception", details: "Lots et zones examinés :\nDocuments de référence disponibles :\nRéserves constatées et localisation :\nActions de levée des réserves, responsables et échéances :" },
];
const revisions = [
  { label: "Développer les constats", prompt: "Développe les constats techniques en distinguant observation, source de l’information, analyse et recommandation. Conserve les faits et les photos ; signale les vérifications nécessaires sans inventer de données." },
  { label: "Préciser les actions", prompt: "Précise le plan d’actions à partir des constats du rapport. Conserve les responsables, échéances, priorités et états de suivi fournis ; signale ceux qui restent à confirmer." },
  { label: "Rendre plus concis", prompt: "Rends le rapport plus concis en supprimant les répétitions. Conserve les constats, données techniques, limites, photos et actions nécessaires à la compréhension du projet." },
];

function reportBrief(suggestion: typeof suggestions[number]) {
  return `Rédige un ${suggestion.subject} professionnel pour BET EXNOV à partir des informations ci-dessous.

Projet :
Localisation :
Maître d’ouvrage / destinataire :
Date du rapport :
Date de la visite (si applicable) :
Référence et version :
Rédacteur et vérificateur (si connus) :

${suggestion.details}

Photographies jointes : préciser leur localisation et ce qu’elles illustrent.

Prévois une synthèse, un contexte et un périmètre clairs, des constats étayés, les actions à suivre et une conclusion adaptée. Laisse les informations non renseignées à confirmer et distingue les faits des hypothèses.`;
}

export function AtelierRapport() {
  const project = useProjectWorkspace()?.project;
  const [messages, setMessages] = useWorkshopState<ReportMessage[]>("messages", []);
  const [report, setReport] = useWorkshopState<Report | null>("report", null);
  const [images, setImages] = useWorkshopState<ReportImage[]>("images", []);
  const [prompt, setPrompt] = useWorkshopState("prompt", () => projectBrief(project));
  const [busy, setBusy] = useState<"chat" | "pdf" | "images" | null>(null);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const [showExample, setShowExample] = useWorkshopState("showExample", false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const request = useRef<AbortController | null>(null);
  const waitTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const upload = useRef<HTMLInputElement>(null), composer = useRef<HTMLTextAreaElement>(null), conversation = useRef<HTMLDivElement>(null);
  const example = useMemo(() => exampleReport(), []);
  const visibleReport = report || (showExample ? example : null);
  const html = useMemo(() => visibleReport ? buildReportHtml(visibleReport, images) : "", [visibleReport, images]);
  const atLimit = messages.length >= MAX_REPORT_TURNS * 2;

  useEffect(() => () => {
    request.current?.abort();
    if (waitTimer.current !== null) clearInterval(waitTimer.current);
  }, []);
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
    const timeout = AbortSignal.timeout(285_000);
    const startedAt = Date.now();
    setElapsedSeconds(0);
    waitTimer.current = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    setBusy("chat"); setError(""); setStatus(""); setPendingPrompt(prompt.trim());
    try {
      const response = await fetch("/api/rapports/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, images, report }),
        signal: AbortSignal.any([controller.signal, timeout]),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "La génération a échoué. Veuillez réessayer.");
      const reply = reportReplySchema.parse(body);
      setMessages([...nextMessages, { role: "assistant", content: reply.message }]);
      if (reply.report) { setReport(reply.report); setShowExample(false); }
      setPrompt("");
    } catch (error) {
      if (controller.signal.aborted) setStatus("Génération annulée. Votre demande et le dernier rapport sont conservés.");
      else setError(timeout.aborted ? "Aucune réponse reçue après 4 min 45 s. Votre demande et le dernier rapport sont conservés. Vous pouvez réessayer." : error instanceof Error ? error.message : "La génération a échoué.");
    } finally {
      if (waitTimer.current !== null) clearInterval(waitTimer.current);
      waitTimer.current = null;
      request.current = null; setBusy(null); setPendingPrompt("");
    }
  }

  async function createFile(): Promise<File | null> {
    if (busy || !visibleReport) return null;
    setBusy("pdf"); setError(""); setStatus("");
    try {
      const response = await fetch("/api/rapports/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: visibleReport, images }), signal: AbortSignal.timeout(65_000),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Impossible de télécharger le PDF."); }
      const blob = await response.blob();
      return new File([blob], reportFilename(visibleReport), { type: blob.type });
    } catch (error) { throw new Error(error instanceof Error && error.name === "TimeoutError" ? "La génération du PDF prend trop de temps. Réessayez." : error instanceof Error ? error.message : "La génération a échoué."); }
    finally { setBusy(null); }
  }

  async function download() {
    try {
      const file = await createFile();
      if (!file) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement("a"); link.href = url; link.download = file.name;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("Le rapport PDF a été téléchargé.");
    } catch (error) { setError(error instanceof Error ? error.message : "Le téléchargement a échoué."); }
  }

  function startNew() {
    setMessages([]); setReport(null); setImages([]); setPrompt(projectBrief(project)); setShowExample(false); setError(""); setStatus("");
    composer.current?.focus();
  }

  return <main className="workspace report-workspace">
    <header className="page-heading"><div><div className="eyebrow"><span/> RAPPORTS EXNOV</div><h1>Vos constats, un rapport de génie civil.</h1><p>Du contexte du projet au suivi des actions : décrivez votre mission, joignez vos photos et affinez votre rapport.</p></div><button type="button" className="secondary-button new-invoice" disabled={!!busy} onClick={startNew}><FilePlus2 size={17}/> Nouveau rapport</button></header>
    <div className="workspace-grid report-grid">
      <section className="report-chat" aria-label="Assistant de rédaction">
        <div className="report-chat-heading"><span className="report-assistant-icon"><Sparkles size={20}/></span><div><h2>Assistant EXNOV</h2><p>Constats techniques · Photos · Plan d’actions</p></div><span className="report-ai-badge">IA</span></div>
        <div className="report-conversation" ref={conversation} role="log" aria-label="Conversation" aria-live="polite" aria-busy={busy === "chat"}>
          {!messages.length && !pendingPrompt && <div className="report-welcome"><h3>Quel rapport préparons-nous ?</h3><p>Choisissez une trame à compléter ou rédigez votre demande. Précisez les zones observées, les documents disponibles et les actions convenues.</p><div className="report-suggestions">{suggestions.map((suggestion, index) => <button key={suggestion.label} type="button" disabled={!!busy} onClick={() => { setPrompt(projectBrief(project) + reportBrief(suggestion)); composer.current?.focus(); }}><span>0{index + 1}</span>{suggestion.label}<span>↗</span></button>)}</div></div>}
          {messages.map((message, index) => <div className={`report-message ${message.role}`} key={index}><span>{message.role === "user" ? "Vous" : "EXNOV · Assistant"}</span><p>{message.content}</p></div>)}
          {pendingPrompt && <div className="report-message user"><span>Vous</span><p>{pendingPrompt}</p></div>}
          {busy === "chat" && <div className="report-thinking"><LoaderCircle size={16} className="animate-spin"/><p>Rédaction du rapport sur AWS Bedrock…<small role="timer" aria-live="off" aria-label="Temps écoulé">Temps écoulé : {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}</small><small>{elapsedSeconds >= 60 ? "Vous pouvez laisser cette page ouverte ou annuler." : "La durée dépend du modèle et du contenu du rapport."}</small></p></div>}
        </div>
        <form className="report-composer" onSubmit={send}>
          {report && <div className="report-revisions" aria-label="Suggestions de révision">{revisions.map(revision => <button type="button" key={revision.label} disabled={!!busy || atLimit} onClick={() => { setPrompt(revision.prompt); composer.current?.focus(); }}>{revision.label}</button>)}</div>}
          {!!images.length && <div className="report-attachments">{images.map(image => <div className="report-attachment" key={image.id}>
            {/* Les miniatures locales en base64 ne passent pas par l’optimiseur Next. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.dataUrl} alt={image.name}/><span title={image.name}>{image.name}</span><button type="button" disabled={!!busy} aria-label={`Retirer ${image.name}`} onClick={() => removeImage(image.id)}><X size={13}/></button>
          </div>)}</div>}
          <label className="sr-only" htmlFor="report-prompt">Votre demande</label><textarea id="report-prompt" ref={composer} value={prompt} onChange={event => setPrompt(event.target.value)} disabled={!!busy || atLimit} maxLength={MAX_REPORT_PROMPT_LENGTH} aria-describedby="report-prompt-count" rows={7} placeholder={report ? "Ajoute une conclusion, développe les observations, modifie le titre…" : "Projet, lieu, date, zones visitées, observations, documents disponibles et actions à prévoir…"}/>
          <div className="report-prompt-meta"><span>Les champs inconnus restent à confirmer.</span><span id="report-prompt-count">{prompt.length.toLocaleString("fr-FR")} / {MAX_REPORT_PROMPT_LENGTH.toLocaleString("fr-FR")} caractères</span></div>
          <input type="file" ref={upload} accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => void attach(event.target.files)}/>
          <div className="report-composer-actions"><button type="button" className="secondary-button" disabled={!!busy || images.length >= MAX_REPORT_IMAGES} onClick={() => upload.current?.click()}>{busy === "images" ? <LoaderCircle size={16} className="animate-spin"/> : <ImagePlus size={16}/>} Photos <span>{images.length}/{MAX_REPORT_IMAGES}</span></button>{busy === "chat" ? <button className="secondary-button" type="button" onClick={() => request.current?.abort()}><Square size={14}/> Annuler</button> : <button type="submit" className="primary-button" disabled={!!busy || !prompt.trim() || atLimit}><Send size={15}/>{report ? "Modifier le rapport" : "Envoyer"}</button>}</div>
          <p className="report-upload-hint">JPG, PNG ou WebP · 12 Mo par photo avant optimisation</p>
          {atLimit && <p className="report-limit">Cette conversation a atteint {MAX_REPORT_TURNS} demandes. Téléchargez votre rapport puis commencez-en un nouveau.</p>}
        </form>
        <div className="report-feedback">{error && <p role="alert" className="report-error">{error}</p>}<div role="status">{status && <p className="report-status"><Check size={15}/>{status}</p>}</div></div>
      </section>
      <div className="document-column"><div className="document-sticky">
        {visibleReport ? <><div className="report-preview-label"><span>{report ? "VOTRE RAPPORT" : "EXEMPLE DE MISE EN PAGE"}</span><span>Identité EXNOV</span></div><ApercuDocument html={html} label="Rapport"/></> : <div className="report-empty-preview"><div className="report-paper-icon"><FileDown size={45}/></div><span className="eyebrow">VOTRE DOCUMENT, PRÊT À PARTAGER</span><h2>Un document technique structuré.</h2><p>Page de garde, synthèse, constats, photos légendées et tableau d’actions dans une présentation A4 EXNOV.</p><button className="secondary-button" type="button" onClick={() => setShowExample(true)}>Voir un exemple</button><div className="report-style-swatch"><i/><i/><i/><span>EXNOV · Expertise & Innovation</span></div></div>}
        <div className="export-panel"><div className="mb-4"><h2>{report ? "Votre rapport est prêt à relire." : showExample ? "Découvrez le rendu PDF." : "De la conversation au document."}</h2><p>{report ? "Vérifiez les constats et les informations avant de partager votre rapport." : "Une synthèse claire, des constats étayés et des actions à suivre, aux couleurs EXNOV."}</p></div><button type="button" className="primary-button w-full" disabled={!!busy || !visibleReport} onClick={() => void download()}>{busy === "pdf" ? <LoaderCircle size={18} className="animate-spin"/> : <FileDown size={18}/>} {busy === "pdf" ? "Génération du PDF…" : !report && showExample ? "Télécharger l’exemple PDF" : "Télécharger le rapport PDF"}</button><ProjectDocumentActions kind="rapport" format="PDF" disabled={!!busy || !report} createFile={createFile}/></div>
      </div></div>
    </div>
    <footer className="app-footer report-footer"><span>BET EXNOV S.A.R.L · Expertise & Innovation</span><p>Les demandes et photos sont envoyées à AWS Bedrock lors de la rédaction. La conversation reste dans cette session et disparaît au rechargement.</p></footer>
  </main>;
}
