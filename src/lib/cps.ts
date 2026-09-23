import { z } from "zod";
import Decimal from "decimal.js";

const CpsDecimal = Decimal.clone({ precision: 40 });

export const MAX_CPS_REQUEST_BYTES = 3_500_000;
export const MAX_CPS_LOGO_BYTES = 700_000;
export const CPS_PLACEHOLDER = "[À compléter]";
const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => text(max).min(1);
const decimal = z.string().regex(/^\d{1,9}(?:\.\d{1,4})?$/).nullable();
const money = z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/).nullable();

export const cpsArticleSchema = z.object({
  title: required(200), paragraphs: z.array(required(4000)).min(1).max(16),
});
export const cpsSchema = z.object({
  title: required(400), authority: text(600), owner: text(300), location: text(250),
  reference: text(120), procedure: text(500), deadline: text(250),
  administrative: z.array(cpsArticleSchema).min(1).max(60),
  technical: z.array(z.object({ title: required(200), articles: z.array(cpsArticleSchema).min(1).max(20) })).min(1).max(24),
  works: z.array(z.object({
    title: required(300), unit: required(50), paragraphs: z.array(required(4000)).min(1).max(12),
    quantity: decimal, unitPrice: money,
  })).min(1).max(150),
  vatRate: z.string().regex(/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/).nullable(),
  missingInformation: z.array(required(500)).max(60),
});
export const cpsReferenceSchema = z.enum(["auto", "culturel", "souk", "social", "administratif"]);
export const cpsGenerateSchema = z.object({
  prompt: required(16000), reference: cpsReferenceSchema,
  document: cpsSchema.nullable(),
});
export const cpsReplySchema = z.object({ message: required(1000), document: cpsSchema });
// Le navigateur normalise le logo en PNG, sans exécuter ni incorporer de SVG dans Word.
export const cpsLogoSchema = z.object({
  name: required(160),
  dataUrl: z.string().max(Math.ceil(MAX_CPS_LOGO_BYTES * 4 / 3) + 30).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
  width: z.number().int().min(1).max(1200), height: z.number().int().min(1).max(1200),
});
export const cpsExportSchema = z.object({ document: cpsSchema, logo: cpsLogoSchema.nullable() });
export type Cps = z.infer<typeof cpsSchema>;
export type CpsArticle = z.infer<typeof cpsArticleSchema>;
export type CpsLogo = z.infer<typeof cpsLogoSchema>;
export type CpsGenerate = z.infer<typeof cpsGenerateSchema>;
export type CpsReply = z.infer<typeof cpsReplySchema>;

export function cpsValue(value: string) { return value || CPS_PLACEHOLDER; }
export function cpsFilename(document: Cps) {
  const slug = document.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
  return `CPS-${slug || "document"}.docx`;
}
export function cpsNumber(value: string | null) {
  if (value === null) return CPS_PLACEHOLDER;
  return new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 4 }).format(Number(value));
}
export function cpsAmount(value: string | null) {
  if (value === null) return CPS_PLACEHOLDER;
  return new CpsDecimal(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ").replace(".", ",");
}
export function cpsTotals(document: Cps) {
  const lines = document.works.map(work => work.quantity === null || work.unitPrice === null ? null : new CpsDecimal(work.quantity).mul(work.unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2));
  const ht = lines.some(line => line === null) ? null : lines.reduce<Decimal>((sum, line) => sum.plus(line!), new CpsDecimal(0)).toFixed(2);
  const vat = ht === null || document.vatRate === null ? null : new CpsDecimal(ht).mul(document.vatRate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  return { lines, ht, vat, ttc: ht === null || vat === null ? null : new CpsDecimal(ht).plus(vat).toFixed(2) };
}

export const CPS_CHAPTERS = ["Clauses administratives et financières", "Cahier des prescriptions techniques", "Description des ouvrages", "Bordereau des prix — détail estimatif"];
export const CPS_EXAMPLE_PROMPT = "Rédige un CPS pour la réhabilitation d’un centre de proximité à Tanger. Maître d’ouvrage : Commune de Tanger. Travaux : reprise des enduits, peinture intérieure sur 450 m², remplacement de 6 portes en aluminium, réfection des sanitaires et mise à niveau de l’éclairage. Délai d’exécution : 3 mois. Décris la préparation des supports, la protection des locaux, les matériaux, les contrôles et le nettoyage. Les prix, le numéro du marché et les conditions financières restent à compléter.";
