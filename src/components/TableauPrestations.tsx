"use client";
import { Plus, Trash2 } from "lucide-react";
import { calculateInvoice, formatMoney, newLine, type Invoice, type InvoiceLine } from "@/lib/invoice";

export function TableauPrestations({ invoice, onChange }: { invoice: Invoice; onChange: (lines: InvoiceLine[]) => void }) {
  const totals = calculateInvoice(invoice);
  function update(id: string, patch: Partial<InvoiceLine>) { onChange(invoice.lignes.map(l => l.id === id ? { ...l, ...patch } : l)); }
  return <div className="space-y-4">
    {invoice.lignes.map((line, index) => <div className="service-card" key={line.id}>
      <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">PRESTATION {String(index + 1).padStart(2, "0")}</span><button type="button" className="icon-button text-slate-400 hover:text-red-700 disabled:opacity-25" disabled={invoice.lignes.length === 1} onClick={() => onChange(invoice.lignes.filter(l => l.id !== line.id))} aria-label={`Supprimer la prestation ${index + 1}`}><Trash2 size={16}/></button></div>
      <label className="field-label">Désignation<textarea aria-label={`Désignation de la prestation ${index + 1}`} required maxLength={2000} rows={3} placeholder="Étude, diagnostic, suivi des travaux…" value={line.designation} onChange={e => update(line.id, { designation: e.target.value })}/></label>
      <div className="mt-3 grid grid-cols-[.65fr_.7fr_1.15fr] gap-3">
        <label className="field-label">Unité<input aria-label={`Unité de la prestation ${index + 1}`} required maxLength={30} value={line.unite} onChange={e => update(line.id, { unite: e.target.value })}/></label>
        <label className="field-label">Quantité<input aria-label={`Quantité de la prestation ${index + 1}`} type="number" inputMode="decimal" min="0.0001" max="1000000" step="0.0001" required value={line.quantite || ""} onChange={e => update(line.id, { quantite: Number(e.target.value) })}/></label>
        <label className="field-label">Prix unitaire HT<div className="input-affix"><input aria-label={`Prix unitaire de la prestation ${index + 1}`} type="number" inputMode="decimal" min="0" max="100000000" step="0.01" required value={line.prixUnitaire} onChange={e => update(line.id, { prixUnitaire: Number(e.target.value) })}/><span>DH</span></div></label>
      </div>
      <div className="mt-4 flex justify-between border-t border-slate-200/70 pt-3 text-xs"><span className="text-slate-500">Total de la prestation HT</span><strong className="tabular-nums">{formatMoney(totals.lineTotals[index])} DH</strong></div>
    </div>)}
    <button type="button" className="add-button" disabled={invoice.lignes.length >= 100} onClick={() => onChange([...invoice.lignes, newLine()])}><Plus size={16}/> Ajouter une prestation</button>
    <p className="text-xs text-slate-400">{invoice.lignes.length} / 100 prestations</p>
  </div>;
}
