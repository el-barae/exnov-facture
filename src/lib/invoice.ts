import Decimal from "decimal.js";
import { z } from "zod";
import { amountInWords } from "./words";

const decimal = (max: number, places: number, positive = false) => z.number()
  .finite().min(positive ? 0.0001 : 0).max(max)
  .refine(n => new Decimal(n).decimalPlaces() <= places, `Maximum ${places} décimales.`);
const text = (max: number) => z.string().trim().min(1, "Ce champ est obligatoire.").max(max)
  .refine(v => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(v), "Caractère non autorisé.");
export type DocumentType = "facture" | "devis";
export const documentLabels = (type: DocumentType) => type === "devis"
  ? { name: "Devis", title: "DEVIS", closing: "Arrêté le présent devis à la somme de :" }
  : { name: "Facture", title: "FACTURE", closing: "Arrêté la présente facture à la somme de :" };
export const documentFilename = (type: DocumentType, numero: number, format: "pdf" | "docx") => `${documentLabels(type).name}-EXNOV-${numero}.${format}`;

export const invoiceSchema = z.object({
  typeDocument: z.enum(["facture", "devis"]).default("facture"),
  numero: z.number().int().min(1).max(999999999),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const d = new Date(`${v}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= "1900-01-01";
  }, "Date invalide."),
  destinataire: text(500), reference: z.string().trim().max(150), projet: text(1500),
  lignes: z.array(z.object({
    id: text(80), designation: text(2000), unite: text(30),
    quantite: decimal(1000000, 4, true), prixUnitaire: decimal(100000000, 2),
  })).min(1).max(100),
  afficherTotalAPayer: z.boolean().default(true),
  tauxTVA: decimal(100, 2), appliquerRasIS: z.boolean(), tauxRasIS: decimal(100, 2),
  appliquerRasTVA: z.boolean(), tauxRasTVA: decimal(100, 2),
}).superRefine((invoice, ctx) => {
  const total = invoice.lignes.reduce((s, l) => s.plus(new Decimal(l.quantite).times(l.prixUnitaire).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)), new Decimal(0));
  if (total.gt(999999999.99)) ctx.addIssue({ code: "custom", path: ["lignes"], message: "Le montant HT doit rester inférieur à un milliard de dirhams." });
});
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceLine = Invoice["lignes"][number];
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export function calculateInvoice(invoice: Invoice) {
  const lineTotals = invoice.lignes.map(l => money(new Decimal(l.quantite || 0).times(l.prixUnitaire || 0)));
  const ht = lineTotals.reduce((sum, n) => sum.plus(n), new Decimal(0));
  const tva = money(ht.times(invoice.tauxTVA || 0).div(100));
  const ttc = ht.plus(tva);
  const rasIS = invoice.appliquerRasIS ? money(ht.times(invoice.tauxRasIS || 0).div(100)) : new Decimal(0);
  const rasTVA = invoice.appliquerRasTVA ? money(tva.times(invoice.tauxRasTVA || 0).div(100)) : new Decimal(0);
  return {
    lineTotals: lineTotals.map(n => n.toNumber()), totalHT: ht.toNumber(), tva: tva.toNumber(),
    ttc: ttc.toNumber(), rasIS: rasIS.toNumber(), rasTVA: rasTVA.toNumber(),
    totalAPayer: ttc.minus(rasIS).minus(rasTVA).toNumber(),
  };
}
export function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value).replace(/[\u202f\u00a0]/g, " ");
}
export const formatQuantity = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);
/** Ajuster les montants élevés à la dernière colonne, dont la largeur est celle du Word. */
export const amountFontSize = (formatted: string) => Math.min(12, Math.floor(216 / formatted.length) / 2);
export const formatDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : "—";
export function invoiceView(invoice: Invoice) {
  const totals = calculateInvoice(invoice);
  return {
    ...invoice, titreDocument: documentLabels(invoice.typeDocument).title, formuleArrete: documentLabels(invoice.typeDocument).closing, reference: invoice.reference.trim(),
    numero: String(invoice.numero), date: formatDate(invoice.date), destinataire: invoice.destinataire.toLocaleUpperCase("fr-FR"),
    lignes: invoice.lignes.map((line, index) => ({ ...line, numeroPrix: index + 1, quantite: formatQuantity(line.quantite), prixUnitaire: formatMoney(line.prixUnitaire), prixTotal: formatMoney(totals.lineTotals[index]) })),
    totalHT: formatMoney(totals.totalHT), tva: formatMoney(totals.tva), ttc: formatMoney(totals.ttc),
    rasIS: totals.rasIS ? `-${formatMoney(totals.rasIS)}` : "0,00", rasTVA: totals.rasTVA ? `-${formatMoney(totals.rasTVA)}` : "0,00",
    totalAPayer: formatMoney(totals.totalAPayer), montantEnLettres: Number.isFinite(totals.totalAPayer) && totals.totalAPayer >= 0 && totals.totalAPayer < 1e12 ? amountInWords(totals.totalAPayer) : "Montant à vérifier",
    tauxTVA: formatQuantity(invoice.tauxTVA), tauxRasIS: formatQuantity(invoice.tauxRasIS), tauxRasTVA: formatQuantity(invoice.tauxRasTVA),
  };
}
export function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Casablanca" }).format(new Date());
}
export function newInvoice(numero = 1, client?: { destinataire: string; reference: string }, typeDocument: DocumentType = "facture"): Invoice {
  return { typeDocument, numero, date: today(), destinataire: client?.destinataire ?? "", reference: client?.reference ?? "", projet: "", lignes: [newLine()], afficherTotalAPayer: true, tauxTVA: 20, appliquerRasIS: true, tauxRasIS: 5, appliquerRasTVA: true, tauxRasTVA: 75 };
}
export function newLine(): InvoiceLine {
  return { id: crypto.randomUUID(), designation: "", unite: "F", quantite: 1, prixUnitaire: 0 };
}
export function exampleInvoice(): Invoice {
  return { ...newInvoice(13), date: "2025-09-04", destinataire: "Gouverneur de la province de Fahs-Anjra", reference: "73/2024/INDH", projet: "Etude et suivi des travaux de réhabilitation et d’aménagement des établissements de protection sociale Dar Talib et Taliba à la commune Jouamaa, Melloussa, Ksar Sghir et Taghramt – Province Fahs Anjra.", lignes: [
    { id: "exemple-1", designation: "Diagnostic, expertise des réseaux d’eau potable et de rejet des eaux usées et solution à adopter -Identification des besoins en aménagement des Dar Talib et Taliba - Etablissement du DCE", unite: "F", quantite: 1, prixUnitaire: 6500 },
    { id: "exemple-2", designation: "Suivi et contrôle des travaux - Vérification et certification des attachements et des décomptes -Assistance du M.O lors de la réception provisoire des travaux.", unite: "F", quantite: 1, prixUnitaire: 4500 },
  ] };
}
