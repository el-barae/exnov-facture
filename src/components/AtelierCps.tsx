"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, Check, FileDown, FilePlus2, ImagePlus, LoaderCircle, Sparkles, Square, X } from "lucide-react";
import { CPS_CHAPTERS, CPS_EXAMPLE_PROMPT, cpsAmount, cpsFilename, cpsNumber, cpsReplySchema, cpsTotals, cpsValue, type Cps, type CpsGenerate, type CpsLogo } from "@/lib/cps";
import { cpsReferences } from "@/lib/cps-references";
import { prepareCpsLogo } from "@/lib/cps-logo";

function CpsPreview({ document, logo }: { document: Cps; logo: CpsLogo | null }) {
  const totals = cpsTotals(document);
  return <article className="cps-paper" aria-label="Aperçu du CPS">
    <div className="cps-cover">
      {/* Le logo est une image locale normalisée, jamais une URL externe. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img src={logo.dataUrl} alt="Logo du document"/>}
      {document.authority && <p className="cps-authority">{document.authority}</p>}
      <p>{cpsValue(document.owner)}</p>
      <span className="cps-document-label">CAHIER DES PRESCRIPTIONS SPÉCIALES</span>
      <h2>{document.title}</h2>
      <dl>{[["Marché n°", document.reference], ["Lieu", document.location], ["Délai", document.deadline], ["Passation", document.procedure]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{cpsValue(value)}</dd></div>)}</dl>
      <small>Projet de document — à compléter et à valider</small>
    </div>
    <nav className="cps-contents" aria-label="Sommaire du CPS"><h3>Sommaire</h3>
      {CPS_CHAPTERS.map((chapter, i) => <a href={`#cps-chapter-${i}`} key={chapter}><span>0{i + 1}</span>{chapter}</a>)}
    </nav>
    <section className="cps-document-section"><h3>Identification des parties</h3>
      <p>Maître d’ouvrage : {cpsValue(document.owner)}</p>
      <p>Représentant du maître d’ouvrage : [À compléter]</p>
      <p>Entrepreneur, représentant, adresse, identifiants et coordonnées bancaires : [À compléter]</p>
    </section>
    <section id="cps-chapter-0" className="cps-document-section"><h3>I. {CPS_CHAPTERS[0]}</h3>
      {document.administrative.map((article, i) => <div key={i}><h4>ARTICLE {i + 1} : {article.title}</h4>{article.paragraphs.map((paragraph, j) => <p key={j}>{paragraph}</p>)}</div>)}
    </section>
    <section id="cps-chapter-1" className="cps-document-section"><h3>II. {CPS_CHAPTERS[1]}</h3>
      {document.technical.map((lot, i) => <div key={i}><h4 className="cps-lot">{i + 1}. {lot.title}</h4>{lot.articles.map((article, j) => <div key={j}><h4>ARTICLE {i + 1}.{j + 1} : {article.title}</h4>{article.paragraphs.map((paragraph, k) => <p key={k}>{paragraph}</p>)}</div>)}</div>)}
    </section>
    <section id="cps-chapter-2" className="cps-document-section"><h3>III. {CPS_CHAPTERS[2]}</h3>
      {document.works.map((work, i) => <div key={i}><h4>PRIX N° {i + 1} : {work.title}</h4>{work.paragraphs.map((paragraph, j) => <p key={j}>{paragraph}</p>)}<p><em>Unité de règlement : {work.unit}</em></p></div>)}
    </section>
    <section id="cps-chapter-3" className="cps-document-section"><h3>IV. {CPS_CHAPTERS[3]}</h3>
      <p>Montants en dirhams (DH).</p><div className="cps-table-scroll" tabIndex={0} role="region" aria-label="Bordereau des prix">
        <table><thead><tr>{["N°", "Désignation", "Unité", "Quantité", "P.U. HT", "Total HT"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{document.works.map((work, i) => <tr key={i}><td>{i + 1}</td><td>{work.title}</td><td>{work.unit}</td><td>{cpsNumber(work.quantity)}</td><td>{cpsAmount(work.unitPrice)}</td><td>{cpsAmount(totals.lines[i])}</td></tr>)}</tbody>
        </table>
      </div><dl className="cps-totals">{[["Total HT", totals.ht], [`TVA (${document.vatRate === null ? "taux à compléter" : cpsNumber(document.vatRate) + " %"})`, totals.vat], ["Total TTC", totals.ttc]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{cpsAmount(value)}</dd></div>)}</dl>
    </section>
    {document.missingInformation.length > 0 && <section className="cps-document-section cps-missing"><h3>À compléter ou à confirmer</h3><ul>{document.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul></section>}
    <section className="cps-document-section"><h3>Signatures et approbation</h3><div className="cps-signatures">{["Lu et accepté par l’entrepreneur", "Dressé par", "Vérifié par", "Approuvé par"].map(label => <div key={label}><strong>{label}</strong><p>Nom et qualité : …………………</p><p>À …………………, le …………………</p><p>Signature et cachet</p></div>)}</div></section>
  </article>;
}

export function AtelierCps() {
  const [prompt, setPrompt] = useState("");
  const [reference, setReference] = useState<CpsGenerate["reference"]>("auto");
  const [document, setDocument] = useState<Cps | null>(null);
  const [logo, setLogo] = useState<CpsLogo | null>(null);
  const [busy, setBusy] = useState<"generate" | "word" | "logo" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const request = useRef<AbortController | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const promptField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (busy !== "generate") return;
    const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  async function attach(file?: File) {
    if (!file || busy) return;
    setBusy("logo"); setError(""); setStatus("");
    try { setLogo(await prepareCpsLogo(file)); }
    catch (error) { setError(error instanceof Error ? error.message : "Impossible d’importer le logo."); }
    finally { setBusy(null); if (upload.current) upload.current.value = ""; }
  }
  async function generate(event: FormEvent) {
    event.preventDefault();
    if (busy || !prompt.trim()) return;
    const controller = new AbortController(); request.current = controller;
    setBusy("generate"); setError(""); setStatus(""); setElapsed(0);
    try {
      const response = await fetch("/api/cps/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), reference, document } satisfies CpsGenerate),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(285_000)]),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "La génération a échoué. Veuillez réessayer.");
      const reply = cpsReplySchema.safeParse(body);
      if (!reply.success) throw new Error("La réponse reçue ne contient pas de CPS valide. Réessayez.");
      setDocument(reply.data.document); setStatus(reply.data.message); setPrompt("");
    } catch (error) {
      if (controller.signal.aborted) setStatus("Génération annulée. Votre demande et le dernier CPS sont conservés.");
      else setError(error instanceof Error && error.name === "TimeoutError" ? "La génération prend trop de temps. Réessayez avec une demande plus concise." : error instanceof Error ? error.message : "La génération a échoué.");
    } finally { request.current = null; setBusy(null); }
  }
  async function download() {
    if (!document || busy) return;
    const controller = new AbortController(); request.current = controller;
    setBusy("word"); setError(""); setStatus("");
    try {
      const response = await fetch("/api/cps/word", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, logo }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "L’export Word a échoué."); }
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a"); link.href = url; link.download = cpsFilename(document);
      window.document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus("Votre CPS Word est prêt. Vous pouvez modifier les textes et les tableaux dans Word ou LibreOffice.");
    } catch (error) { setError(error instanceof Error && error.name === "TimeoutError" ? "L’export a pris trop de temps. Réessayez." : error instanceof Error ? error.message : "L’export Word a échoué."); }
    finally { request.current = null; setBusy(null); }
  }
  function reset() {
    if (busy) return;
    setDocument(null); setPrompt(""); setError(""); setStatus("");
    promptField.current?.focus();
  }
  return <main className="workspace cps-workspace">
    <div className="page-heading"><div><div className="eyebrow"><span/>RÉDACTION DES MARCHÉS DE TRAVAUX</div><h1>Votre CPS, du brief au Word.</h1><p>Ajoutez votre logo, décrivez les travaux et générez un cahier des prescriptions spéciales structuré.</p></div>
      <button type="button" className="secondary-button new-invoice" disabled={!!busy} onClick={reset}><FilePlus2 size={16}/>Nouveau CPS</button>
    </div>
    <div className="cps-grid">
      <div className="cps-controls">
        <form className="form-section cps-form" onSubmit={generate} aria-busy={busy === "generate"}>
          <div className="cps-form-heading"><span className="report-assistant-icon"><BookOpen size={19}/></span><div><h2>Générateur de CPS</h2><p>Inspiré de vos quatre documents de référence</p></div><span className="report-ai-badge">IA</span></div>
          <fieldset disabled={!!busy}>
            <legend className="sr-only">Paramètres du CPS</legend>
            <label className="field-label" htmlFor="cps-logo">1. Votre logo <span className="label-hint">Facultatif</span></label>
            <input ref={upload} id="cps-logo" className="sr-only" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Importer un logo" onChange={event => void attach(event.target.files?.[0])}/>
            <div className={`cps-logo-upload${logo ? " has-logo" : ""}`}>
              {logo ? <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo.dataUrl} alt="Logo importé"/>
                <div><strong>{logo.name}</strong><button type="button" onClick={() => upload.current?.click()}>Remplacer le logo</button></div>
                <button className="icon-button" type="button" aria-label="Retirer le logo" onClick={() => setLogo(null)}><X size={16}/></button>
              </> : <button type="button" onClick={() => upload.current?.click()}><ImagePlus size={24}/><strong>Importer votre logo</strong><span>PNG, JPG ou WebP · 12 Mo maximum</span></button>}
            </div>
            <label className="field-label" htmlFor="cps-reference">2. Trame de référence<select id="cps-reference" value={reference} onChange={event => setReference(event.target.value as CpsGenerate["reference"])}><option value="auto">Adaptation automatique au projet</option>{cpsReferences.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="field-label" htmlFor="cps-prompt">3. {document ? "Vos modifications" : "Décrivez votre projet"}<textarea ref={promptField} id="cps-prompt" value={prompt} maxLength={16000} required onChange={event => setPrompt(event.target.value)} placeholder={document ? "Ex. : ajoute un lot étanchéité, précise les essais et porte le délai à 4 mois…" : "Nature et lieu des travaux, maître d’ouvrage, lots, matériaux, quantités, délai d’exécution, conditions particulières…"}/></label>
            <div className="cps-prompt-meta"><button type="button" onClick={() => { setPrompt(document ? "Détaille les contrôles et essais de réception pour chaque lot, en conservant les autres clauses." : CPS_EXAMPLE_PROMPT); promptField.current?.focus(); }}>{document ? "Exemple de modification" : "Utiliser un exemple de demande"}</button><span>{prompt.length.toLocaleString("fr-FR")} / 16 000</span></div>
            <p className="cps-field-help">Indiquez les quantités et prix si vous les connaissez. Les données manquantes seront repérées dans le document.</p>
            <button type="submit" className="primary-button cps-generate" disabled={!!busy || !prompt.trim()}><Sparkles size={16}/>{document ? "Modifier le CPS" : "Générer mon CPS"}</button>
          </fieldset>
          {busy === "generate" && <div className="cps-progress" role="status"><div><LoaderCircle className="animate-spin" size={17}/><span>Rédaction de votre CPS… <small>{elapsed < 60 ? `${elapsed} s` : `${Math.floor(elapsed / 60)} min ${elapsed % 60} s`} · Peut prendre quelques minutes.</small></span></div><button type="button" className="secondary-button" onClick={() => request.current?.abort()}><Square size={13}/>Annuler</button></div>}
          {busy === "logo" && <p className="cps-field-help" role="status">Préparation du logo…</p>}
          {error && <p className="report-error cps-feedback" role="alert">{error}</p>}
          {status && <p className="report-status cps-feedback" role="status"><Check size={15}/>{status}</p>}
        </form>
        <div className="cps-export"><div><FileDown size={21}/><div><h2>Document Word modifiable</h2><p>Couverture, sommaire, articles et tableaux.</p></div></div><button type="button" className="primary-button" disabled={!document || !!busy} onClick={() => void download()}>{busy === "word" ? <LoaderCircle className="animate-spin" size={16}/> : <FileDown size={16}/>}Télécharger le CPS Word</button></div>
        <details className="cps-reference-info"><summary>Les modèles utilisés</summary><p>La structure est adaptée depuis vos CPS. Les anciennes données de marché ne sont pas reprises automatiquement.</p><ul>{cpsReferences.map(item => <li key={item.id}>{item.label}</li>)}</ul></details>
      </div>
      <div className="cps-preview-column">
        <div className="cps-preview-toolbar"><span><BookOpen size={15}/>Aperçu du contenu</span><small>{document ? `${document.administrative.length} articles · ${document.technical.length} lots · ${document.works.length} prix` : "Votre document apparaîtra ici"}</small></div>
        {document ? <><div className="cps-preview-scroll"><CpsPreview document={document} logo={logo}/></div><p className="cps-preview-note">La pagination et les en-têtes sont appliqués dans le fichier Word.</p></> : <div className="cps-empty">
          <div className="cps-mini-document"><span>CPS</span><i/><i/><i/><div/><i/><i/></div>
          <span className="eyebrow">UN DOCUMENT STRUCTURÉ</span><h2>Le cadre de vos travaux,<br/>prêt à être rédigé.</h2><p>Une trame adaptée à votre projet, de la page de garde aux signatures.</p>
          <ol>{CPS_CHAPTERS.map((chapter, i) => <li key={chapter}><span>0{i + 1}</span>{chapter}</li>)}</ol>
        </div>}
      </div>
    </div>
    <footer className="app-footer cps-footer"><span>EXNOV · CPS IA</span><p>Le texte est transmis au service IA lors de la génération ; le logo est intégré lors de l’export Word. Votre saisie reste disponible en changeant d’espace, mais n’est pas sauvegardée au rechargement.</p></footer>
  </main>;
}
