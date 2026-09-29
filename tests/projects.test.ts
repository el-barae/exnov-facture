import test from "node:test";
import assert from "node:assert/strict";
import { applyProjectAction, createProject, currentProjectStep, DEFAULT_REQUIRED_DOCUMENTS, MAX_PROJECT_FILE_SIZE, missingDocuments, projectProgress, projectSchema, projectSteps, validateProjectFile, type CivilProject, type DocumentKind, type ProjectDetails, type StepId } from "../src/lib/projects";

const details: ProjectDetails = { name: "Aménagement du souk", client: "Commune", reference: "GC-001", site: "Tanger", withBdp: true, requiredDocuments: [...DEFAULT_REQUIRED_DOCUMENTS] };
function attach(project: CivilProject, kind: DocumentKind, name = `${kind}.pdf`) {
  return applyProjectAction(project, { type: "attach", document: { id: crypto.randomUUID(), kind, name, size: 200, mime: "application/pdf", uploadedAt: new Date().toISOString() } });
}
function complete(project: CivilProject, stepId: StepId) { return applyProjectAction(project, { type: "complete", stepId }); }

test("Un projet commence au devis et bloque les étapes futures ainsi que les pièces manquantes", () => {
  const project = createProject(details);
  assert.equal(currentProjectStep(project)?.id, "cadrage");
  assert.equal(projectProgress(project), 0);
  assert.throws(() => complete(project, "visite"), /d’abord/);
  assert.throws(() => complete(project, "cadrage"), /Devis accepté/);
  assert.deepEqual(project.completedSteps, []);
  assert.deepEqual(project.documents, []);
  const ready = attach(project, "devis");
  const next = complete(ready, "cadrage");
  assert.equal(next.completedSteps.length, 1);
  assert.equal(currentProjectStep(next)?.id, "visite");
  assert.throws(() => complete(next, "cadrage"), /une seule fois/);
  assert.equal(complete(next, "visite").completedSteps.length, 2, "Visite sans document obligatoire par défaut");
});

test("Des documents fournis en avance sont réutilisés, et le parcours atteint réellement 100 %", () => {
  let project = createProject(details);
  for (const kind of DEFAULT_REQUIRED_DOCUMENTS) project = attach(project, kind, "dossier.pdf");
  const documentIds = project.documents.map(doc => doc.id);
  for (const step of projectSteps(project)) {
    assert.deepEqual(missingDocuments(project, step.id), []);
    project = complete(project, step.id);
  }
  assert.equal(currentProjectStep(project), undefined);
  assert.equal(projectProgress(project), 100);
  assert.deepEqual(project.documents.map(doc => doc.id), documentIds);
  assert.equal(project.history.filter(event => event.message.startsWith("Étape validée")).length, 9);
  assert.throws(() => complete(project, "facturation"), /une seule fois/);
});

test("Sans BDP le parcours a huit étapes, sans blocage sur les documents de chiffrage", () => {
  let project = createProject({ ...details, withBdp: false });
  assert.equal(projectSteps(project).length, 8);
  for (const kind of DEFAULT_REQUIRED_DOCUMENTS.filter(kind => kind !== "bdp")) project = attach(project, kind);
  for (const step of projectSteps(project)) project = complete(project, step.id);
  assert.equal(projectProgress(project), 100);
  assert.equal(project.completedSteps.some(step => step.stepId === "chiffrage"), false);
});

test("Le CPS et les plans sont deux exigences distinctes ; un autre type ne les remplace pas", () => {
  let project = attach(createProject(details), "autre", "plans.pdf");
  project = attach(project, "cps");
  assert.deepEqual(missingDocuments(project, "livrables").map(kind => kind.id), ["plans"]);
  project = attach(project, "plans");
  assert.deepEqual(missingDocuments(project, "livrables"), []);
});

test("Les exigences peuvent être adaptées à la mission, puis restent stables après démarrage", () => {
  let project = createProject({ ...details, requiredDocuments: ["photo"] });
  project = complete(project, "cadrage");
  assert.throws(() => complete(project, "visite"), /Photos/);
  assert.throws(() => applyProjectAction(project, { type: "edit", details }), /première étape/);
  const renamed = applyProjectAction(project, { type: "edit", details: { ...project, name: "Projet renommé" } });
  assert.equal(renamed.name, "Projet renommé");
  const reopened = applyProjectAction(renamed, { type: "reopen", stepId: "cadrage" });
  assert.equal(applyProjectAction(reopened, { type: "edit", details }).requiredDocuments.length, DEFAULT_REQUIRED_DOCUMENTS.length);
});

test("Reprendre un diagnostic invalide les étapes suivantes en conservant documents et historique", () => {
  let project = createProject(details);
  for (const kind of DEFAULT_REQUIRED_DOCUMENTS) project = attach(project, kind);
  for (const step of projectSteps(project)) project = complete(project, step.id);
  const reopened = applyProjectAction(project, { type: "reopen", stepId: "diagnostic" });
  assert.deepEqual(reopened.completedSteps.map(step => step.stepId), ["cadrage", "visite"]);
  assert.equal(currentProjectStep(reopened)?.id, "diagnostic");
  assert.deepEqual(reopened.documents, project.documents);
  assert.equal(reopened.history.length, project.history.length + 1);
  assert.equal(reopened.revision, project.revision + 1);
  assert.throws(() => applyProjectAction(reopened, { type: "reopen", stepId: "livrables" }), /déjà validée/);
});

test("Une pièce justifiant une validation ne peut être supprimée sans remplacement ou reprise", () => {
  const project = complete(attach(createProject(details), "devis"), "cadrage");
  const documentId = project.documents[0].id;
  assert.throws(() => applyProjectAction(project, { type: "removeDocument", documentId }), /justifie/);
  const replacement = attach(project, "devis", "devis-v2.pdf");
  assert.equal(applyProjectAction(replacement, { type: "removeDocument", documentId }).documents.length, 1);
  const reopened = applyProjectAction(project, { type: "reopen", stepId: "cadrage" });
  assert.equal(applyProjectAction(reopened, { type: "removeDocument", documentId }).documents.length, 0);
  assert.equal(project.documents.length, 1, "Une action refusée ne modifie pas l’objet original");
});

test("Les données incohérentes, les séquences rompues et les identifiants dupliqués sont rejetés", () => {
  const project = attach(createProject(details), "devis");
  const now = new Date().toISOString();
  assert.equal(projectSchema.safeParse({ ...project, completedSteps: [{ stepId: "visite", completedAt: now }] }).success, false);
  assert.equal(projectSchema.safeParse({ ...project, documents: [], completedSteps: [{ stepId: "cadrage", completedAt: now }] }).success, false);
  assert.equal(projectSchema.safeParse({ ...project, documents: [...project.documents, ...project.documents] }).success, false);
  assert.throws(() => createProject({ ...details, name: "   " }));
});

test("Les pièces vides, trop volumineuses ou de format non pris en charge sont refusées", () => {
  assert.throws(() => validateProjectFile({ name: "test.pdf", size: 0 }), /vide/);
  assert.throws(() => validateProjectFile({ name: "test.pdf", size: MAX_PROJECT_FILE_SIZE + 1 }), /20 Mo/);
  assert.throws(() => validateProjectFile({ name: "rapport.pdf.exe", size: 100 }), /Format/);
  assert.doesNotThrow(() => validateProjectFile({ name: "PLANS.DWG", size: MAX_PROJECT_FILE_SIZE }));
  assert.doesNotThrow(() => validateProjectFile({ name: "Rapport.PDF", size: 1200 }));
});

test("Remplacer un plan JSON conserve la pièce et les validations, puis incrémente sa révision", () => {
  let project = createProject(details);
  for (const kind of DEFAULT_REQUIRED_DOCUMENTS) project = attach(project, kind, kind === "plans" ? "Plan-RDC.JSON" : `${kind}.pdf`);
  for (const step of projectSteps(project)) project = complete(project, step.id);
  project = applyProjectAction(project, { type: "edit", details: { ...project, site: "Site actualisé entre-temps" } });
  const document = project.documents.find(value => value.kind === "plans")!;
  assert.equal(document.revision, undefined, "Les anciens documents représentent la révision zéro");
  const now = "2030-01-02T12:00:00.000Z";
  const result = applyProjectAction(project, { type: "replacePlan", document: { ...document, size: 1500, mime: "application/json", revision: 99 }, expectedDocumentRevision: 0 }, now);
  const replacement = result.documents.find(value => value.id === document.id)!;
  assert.equal(result.documents.length, project.documents.length);
  assert.equal(replacement.name, document.name);
  assert.equal(replacement.kind, "plans");
  assert.equal(replacement.revision, 1, "La révision déclarée par le remplaçant ne fait pas autorité");
  assert.equal(replacement.uploadedAt, now);
  assert.equal(replacement.size, 1500);
  assert.deepEqual(result.completedSteps, project.completedSteps);
  assert.equal(projectProgress(result), 100);
  assert.equal(result.site, "Site actualisé entre-temps");
  assert.equal(result.revision, project.revision + 1);
  assert.equal(result.history.at(-1)?.message, "Plan modifié : Plan-RDC.JSON.");
  assert.deepEqual(result.documents.filter(value => value.id !== document.id), project.documents.filter(value => value.id !== document.id));
  assert.equal(document.size, 200, "L’ancien projet n’est pas modifié");
  assert.throws(() => applyProjectAction(result, { type: "replacePlan", document: replacement, expectedDocumentRevision: 0 }), /autre onglet/);
  assert.equal(applyProjectAction(result, { type: "replacePlan", document: replacement, expectedDocumentRevision: 1 }).documents.find(value => value.id === document.id)?.revision, 2);
});

test("Le remplacement refuse les documents absents, PDF, mal catégorisés ou renommés", () => {
  const project = attach(createProject(details), "plans", "plan.json");
  const document = project.documents[0];
  assert.throws(() => applyProjectAction(project, { type: "replacePlan", document: { ...document, id: crypto.randomUUID() }, expectedDocumentRevision: 0 }), /supprimé/);
  assert.throws(() => applyProjectAction(project, { type: "replacePlan", document: { ...document, name: "autre.json" }, expectedDocumentRevision: 0 }), /conserver le nom/);
  assert.throws(() => applyProjectAction(project, { type: "replacePlan", document: { ...document, kind: "autre" }, expectedDocumentRevision: 0 }), /catégorie/);
  for (const [kind, name] of [["plans", "plan.pdf"], ["autre", "plan.json"]] as const) {
    const other = attach(createProject(details), kind, name);
    assert.throws(() => applyProjectAction(other, { type: "replacePlan", document: other.documents[0], expectedDocumentRevision: 0 }), /n’est pas un plan JSON/);
  }
  assert.equal(project.documents.length, 1);
  assert.equal(project.documents[0].revision, undefined);
});

test("Les révisions de documents sont facultatives mais doivent être des entiers positifs ou nuls", () => {
  const project = attach(createProject(details), "plans", "plan.json");
  assert.doesNotThrow(() => projectSchema.parse(project));
  for (const revision of [-1, 0.5, "1", NaN]) {
    assert.equal(projectSchema.safeParse({ ...project, documents: [{ ...project.documents[0], revision }] }).success, false);
  }
  assert.doesNotThrow(() => validateProjectFile({ name: "Maison.JSON", size: 500 }));
});


test("La facturation précède une clôture explicite, y compris pour les anciens dossiers", () => {
  let project = createProject({ ...details, requiredDocuments: [] });
  assert.equal(projectSteps(project).length, 9);
  assert.throws(() => complete(project, "cloture"), /d’abord/);
  for (const step of projectSteps(project).filter(step => step.id !== "cloture")) project = complete(project, step.id);
  const legacy = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.equal(currentProjectStep(legacy)?.id, "cloture");
  assert.equal(projectProgress(legacy), 89);
  const closed = complete(legacy, "cloture");
  assert.equal(currentProjectStep(closed), undefined);
  assert.equal(projectProgress(closed), 100);
  assert.equal(closed.completedSteps.at(-1)?.stepId, "cloture");
  assert.throws(() => complete(closed, "cloture"), /une seule fois/);
  const reopened = applyProjectAction(closed, { type: "reopen", stepId: "cloture" });
  assert.equal(currentProjectStep(reopened)?.id, "cloture");
  assert.equal(reopened.completedSteps.length, 8);
});
