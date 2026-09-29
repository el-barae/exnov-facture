import { svgBounds } from "./svg";
import type { CadPlan } from "./types";
import { parsePlan } from "./validation";

export const CAD_PDF_SCALES = [20, 50, 100, 200, 500] as const;
export type CadPdfSettings = {
  paper: "A4" | "A3";
  orientation: "portrait" | "landscape";
  scale: (typeof CAD_PDF_SCALES)[number];
  project: string;
  client: string;
  reference: string;
  drawnBy: string;
  date: string;
};
export type CadPdfProject = { name: string; client: string; reference: string };
export const CAD_PDF_MARGIN_MM = 10;
export const CAD_PDF_CARTOUCHE_MM = 42;
const FRAME_GAP_MM = 5;
const FRAME_PADDING_MM = 2;

export function defaultCadPdfSettings(project?: CadPdfProject): CadPdfSettings {
  const date = new Date();
  return {
    paper: "A4", orientation: "landscape", scale: 100,
    project: project?.name.slice(0, 120) ?? "", client: project?.client.slice(0, 100) ?? "",
    reference: project?.reference.slice(0, 80) ?? "", drawnBy: "",
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  };
}

function text(value: unknown, field: string, limit: number): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u001f\u007f\ufffe\uffff]/.test(value)
      || Array.from(value).some((character) => character.length === 1 && /[\ud800-\udfff]/.test(character))) {
    throw new Error(`Le champ ${field} doit contenir au maximum ${limit} caractères sans saut de ligne.`);
  }
  return value.trim();
}

export function parseCadPdfSettings(input: unknown): CadPdfSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Les paramètres PDF sont manquants.");
  const raw = input as Record<string, unknown>;
  if (raw.paper !== "A4" && raw.paper !== "A3") throw new Error("Choisissez un format PDF A4 ou A3.");
  if (raw.orientation !== "portrait" && raw.orientation !== "landscape") throw new Error("Choisissez une orientation portrait ou paysage.");
  if (!CAD_PDF_SCALES.includes(raw.scale as CadPdfSettings["scale"])) throw new Error("Choisissez une échelle 1:20, 1:50, 1:100, 1:200 ou 1:500.");
  const date = text(raw.date, "date", 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error("La date du cartouche est invalide.");
  return {
    paper: raw.paper, orientation: raw.orientation, scale: raw.scale as CadPdfSettings["scale"],
    project: text(raw.project, "projet", 120), client: text(raw.client, "client", 100),
    reference: text(raw.reference, "référence", 80), drawnBy: text(raw.drawnBy, "dessiné par", 60), date,
  };
}

/** Shared by the browser preflight and the server; model coordinates are metres. */
export function cadPdfLayout(plan: CadPlan, settings: CadPdfSettings) {
  const short = settings.paper === "A3" ? 297 : 210;
  const long = settings.paper === "A3" ? 420 : 297;
  const sheetWidthMm = settings.orientation === "landscape" ? long : short;
  const sheetHeightMm = settings.orientation === "landscape" ? short : long;
  const outerFrameWidthMm = sheetWidthMm - CAD_PDF_MARGIN_MM * 2;
  const outerFrameHeightMm = sheetHeightMm - CAD_PDF_MARGIN_MM * 2 - CAD_PDF_CARTOUCHE_MM - FRAME_GAP_MM;
  const frameWidthMm = outerFrameWidthMm - FRAME_PADDING_MM * 2;
  const frameHeightMm = outerFrameHeightMm - FRAME_PADDING_MM * 2;
  const bounds = svgBounds(plan);
  const millimetresPerMetre = 1000 / settings.scale;
  const svgWidthMm = bounds.width * millimetresPerMetre;
  const svgHeightMm = bounds.height * millimetresPerMetre;
  return {
    sheetWidthMm, sheetHeightMm, outerFrameWidthMm, outerFrameHeightMm, frameWidthMm, frameHeightMm,
    drawingWidthMm: svgWidthMm, drawingHeightMm: svgHeightMm, svgWidthMm, svgHeightMm, bounds,
    svgLeftMm: CAD_PDF_MARGIN_MM + (outerFrameWidthMm - svgWidthMm) / 2,
    svgTopMm: CAD_PDF_MARGIN_MM + (outerFrameHeightMm - svgHeightMm) / 2,
    millimetresPerMetre,
    fits: svgWidthMm <= frameWidthMm + 1e-7 && svgHeightMm <= frameHeightMm + 1e-7,
  };
}

export function cadPdfFitMessage(layout: ReturnType<typeof cadPdfLayout>): string {
  return `Le dessin (${layout.drawingWidthMm.toFixed(1)} × ${layout.drawingHeightMm.toFixed(1)} mm, marges du dessin incluses) dépasse la zone disponible (${layout.frameWidthMm} × ${layout.frameHeightMm} mm). Choisissez une feuille plus grande, une autre orientation ou une échelle plus petite (par exemple 1:200).`;
}

export function parseCadPdfRequest(input: unknown): { plan: CadPlan; settings: CadPdfSettings } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("La demande PDF doit être un objet.");
  const value = input as Record<string, unknown>;
  return { plan: parsePlan(value.plan), settings: parseCadPdfSettings(value.settings) };
}

export function cadPdfFilename(plan: Pick<CadPlan, "name">): string {
  return `${plan.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "plan"}.pdf`;
}
