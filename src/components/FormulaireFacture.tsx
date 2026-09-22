"use client";
import { FileText, Users, List, Percent } from "lucide-react";
import type { ReactNode } from "react";
import { calculateInvoice, formatMoney, type DocumentType, type Invoice } from "@/lib/invoice";
import { TableauPrestations } from "./TableauPrestations";

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return <div className="mb-5 flex gap-3"><div className="section-icon">{icon}</div><div><h2 className="text-sm font-semibold tracking-tight">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div></div>;
}
export function FormulaireFacture({ invoice, update, busy }: { invoice: Invoice; update: (patch: Partial<Invoice>) => void; busy: boolean }) {
  const isDevis = invoice.typeDocument === "devis";
  const totals = calculateInvoice(invoice);
  const amounts = [
    { label: "Total HT", value: totals.totalHT },
    { label: "Montant TVA", value: totals.tva },
    { label: "Total TTC", value: totals.ttc },
    ...(invoice.appliquerRasIS ? [{ label: "À déduire RAS IS", value: -totals.rasIS }] : []),
    ...(invoice.appliquerRasTVA ? [{ label: "À déduire RAS TVA", value: -totals.rasTVA }] : []),
  ];
  return <form id="invoice-form" onSubmit={e => e.preventDefault()}><fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
    <section className="form-section"><SectionTitle icon={<FileText size={18}/>} title={isDevis ? "Informations du devis" : "Informations de la facture"} subtitle="Les repères de votre document."/>
      <label className="field-label mb-4">Type de document
        <select name="typeDocument" value={invoice.typeDocument} onChange={e => update({ typeDocument: e.target.value as DocumentType })}>
          <option value="facture">Facture</option><option value="devis">Devis</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4"><label className="field-label">{isDevis ? "Numéro de devis" : "Numéro de facture"}<div className="input-affix prefix"><span>Nº</span><input name="numero" type="number" min="1" max="999999999" step="1" required value={invoice.numero || ""} onChange={e => update({ numero: Number(e.target.value) })}/></div></label><label className="field-label">Date d’émission<input name="date" type="date" required min="1900-01-01" value={invoice.date} onChange={e => update({ date: e.target.value })}/></label></div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">Le prochain numéro est proposé automatiquement. Vous pouvez le modifier.</p>
    </section>
    <section className="form-section"><SectionTitle icon={<Users size={18}/>} title="Client & projet" subtitle={isDevis ? "À qui s’adresse ce devis ?" : "À qui s’adresse cette facture ?"}/>
      <div className="space-y-4">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-4">
          <label className="field-label min-w-0">Destinataire <span className="label-hint">POUR</span><textarea name="destinataire" required rows={2} maxLength={500} placeholder="Nom de l’organisme ou du client" value={invoice.destinataire} onChange={e => update({ destinataire: e.target.value })}/></label>
          <label className="field-label min-w-0">Référence <span className="label-hint">Facultatif</span><input name="reference" maxLength={150} placeholder="Ex. : 73/2024/INDH" value={invoice.reference} onChange={e => update({ reference: e.target.value })}/></label>
        </div>
        <label className="field-label">Intitulé du marché / projet<textarea name="projet" required rows={4} maxLength={1500} placeholder="Décrivez l’objet du marché ou du projet…" value={invoice.projet} onChange={e => update({ projet: e.target.value })}/></label>
      </div>
    </section>
    <section className="form-section"><SectionTitle icon={<List size={18}/>} title="Prestations" subtitle={isDevis ? "Détaillez les études et les travaux proposés." : "Détaillez les études et les travaux facturés."}/><TableauPrestations invoice={invoice} onChange={lignes => update({ lignes })}/></section>
    <section className="form-section"><SectionTitle icon={<Percent size={18}/>} title="TVA & retenues à la source" subtitle="Les montants se mettent à jour automatiquement."/>
      <div className="tax-row"><label htmlFor="tva" className="text-sm font-medium">Taux de TVA</label><div className="input-affix rate"><input id="tva" type="number" inputMode="decimal" required min="0" max="100" step="0.01" value={invoice.tauxTVA} onChange={e => update({ tauxTVA: Number(e.target.value) })}/><span>%</span></div></div>
      <div className="tax-row"><label className="check-label"><input type="checkbox" checked={invoice.appliquerRasIS} onChange={e => update({ appliquerRasIS: e.target.checked })}/><span>Appliquer RAS IS<small>Sur le montant total HT</small></span></label><div className="input-affix rate"><input aria-label="Taux RAS IS" type="number" inputMode="decimal" required min="0" max="100" step="0.01" disabled={!invoice.appliquerRasIS} value={invoice.tauxRasIS} onChange={e => update({ tauxRasIS: Number(e.target.value) })}/><span>%</span></div></div>
      <div className="tax-row"><label className="check-label"><input type="checkbox" checked={invoice.appliquerRasTVA} onChange={e => update({ appliquerRasTVA: e.target.checked })}/><span>Appliquer RAS TVA<small>Sur le montant de la TVA</small></span></label><div className="input-affix rate"><input aria-label="Taux RAS TVA" type="number" inputMode="decimal" required min="0" max="100" step="0.01" disabled={!invoice.appliquerRasTVA} value={invoice.tauxRasTVA} onChange={e => update({ tauxRasTVA: Number(e.target.value) })}/><span>%</span></div></div>
      <div className="tax-row last"><label className="check-label"><input type="checkbox" name="afficherTotalAPayer" checked={invoice.afficherTotalAPayer} onChange={e => update({ afficherTotalAPayer: e.target.checked })}/><span>Afficher TOTAL A PAYER<small>Afficher cette ligne dans le document</small></span></label></div>
      <dl aria-label="Montants calculés du document" aria-live="polite" aria-atomic="true" className="mt-5 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
        {amounts.map(({ label, value }) => <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">{label}</dt>
          <dd className="whitespace-nowrap font-medium tabular-nums">{formatMoney(value === 0 ? 0 : value)} DH</dd>
        </div>)}
        <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-3 text-sm font-semibold">
          <dt>Total à payer</dt>
          <dd className="whitespace-nowrap tabular-nums">{formatMoney(totals.totalAPayer)} DH</dd>
        </div>
      </dl>
    </section>
  </fieldset></form>;
}
