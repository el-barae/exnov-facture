"use client";
import { FileText, Users, List, Percent } from "lucide-react";
import type { ReactNode } from "react";
import type { Invoice } from "@/lib/invoice";
import { TableauPrestations } from "./TableauPrestations";

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return <div className="mb-5 flex gap-3"><div className="section-icon">{icon}</div><div><h2 className="text-sm font-semibold tracking-tight">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div></div>;
}
export function FormulaireFacture({ invoice, update, busy }: { invoice: Invoice; update: (patch: Partial<Invoice>) => void; busy: boolean }) {
  return <form id="invoice-form" onSubmit={e => e.preventDefault()}><fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
    <section className="form-section"><SectionTitle icon={<FileText size={18}/>} title="Informations de la facture" subtitle="Les repères de votre document."/>
      <div className="grid grid-cols-2 gap-4"><label className="field-label">Numéro de facture<div className="input-affix prefix"><span>Nº</span><input name="numero" type="number" min="1" max="999999999" step="1" required value={invoice.numero || ""} onChange={e => update({ numero: Number(e.target.value) })}/></div></label><label className="field-label">Date d’émission<input name="date" type="date" required min="1900-01-01" value={invoice.date} onChange={e => update({ date: e.target.value })}/></label></div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">Le prochain numéro est proposé automatiquement. Vous pouvez le modifier.</p>
    </section>
    <section className="form-section"><SectionTitle icon={<Users size={18}/>} title="Client & projet" subtitle="À qui s’adresse cette facture ?"/>
      <div className="space-y-4"><label className="field-label">Destinataire <span className="label-hint">POUR</span><textarea name="destinataire" required rows={2} maxLength={500} placeholder="Nom de l’organisme ou du client" value={invoice.destinataire} onChange={e => update({ destinataire: e.target.value })}/></label>
        <label className="field-label">Référence <span className="label-hint">Facultatif</span><input name="reference" maxLength={150} placeholder="Ex. : 73/2024/INDH" value={invoice.reference} onChange={e => update({ reference: e.target.value })}/></label>
        <label className="field-label">Intitulé du marché / projet<textarea name="projet" required rows={4} maxLength={1500} placeholder="Décrivez l’objet du marché ou du projet…" value={invoice.projet} onChange={e => update({ projet: e.target.value })}/></label>
      </div>
    </section>
    <section className="form-section"><SectionTitle icon={<List size={18}/>} title="Prestations" subtitle="Détaillez les études et les travaux facturés."/><TableauPrestations invoice={invoice} onChange={lignes => update({ lignes })}/></section>
    <section className="form-section"><SectionTitle icon={<Percent size={18}/>} title="TVA & retenues à la source" subtitle="Les montants se mettent à jour automatiquement."/>
      <div className="tax-row"><label htmlFor="tva" className="text-sm font-medium">Taux de TVA</label><div className="input-affix rate"><input id="tva" type="number" inputMode="decimal" required min="0" max="100" step="0.01" value={invoice.tauxTVA} onChange={e => update({ tauxTVA: Number(e.target.value) })}/><span>%</span></div></div>
      <div className="tax-row"><label className="check-label"><input type="checkbox" checked={invoice.appliquerRasIS} onChange={e => update({ appliquerRasIS: e.target.checked })}/><span>Appliquer RAS IS<small>Sur le montant total HT</small></span></label><div className="input-affix rate"><input aria-label="Taux RAS IS" type="number" inputMode="decimal" required min="0" max="100" step="0.01" disabled={!invoice.appliquerRasIS} value={invoice.tauxRasIS} onChange={e => update({ tauxRasIS: Number(e.target.value) })}/><span>%</span></div></div>
      <div className="tax-row"><label className="check-label"><input type="checkbox" checked={invoice.appliquerRasTVA} onChange={e => update({ appliquerRasTVA: e.target.checked })}/><span>Appliquer RAS TVA<small>Sur le montant de la TVA</small></span></label><div className="input-affix rate"><input aria-label="Taux RAS TVA" type="number" inputMode="decimal" required min="0" max="100" step="0.01" disabled={!invoice.appliquerRasTVA} value={invoice.tauxRasTVA} onChange={e => update({ tauxRasTVA: Number(e.target.value) })}/><span>%</span></div></div>
      <div className="tax-row last"><label className="check-label"><input type="checkbox" name="afficherTotalAPayer" checked={invoice.afficherTotalAPayer} onChange={e => update({ afficherTotalAPayer: e.target.checked })}/><span>Afficher TOTAL A PAYER<small>Afficher cette ligne dans le document</small></span></label></div>
    </section>
  </fieldset></form>;
}
