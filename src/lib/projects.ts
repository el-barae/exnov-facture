import { z } from "zod";

export const WORKFLOW_STEPS = [
  { id: "cadrage", title: "Accord & devis", description: "Cadrer la mission avec le maître d’ouvrage et obtenir son accord sur le devis." },
  { id: "visite", title: "Visite du site", description: "Effectuer la visite du terrain ou de l’ouvrage. Des photos peuvent être ajoutées au dossier." },
  { id: "diagnostic", title: "Diagnostic", description: "Consolider les observations dans un rapport de visite et de diagnostic exploitable." },
  { id: "chiffrage", title: "Chiffrage BDP", description: "Établir le bordereau des prix et faire valider le chiffrage par le maître d’ouvrage." },
  { id: "etudes", title: "Études techniques", description: "Réaliser les études techniques et les calculs nécessaires à la mission." },
  { id: "livrables", title: "CPS & plans", description: "Contrôler la cohérence du dossier et préparer les livrables techniques." },
  { id: "validation", title: "Validation du MO", description: "Remettre le dossier au maître d’ouvrage et recueillir sa validation." },
  { id: "facturation", title: "Facturation", description: "Joindre la facture de la mission. Cette étape suit la facturation, pas le règlement." },
] as const;

export const stepIdSchema = z.enum(["cadrage", "visite", "diagnostic", "chiffrage", "etudes", "livrables", "validation", "facturation"]);
export type StepId = z.infer<typeof stepIdSchema>;
export const documentKindSchema = z.enum(["devis", "photo", "rapport", "bdp-estimatif", "bdp", "note-calcul", "cps", "plans", "validation-mo", "facture", "autre"]);
export type DocumentKind = z.infer<typeof documentKindSchema>;
export const DOCUMENT_KINDS: { id: DocumentKind; label: string; stepId: StepId; requiredByDefault: boolean }[] = [
  { id: "devis", label: "Devis accepté", stepId: "cadrage", requiredByDefault: true },
  { id: "photo", label: "Photos de visite", stepId: "visite", requiredByDefault: false },
  { id: "rapport", label: "Rapport de diagnostic", stepId: "diagnostic", requiredByDefault: true },
  { id: "bdp-estimatif", label: "BDP estimatif", stepId: "chiffrage", requiredByDefault: false },
  { id: "bdp", label: "BDP validé", stepId: "chiffrage", requiredByDefault: true },
  { id: "note-calcul", label: "Note de calcul", stepId: "etudes", requiredByDefault: true },
  { id: "cps", label: "CPS", stepId: "livrables", requiredByDefault: true },
  { id: "plans", label: "Plans", stepId: "livrables", requiredByDefault: true },
  { id: "validation-mo", label: "Accord / PV de validation du MO", stepId: "validation", requiredByDefault: true },
  { id: "facture", label: "Facture", stepId: "facturation", requiredByDefault: true },
  { id: "autre", label: "Autre document", stepId: "cadrage", requiredByDefault: false },
];
export const DEFAULT_REQUIRED_DOCUMENTS = DOCUMENT_KINDS.filter(kind => kind.requiredByDefault).map(kind => kind.id);
export const MAX_PROJECT_FILE_SIZE = 20 * 1024 * 1024;
export const PROJECT_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.zip";

export const projectDetailsSchema = z.object({
  name: z.string().trim().min(1, "Renseignez le nom du projet.").max(160),
  client: z.string().trim().min(1, "Renseignez le maître d’ouvrage.").max(160),
  site: z.string().trim().max(250),
  reference: z.string().trim().max(80),
  withBdp: z.boolean(),
  requiredDocuments: z.array(documentKindSchema).max(DOCUMENT_KINDS.length).refine(value => new Set(value).size === value.length),
});
export type ProjectDetails = z.infer<typeof projectDetailsSchema>;

export const projectDocumentSchema = z.object({
  id: z.string().uuid(), kind: documentKindSchema,
  name: z.string().min(1).max(255), size: z.number().int().positive().max(MAX_PROJECT_FILE_SIZE),
  mime: z.string().max(200), uploadedAt: z.string().datetime(),
});
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;
const projectRecordSchema = projectDetailsSchema.extend({
  id: z.string().uuid(), revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  documents: z.array(projectDocumentSchema).max(200),
  completedSteps: z.array(z.object({ stepId: stepIdSchema, completedAt: z.string().datetime() })).max(WORKFLOW_STEPS.length),
  history: z.array(z.object({ id: z.string().uuid(), date: z.string().datetime(), message: z.string().max(1000) })),
});
export type CivilProject = z.infer<typeof projectRecordSchema>;
export const projectSchema = projectRecordSchema.superRefine((project, context) => {
  const steps = projectSteps(project);
  for (const [index, completion] of project.completedSteps.entries()) {
    if (steps[index]?.id !== completion.stepId || missingDocuments(project, completion.stepId).length) {
      context.addIssue({ code: "custom", message: "La progression du projet ne correspond pas aux étapes et aux documents disponibles." });
      break;
    }
  }
  if (new Set(project.documents.map(doc => doc.id)).size !== project.documents.length) {
    context.addIssue({ code: "custom", message: "Identifiants de documents dupliqués." });
  }
});

export function projectSteps(project: Pick<CivilProject, "withBdp">) {
  return WORKFLOW_STEPS.filter(step => project.withBdp || step.id !== "chiffrage");
}
export function currentProjectStep(project: CivilProject) {
  return projectSteps(project)[project.completedSteps.length];
}
export function requiredDocuments(project: CivilProject, stepId: StepId) {
  return DOCUMENT_KINDS.filter(kind => kind.stepId === stepId && project.requiredDocuments.includes(kind.id) && (project.withBdp || kind.stepId !== "chiffrage"));
}
export function missingDocuments(project: CivilProject, stepId: StepId) {
  return requiredDocuments(project, stepId).filter(kind => !project.documents.some(doc => doc.kind === kind.id));
}
export function projectProgress(project: CivilProject) {
  return Math.round(project.completedSteps.length / projectSteps(project).length * 100);
}
export function documentLabel(kind: DocumentKind) {
  return DOCUMENT_KINDS.find(value => value.id === kind)!.label;
}
export function createProject(details: ProjectDetails, now = new Date().toISOString()): CivilProject {
  return projectSchema.parse({ ...projectDetailsSchema.parse(details), id: crypto.randomUUID(), revision: 0,
    createdAt: now, updatedAt: now, documents: [], completedSteps: [],
    history: [{ id: crypto.randomUUID(), date: now, message: "Projet créé." }],
  });
}

export function validateProjectFile(file: Pick<File, "name" | "size">) {
  if (file.size === 0) throw new Error("Le fichier est vide. Choisissez un document contenant des données.");
  if (file.size > MAX_PROJECT_FILE_SIZE) throw new Error("Ce fichier dépasse la limite de 20 Mo.");
  if (!PROJECT_FILE_ACCEPT.split(",").some(extension => file.name.toLowerCase().endsWith(extension))) {
    throw new Error("Format non accepté. Ajoutez un PDF, un document Office, une image, un fichier DWG/DXF ou ZIP.");
  }
  if (file.name.length > 255) throw new Error("Le nom du fichier est trop long (255 caractères maximum).");
}

export type ProjectAction =
  | { type: "complete"; stepId: StepId }
  | { type: "attach"; document: ProjectDocument }
  | { type: "removeDocument"; documentId: string }
  | { type: "reopen"; stepId: StepId }
  | { type: "edit"; details: ProjectDetails };

/** Toutes les transitions sont contrôlées ici, y compris celles lancées depuis un autre onglet. */
export function applyProjectAction(project: CivilProject, action: ProjectAction, now = new Date().toISOString()): CivilProject {
  let next = { ...project };
  let message: string;
  if (action.type === "complete") {
    const step = currentProjectStep(project);
    if (!step || step.id !== action.stepId) throw new Error("Validez d’abord l’étape en cours. Une étape ne peut être validée qu’une seule fois.");
    const missing = missingDocuments(project, action.stepId);
    if (missing.length) throw new Error(`Documents nécessaires : ${missing.map(kind => kind.label).join(", ")}.`);
    next.completedSteps = [...project.completedSteps, { stepId: step.id, completedAt: now }];
    message = `Étape validée : ${step.title}.`;
  } else if (action.type === "attach") {
    const doc = projectDocumentSchema.parse(action.document);
    if (project.documents.length >= 200) throw new Error("Le dossier est limité à 200 documents.");
    if (project.documents.some(existing => existing.id === doc.id)) throw new Error("Ce document existe déjà.");
    next.documents = [...project.documents, doc];
    message = `Document ajouté : ${documentLabel(doc.kind)} — ${doc.name}.`;
  } else if (action.type === "removeDocument") {
    const doc = project.documents.find(value => value.id === action.documentId);
    if (!doc) throw new Error("Ce document n’existe plus.");
    next.documents = project.documents.filter(value => value.id !== action.documentId);
    if (project.completedSteps.some(completion => missingDocuments(next, completion.stepId).length)) {
      throw new Error("Ce document justifie une étape validée. Ajoutez son remplacement ou reprenez d’abord cette étape.");
    }
    message = `Document retiré : ${doc.name}.`;
  } else if (action.type === "reopen") {
    const index = project.completedSteps.findIndex(completion => completion.stepId === action.stepId);
    if (index === -1) throw new Error("Seule une étape déjà validée peut être reprise.");
    next.completedSteps = project.completedSteps.slice(0, index);
    message = `Reprise à l’étape « ${WORKFLOW_STEPS.find(step => step.id === action.stepId)!.title} ». Les validations suivantes sont à refaire ; les documents sont conservés.`;
  } else {
    const details = projectDetailsSchema.parse(action.details);
    // Les exigences d’une mission engagée restent stables. Une reprise au cadrage permet de les changer.
    if (project.completedSteps.length && (details.withBdp !== project.withBdp || [...details.requiredDocuments].sort().join() !== [...project.requiredDocuments].sort().join())) {
      throw new Error("Reprenez la première étape avant de modifier le parcours ou les documents requis.");
    }
    next = { ...next, ...details };
    message = "Informations du projet mises à jour.";
  }
  return projectSchema.parse({ ...next, revision: project.revision + 1, updatedAt: now,
    history: [...project.history, { id: crypto.randomUUID(), date: now, message }],
  });
}
