import { z } from "zod";

export const MAX_REPORT_IMAGES = 6;
export const MAX_IMAGE_BYTES = 400_000;
export const MAX_REPORT_REQUEST_BYTES = 3_800_000;
export const MAX_REPORT_TURNS = 20;
export const MAX_REPORT_PROMPT_LENGTH = 12000;
const text = (max: number) => z.string().trim().max(max);
const imageId = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);

export const reportSchema = z.strictObject({
  title: text(160).min(1), subtitle: text(300),
  project: text(300), client: text(200), reference: text(100),
  date: z.union([z.iso.date(), z.literal("")]),
  sections: z.array(z.strictObject({
    heading: text(160).min(1),
    paragraphs: z.array(text(3000).min(1)).max(12),
    bullets: z.array(text(800).min(1)).max(16),
    images: z.array(z.strictObject({ imageId, caption: text(500) })).max(MAX_REPORT_IMAGES),
  })).min(1).max(20),
}).refine(report => JSON.stringify(report).length <= 100_000, "Le rapport est trop long.");

// Seules les images raster embarquées sont acceptées, jamais des URL ni du SVG.
export const reportImageSchema = z.strictObject({
  id: imageId, name: text(160).min(1),
  dataUrl: z.string().max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 40)
    .regex(/^data:image\/(?:jpeg|png|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
const imagesSchema = z.array(reportImageSchema).max(MAX_REPORT_IMAGES)
  .refine(images => new Set(images.map(image => image.id)).size === images.length, "Les images doivent avoir des identifiants distincts.");
export const reportMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]), content: text(MAX_REPORT_PROMPT_LENGTH).min(1),
});
export const reportChatSchema = z.strictObject({
  messages: z.array(reportMessageSchema).min(1).max(MAX_REPORT_TURNS * 2 - 1),
  images: imagesSchema, report: reportSchema.nullable(),
}).refine(value => value.messages.every((message, index) => message.role === (index % 2 === 0 ? "user" : "assistant")) && value.messages.at(-1)?.role === "user", "La conversation est invalide.");
export const reportReplySchema = z.strictObject({
  message: text(6000).min(1), report: reportSchema.nullable(),
});
export const reportExportSchema = z.strictObject({ report: reportSchema, images: imagesSchema });
export type Report = z.infer<typeof reportSchema>;
export type ReportImage = z.infer<typeof reportImageSchema>;
export type ReportMessage = z.infer<typeof reportMessageSchema>;
export type ReportChat = z.infer<typeof reportChatSchema>;
export type ReportReply = z.infer<typeof reportReplySchema>;

export function reportHasMissingImages(report: Report, images: ReportImage[]) {
  const ids = new Set(images.map(image => image.id));
  return report.sections.some(section => section.images.some(image => !ids.has(image.imageId)));
}

export function reportFilename(report: Report) {
  const title = report.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return `Rapport-EXNOV-${title || "document"}.pdf`;
}

export function exampleReport(): Report {
  return {
    title: "Rapport de visite de chantier", subtitle: "Exemple de présentation · données fictives",
    project: "Réhabilitation d’un bâtiment — Tanger", client: "Maître d’ouvrage (exemple)",
    reference: "RAP-EXEMPLE-001", date: "",
    sections: [
      { heading: "Objet de la visite", paragraphs: ["Ce document illustre la présentation des rapports EXNOV. Il pourra être remplacé par un rapport rédigé à partir de vos consignes et des photographies du projet."], bullets: [], images: [] },
      { heading: "Observations", paragraphs: ["Les constats sont organisés par zone ou par ouvrage. Les photographies jointes peuvent être intégrées avec une légende pour documenter chaque observation."], bullets: ["Décrire les éléments observés et leur localisation.", "Distinguer les constats, les hypothèses et les informations à confirmer."], images: [] },
      { heading: "Actions et suivi", paragraphs: ["Les actions proposées, leurs responsables et les échéances seront précisés à partir des informations que vous fournirez."], bullets: ["Compléter les informations du projet.", "Relire et valider les observations avant diffusion."], images: [] },
    ],
  };
}
