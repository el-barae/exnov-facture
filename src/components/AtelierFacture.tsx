"use client";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ArrowDownToLine, ArrowUpRight, Check, CircleHelp, FileDown, FilePlus2, FileText, LoaderCircle, LockKeyhole, RotateCcw } from "lucide-react";
import { documentFilename, documentLabels, exampleInvoice, invoiceSchema, newInvoice, type DocumentType, type Invoice } from "@/lib/invoice";
import { lastDocumentNumber, numberPreference, readPreferences, savePreferences } from "@/lib/storage";
import { FormulaireFacture } from "./FormulaireFacture";
import { ApercuFacture } from "./ApercuFacture";
import { useTeam } from "./TeamProvider";
import { ProjectDocumentActions } from "./ProjectDocumentActions";
import { useProjectWorkspace, useWorkshopState } from "./ProjectWorkspace";

export type AtelierFactureHandle = { selectDocumentType: (type: DocumentType) => void };

export function AtelierFacture({ ref, initialType = "facture" }: { ref?: Ref<AtelierFactureHandle>; initialType?: DocumentType }) {
  const { mode } = useTeam();
  const workspace = useProjectWorkspace();
  const project = workspace?.project;
  const [restored] = useState(() => !!workspace && workspace.draft.has("invoice"));
  const [invoice, setInvoice] = useWorkshopState<Invoice>("invoice", () => ({ ...newInvoice(1, undefined, initialType), date: "" }));
  const [numberValues] = useWorkshopState<Partial<Record<DocumentType, number>>>("numbers", {});
  const numbers = useRef(numberValues);
  const isDevis = invoice.typeDocument === "devis";
  const [ready, setReady] = useState(false), [busy, setBusy] = useState<"pdf" | "word" | null>(null);
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        const saved = readPreferences();
        // Initialisation après hydratation : localStorage n’existe pas côté serveur.
        setInvoice(current => {
          const next = restored ? current : { ...newInvoice(Math.min(lastDocumentNumber(saved, initialType) + 1, 999999999), project ? { destinataire: project.client, reference: project.reference } : saved.client, initialType), projet: project?.name ?? "" };
          if (next.typeDocument === initialType) return next;
          numbers.current[next.typeDocument] = next.numero;
          return { ...next, typeDocument: initialType, numero: numbers.current[initialType] ?? Math.min(lastDocumentNumber(saved, initialType) + 1, 999999999) };
        });
      } catch {
        setStorageWarning(true);
        if (!restored) setInvoice({ ...newInvoice(1, project ? { destinataire: project.client, reference: project.reference } : undefined, initialType), projet: project?.name ?? "" });
      }
      setReady(true);
    });
    return () => { mounted = false; };
    // Initialisation unique : les modifications du formulaire restent prioritaires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  useImperativeHandle(ref, () => ({ selectDocumentType: type => update({ typeDocument: type }) }));
  function rememberExport() {
    try { savePreferences({ ...numberPreference(invoice.typeDocument, invoice.numero), client: { destinataire: invoice.destinataire, reference: invoice.reference } }); }
    catch { setStorageWarning(true); }
  }
  async function createFile(format: "pdf" | "word"): Promise<File | null> {
    if (busy) return null;
    setError(""); setMessage("");
    const form = document.getElementById("invoice-form") as HTMLFormElement;
    if (!form.reportValidity()) return null;
    const parsed = invoiceSchema.safeParse(invoice);
    if (!parsed.success) { setError(`Vérifiez le document : ${parsed.error.issues.map(i => i.message).join(" ")}`); return null; }
    setBusy(format);
    try {
      const response = await fetch(`/api/factures/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(65000) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "La génération a échoué. Réessayez."); }
      const blob = await response.blob();
      return new File([blob], documentFilename(invoice.typeDocument, invoice.numero, format === "pdf" ? "pdf" : "docx"), { type: blob.type });
    } catch (reason) {
      throw new Error(reason instanceof Error && reason.name === "TimeoutError" ? "La génération prend trop de temps. Veuillez réessayer." : reason instanceof Error ? reason.message : "La génération a échoué.");
    } finally { setBusy(null); }
  }
  async function download(format: "pdf" | "word") {
    try {
      const file = await createFile(format);
      if (!file) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement("a"); link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      rememberExport();
      setMessage(`${documentLabels(invoice.typeDocument).name} nº ${invoice.numero} ${isDevis ? "téléchargé" : "téléchargée"} en ${format === "pdf" ? "PDF" : "Word"}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Le téléchargement a échoué."); }
  }
  function startNew() {
    let last = invoice.numero;
    try { last = Math.max(last, lastDocumentNumber(readPreferences(), invoice.typeDocument)); } catch { setStorageWarning(true); }
    setInvoice({ ...newInvoice(Math.min(last + 1, 999999999), { destinataire: invoice.destinataire, reference: invoice.reference }, invoice.typeDocument), projet: project?.name ?? "" }); setMessage(""); setError("");
  }
  return <div className="app-shell">
    <main className="workspace">
      <header className="page-heading"><h1>{isDevis ? "Votre prochain devis, en quelques instants." : "Votre prochaine facture, en quelques instants."}</h1><button className="secondary-button new-invoice" type="button" disabled={!ready || !!busy} onClick={startNew}><FilePlus2 size={17}/> {isDevis ? "Nouveau devis" : "Nouvelle facture"}</button></header>
      <div className="workspace-grid"><div className="form-column"><div className="form-intro"><span className="text-xs font-semibold tracking-widest text-slate-500">{isDevis ? "VOTRE DEVIS" : "VOTRE FACTURE"}</span><button type="button" className="example-button" disabled={!ready || !!busy} onClick={() => { setInvoice({ ...exampleInvoice(), typeDocument: invoice.typeDocument, numero: isDevis ? invoice.numero : 13 }); setMessage("Exemple du modèle chargé. Vous pouvez modifier tous les champs."); setError(""); }}><RotateCcw size={13}/> Charger l’exemple</button></div><FormulaireFacture invoice={invoice} update={update} busy={!!busy || !ready}/><div className="privacy-note"><LockKeyhole size={15}/><p>{mode === "demo" ? "Les numéros et le client sont mémorisés dans ce navigateur." : "Le formulaire est conservé pendant cette session. Vérifiez le numéro du document avec votre équipe avant émission."} Les PDF enregistrés dans un projet restent disponibles dans son dossier.</p></div></div>
      <div className="document-column"><div className="document-sticky">
        <ApercuFacture invoice={invoice}/>
        <div className="export-panel"><div className="mb-4 flex items-center justify-between"><div><h2>{isDevis ? "Prêt à être envoyé." : "Prête à être envoyée."}</h2><p>Choisissez le format de votre {isDevis ? "devis" : "facture"}.</p></div><ArrowDownToLine size={22} className="text-slate-400"/></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><button type="button" className="primary-button" disabled={!ready || !!busy} onClick={() => download("pdf")}>{busy === "pdf" ? <LoaderCircle size={18} className="animate-spin"/> : <FileDown size={18}/>} {busy === "pdf" ? "Génération du PDF…" : "Télécharger PDF"}</button><button type="button" className="secondary-button" disabled={!ready || !!busy} onClick={() => download("word")}>{busy === "word" ? <LoaderCircle size={18} className="animate-spin"/> : <FileText size={18}/>} {busy === "word" ? "Génération du Word…" : "Télécharger Word"}</button></div>
          <ProjectDocumentActions kind={invoice.typeDocument} format="PDF" disabled={!ready || !!busy} createFile={() => createFile("pdf")} onSaved={rememberExport}/>
          <div aria-live="polite">{message && <p className="status-message"><Check size={15}/>{message}</p>}</div>{error && <p role="alert" className="error-message">{error}</p>}{storageWarning && <p className="mt-3 text-xs text-amber-800">Le stockage de ce navigateur est indisponible. Le numéro et le client ne seront pas mémorisés.</p>}
        </div><p className="help-note"><CircleHelp size={14}/> Les retenues cochées sont déduites du total à payer.</p>
      </div></div></div>
      <footer className="app-footer"><span>BET EXNOV S.A.R.L <span className="text-slate-300">/</span> Expertise & Innovation</span><a href="https://www.exnov.ma" target="_blank" rel="noreferrer">exnov.ma <ArrowUpRight size={13}/></a></footer>
    </main>
  </div>;
}
