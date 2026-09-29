import { z } from "zod";

export const MAX_REPORT_IMAGES = 6;
export const MAX_IMAGE_BYTES = 400_000;
export const MAX_REPORT_REQUEST_BYTES = 3_800_000;
export const MAX_REPORT_TURNS = 20;
export const MAX_REPORT_PROMPT_LENGTH = 12000;
const text = (max: number) => z.string().trim().max(max);
const imageId = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
const reportDate = z.union([z.iso.date(), z.literal("")]);

const reportMetadataSchema = z.strictObject({
  location: text(200), visitDate: reportDate,
  author: text(160), reviewer: text(160), version: text(60),
});
const reportFindingSchema = z.strictObject({
  location: text(200), observation: text(1200).min(1),
  basis: z.enum(["visuel", "information", "document", "a_confirmer"]),
  analysis: text(1200), recommendation: text(800),
});
const reportActionSchema = z.strictObject({
  location: text(200), description: text(800).min(1),
  owner: text(160), dueDate: text(160),
  priority: z.enum(["a_confirmer", "courante", "prioritaire", "urgente"]),
  status: z.enum(["a_faire", "en_cours", "a_verifier", "terminee"]),
});

export const reportSchema = z.strictObject({
  title: text(160).min(1), subtitle: text(300),
  project: text(300), client: text(200), reference: text(100),
  date: reportDate,
  // Facultatifs pour que les rapports déjà enregistrés restent lisibles.
  metadata: reportMetadataSchema.optional(), summary: text(2400).optional(),
  actions: z.array(reportActionSchema).max(20).optional(),
  sections: z.array(z.strictObject({
    heading: text(160).min(1),
    paragraphs: z.array(text(3000).min(1)).max(12),
    bullets: z.array(text(800).min(1)).max(16),
    images: z.array(z.strictObject({ imageId, caption: text(500) })).max(MAX_REPORT_IMAGES),
    findings: z.array(reportFindingSchema).max(8).optional(),
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
export type ReportMetadata = z.infer<typeof reportMetadataSchema>;
export type ReportFinding = z.infer<typeof reportFindingSchema>;
export type ReportAction = z.infer<typeof reportActionSchema>;
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
    title: "Rapport de suivi de chantier", subtitle: "Exemple de présentation · scénario et données entièrement fictifs",
    project: "Réhabilitation d’un bâtiment — Tanger", client: "Maître d’ouvrage (exemple)",
    reference: "RAP-EXEMPLE-001", date: "",
    metadata: { location: "Tanger — bâtiment de démonstration", visitDate: "", author: "", reviewer: "", version: "Exemple" },
    summary: "Ce scénario fictif illustre un suivi de chantier EXNOV. Les travaux de préparation sont décrits comme en cours. Deux points nécessitent un suivi : une fissuration localisée dont les caractéristiques restent à relever, et la disponibilité des documents d’exécution avant poursuite des travaux concernés. Aucune conclusion sur la sécurité ou la conformité ne peut être tirée de cet exemple.",
    actions: [
      { location: "Rez-de-chaussée — façade cour", description: "Faire relever la localisation, l’ouverture et l’étendue de la fissuration, puis soumettre les observations à un examen technique avant de définir une réparation.", owner: "", dueDate: "", priority: "a_confirmer", status: "a_verifier" },
      { location: "Zone des travaux de reprise", description: "Rassembler les plans d’exécution applicables et leurs indices, puis confirmer les prescriptions à retenir pour les travaux concernés.", owner: "", dueDate: "", priority: "a_confirmer", status: "a_verifier" },
    ],
    sections: [
      { heading: "Objet et périmètre", paragraphs: ["Ce rapport de démonstration présente l’organisation d’un suivi de chantier de réhabilitation. Il ne décrit aucune visite réelle. Le périmètre illustré couvre les travaux préparatoires, les observations sur les ouvrages existants et les documents nécessaires aux reprises."], bullets: [], images: [], findings: [] },
      { heading: "Documents et informations disponibles", paragraphs: ["Aucun plan, résultat d’essai ou compte rendu réel n’est joint à cet exemple. Les références et indices des documents effectivement consultés devront être indiqués dans le rapport du projet."], bullets: ["Plans d’exécution et indices applicables : à confirmer.", "Date de visite, intervenants et périmètre d’accès : à renseigner."], images: [], findings: [] },
      { heading: "Avancement des travaux", paragraphs: ["Dans ce scénario fictif, la préparation des zones de travail est annoncée en cours. L’avancement quantifié et sa comparaison avec le planning restent à documenter ; aucun pourcentage ni retard n’est présumé."], bullets: [], images: [], findings: [] },
      { heading: "Constats et analyse technique", paragraphs: ["Les observations ci-dessous sont fictives. Pour un rapport réel, chaque constat doit être rattaché à une zone, à une information ou à un document identifiable."], bullets: [], images: [], findings: [
        { location: "Rez-de-chaussée — façade cour", observation: "Le scénario de démonstration signale une fissuration localisée sur le parement. Aucune photographie ni mesure n’est disponible.", basis: "information", analysis: "L’origine, la profondeur et l’évolution de la fissuration ne sont pas établies. Ce seul signalement ne permet pas de conclure sur son incidence structurelle.", recommendation: "Documenter le désordre et organiser les vérifications nécessaires avant de proposer un traitement." },
        { location: "Zone des travaux de reprise", observation: "Les plans d’exécution et leurs indices ne sont pas renseignés dans les données de démonstration.", basis: "a_confirmer", analysis: "L’absence de document dans les données fournies ne prouve pas son absence sur le chantier. Les prescriptions applicables restent à identifier.", recommendation: "Confirmer les documents disponibles et les références utilisées pour les travaux concernés." },
      ] },
      { heading: "Organisation du suivi", paragraphs: ["Les deux actions sont regroupées dans le tableau de suivi du rapport. Leurs responsables, échéances et niveaux de priorité restent à confirmer. Le statut « À vérifier » indique que leur avancement n’a pas été établi."], bullets: ["Associer chaque action à une preuve de traitement : relevé, document, essai ou nouvelle observation.", "Faire confirmer l’état de traitement avant de déclarer une action terminée."], images: [], findings: [] },
      { heading: "Conclusion et limites", paragraphs: ["Cet exemple montre comment distinguer informations disponibles, analyse et actions proposées. Il ne constitue ni une validation technique ni une attestation de conformité. Le rapport du projet devra être complété avec les éléments réels et vérifié par les intervenants désignés avant diffusion."], bullets: [], images: [], findings: [] },
    ],
  };
}
