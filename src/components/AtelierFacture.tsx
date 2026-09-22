"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Check, CircleHelp, FileDown, FilePlus2, FileText, LoaderCircle, LockKeyhole, RotateCcw } from "lucide-react";
import { documentFilename, documentLabels, exampleInvoice, invoiceSchema, newInvoice, type DocumentType, type Invoice } from "@/lib/invoice";
import { lastDocumentNumber, numberPreference, readPreferences, savePreferences } from "@/lib/storage";
import { FormulaireFacture } from "./FormulaireFacture";
import { ApercuFacture } from "./ApercuFacture";

export function AtelierFacture() {
  const [invoice, setInvoice] = useState<Invoice>(() => ({ ...newInvoice(), date: "" }));
  const numbers = useRef<Partial<Record<DocumentType, number>>>({});
  const isDevis = invoice.typeDocument === "devis";
  const [ready, setReady] = useState(false), [busy, setBusy] = useState<"pdf" | "word" | null>(null);
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    try {
      const saved = readPreferences();
      // Initialisation après hydratation : localStorage n’existe pas côté serveur.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInvoice(newInvoice(saved.dernierNumero ? Math.min(saved.dernierNumero + 1, 999999999) : 1, saved.client));
    } catch { setStorageWarning(true); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      try { savePreferences({ client: { destinataire: invoice.destinataire, reference: invoice.reference } }); }
      catch { setStorageWarning(true); }
    }, 400);
    return () => clearTimeout(timer);
  }, [ready, invoice.destinataire, invoice.reference]);
  function update(patch: Partial<Invoice>) {
    if (patch.typeDocument && patch.typeDocument !== invoice.typeDocument) {
      numbers.current[invoice.typeDocument] = invoice.numero;
      let next = numbers.current[patch.typeDocument];
      if (next === undefined) {
        try { next = Math.min(lastDocumentNumber(readPreferences(), patch.typeDocument) + 1, 999999999); }
        catch { next = 1; setStorageWarning(true); }
      }
      patch = { ...patch, numero: next };
    }
    setInvoice(i => ({ ...i, ...patch })); setMessage(""); setError("");
  }
  async function download(format: "pdf" | "word") {
    if (busy) return;
    setError(""); setMessage("");
    const form = document.getElementById("invoice-form") as HTMLFormElement;
    if (!form.reportValidity()) return;
    const parsed = invoiceSchema.safeParse(invoice);
    if (!parsed.success) { setError(`Vérifiez le document : ${parsed.error.issues.map(i => i.message).join(" ")}`); return; }
    setBusy(format);
    try {
      const response = await fetch(`/api/factures/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(65000) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Le téléchargement a échoué. Réessayez."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = documentFilename(invoice.typeDocument, invoice.numero, format === "pdf" ? "pdf" : "docx"); document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      try { savePreferences({ ...numberPreference(invoice.typeDocument, invoice.numero), client: { destinataire: invoice.destinataire, reference: invoice.reference } }); } catch { setStorageWarning(true); }
      setMessage(`${documentLabels(invoice.typeDocument).name} nº ${invoice.numero} ${isDevis ? "téléchargé" : "téléchargée"} en ${format === "pdf" ? "PDF" : "Word"}.`);
    } catch (e) { setError(e instanceof Error && e.name === "TimeoutError" ? "La génération prend trop de temps. Veuillez réessayer." : e instanceof Error ? e.message : "Le téléchargement a échoué."); }
    finally { setBusy(null); }
  }
  function startNew() {
    let last = invoice.numero;
    try { last = Math.max(last, lastDocumentNumber(readPreferences(), invoice.typeDocument)); } catch { setStorageWarning(true); }
    setInvoice(newInvoice(Math.min(last + 1, 999999999), { destinataire: invoice.destinataire, reference: invoice.reference }, invoice.typeDocument)); setMessage(""); setError("");
  }
  return <div className="app-shell">
    <main className="workspace">
      <header className="page-heading"><h1>{isDevis ? "Votre prochain devis, en quelques instants." : "Votre prochaine facture, en quelques instants."}</h1><button className="secondary-button new-invoice" type="button" disabled={!ready || !!busy} onClick={startNew}><FilePlus2 size={17}/> {isDevis ? "Nouveau devis" : "Nouvelle facture"}</button></header>
      <div className="workspace-grid"><div className="form-column"><div className="form-intro"><span className="text-xs font-semibold tracking-widest text-slate-500">{isDevis ? "VOTRE DEVIS" : "VOTRE FACTURE"}</span><button type="button" className="example-button" disabled={!ready || !!busy} onClick={() => { setInvoice({ ...exampleInvoice(), typeDocument: invoice.typeDocument, numero: isDevis ? invoice.numero : 13 }); setMessage("Exemple du modèle chargé. Vous pouvez modifier tous les champs."); setError(""); }}><RotateCcw size={13}/> Charger l’exemple</button></div><FormulaireFacture invoice={invoice} update={update} busy={!!busy || !ready}/><div className="privacy-note"><LockKeyhole size={15}/><p>Seuls les derniers numéros de facture et de devis et les informations du client sont conservés dans ce navigateur.</p></div></div>
      <div className="document-column"><div className="document-sticky">
        <ApercuFacture invoice={invoice}/>
        <div className="export-panel"><div className="mb-4 flex items-center justify-between"><div><h2>{isDevis ? "Prêt à être envoyé." : "Prête à être envoyée."}</h2><p>Choisissez le format de votre {isDevis ? "devis" : "facture"}.</p></div><ArrowDownToLine size={22} className="text-slate-400"/></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><button type="button" className="primary-button" disabled={!ready || !!busy} onClick={() => download("pdf")}>{busy === "pdf" ? <LoaderCircle size={18} className="animate-spin"/> : <FileDown size={18}/>} {busy === "pdf" ? "Génération du PDF…" : "Télécharger PDF"}</button><button type="button" className="secondary-button" disabled={!ready || !!busy} onClick={() => download("word")}>{busy === "word" ? <LoaderCircle size={18} className="animate-spin"/> : <FileText size={18}/>} {busy === "word" ? "Génération du Word…" : "Télécharger Word"}</button></div>
          <div aria-live="polite">{message && <p className="status-message"><Check size={15}/>{message}</p>}</div>{error && <p role="alert" className="error-message">{error}</p>}{storageWarning && <p className="mt-3 text-xs text-amber-800">Le stockage de ce navigateur est indisponible. Le numéro et le client ne seront pas mémorisés.</p>}
        </div><p className="help-note"><CircleHelp size={14}/> Les retenues cochées sont déduites du total à payer.</p>
      </div></div></div>
      <footer className="app-footer"><span>BET EXNOV S.A.R.L <span className="text-slate-300">/</span> Expertise & Innovation</span><a href="https://www.exnov.ma" target="_blank" rel="noreferrer">exnov.ma <ArrowUpRight size={13}/></a></footer>
    </main>
  </div>;
}
