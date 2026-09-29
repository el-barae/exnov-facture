import test from "node:test";
import assert from "node:assert/strict";
import { createProjectPlanFile, isEditableProjectPlan, loadedProjectPlan, parseProjectPlanFile } from "../src/lib/cad/project";
import { createExamplePlan, createEmptyPlan } from "../src/lib/cad/templates";
import { MAX_PLAN_FILE_BYTES, parsePlan } from "../src/lib/cad/validation";
import { applyProjectAction, createProject } from "../src/lib/projects";
import { attachGeneratedProjectFile, attachProjectFile } from "../src/lib/project-storage";

test("Un export JSON de projet conserve les objets architecturaux et redevient modifiable", async () => {
  const plan = createExamplePlan();
  const file = createProjectPlanFile(plan);
  assert.equal(file.type, "application/json");
  assert.match(file.name, /\.json$/);
  assert.deepEqual(await parseProjectPlanFile(file), parsePlan(plan));
  assert.equal(createProjectPlanFile(plan, "Plan final.JSON").name, "Plan final.JSON");
  assert.throws(() => createProjectPlanFile(plan, "plan.pdf"), /\.json/);
  assert.throws(() => createProjectPlanFile({ ...plan, entities: [{ ...plan.entities[0], layerId: "introuvable" }] }), /calque inexistant/);
});

test("Seule une pièce classée Plans et terminée par .json propose l’édition", () => {
  assert.equal(isEditableProjectPlan({ kind: "plans", name: "Plan.JSON" }), true);
  assert.equal(isEditableProjectPlan({ kind: "plans", name: "Plan.json.pdf" }), false);
  assert.equal(isEditableProjectPlan({ kind: "plans", name: "Plan.dxf" }), false);
  assert.equal(isEditableProjectPlan({ kind: "autre", name: "Plan.json" }), false);
});

test("Les fichiers JSON vides, incohérents, invalides ou supérieurs à 5 Mo sont refusés", async () => {
  await assert.rejects(parseProjectPlanFile(new Blob([])), /vide/);
  await assert.rejects(parseProjectPlanFile(new Blob(["{ broken"])), /JSON lisible/);
  await assert.rejects(parseProjectPlanFile(new Blob([JSON.stringify({ hello: "world" })])), /Plan invalide/);
  const plan = createEmptyPlan();
  await assert.rejects(parseProjectPlanFile(new Blob([JSON.stringify({ ...plan, entities: [{ id: "mur", type: "wall", layerId: "absent", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }] })])), /calque inexistant/);
  await assert.rejects(parseProjectPlanFile(new Blob([new Uint8Array(MAX_PLAN_FILE_BYTES + 1)])), /5 Mo/);
  // The limit is measured in encoded bytes, including multibyte annotations.
  plan.entities = Array.from({ length: 1400 }, (_, index) => ({ id: `texte-${index}`, type: "text", layerId: plan.layers[0].id, start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, text: "é".repeat(2000) }));
  assert.throws(() => createProjectPlanFile(plan), /5 Mo/);
});

test("La source d’un plan identifie son document et sa révision, sans modifier l’identifiant JSON", () => {
  const plan = createEmptyPlan();
  let project = createProject({ name: "Maison", client: "Client", site: "Tanger", reference: "P-001", withBdp: false, requiredDocuments: [] });
  project = applyProjectAction(project, { type: "attach", document: { id: crypto.randomUUID(), kind: "plans", name: "plan.json", size: 200, mime: "application/json", uploadedAt: new Date().toISOString() } });
  const document = project.documents[0];
  assert.deepEqual(loadedProjectPlan(project, document, plan).source, {
    projectId: project.id, documentId: document.id, revision: 0, fileName: "plan.json", planId: plan.id,
  });
  assert.equal(loadedProjectPlan(project, { ...document, revision: 3 }, plan).source.revision, 3);
});


test("Les deux chemins de rattachement refusent un faux plan JSON avant l’ouverture du stockage", async () => {
  const project = createProject({ name: "Projet", client: "Client", site: "", reference: "", withBdp: false, requiredDocuments: [] });
  const invalid = new File([JSON.stringify({ version: 1 })], "plan.json", { type: "application/json" });
  await assert.rejects(attachProjectFile(project, "plans", invalid), /Plan invalide/);
  await assert.rejects(attachGeneratedProjectFile(project.id, "plans", invalid), /Plan invalide/);
  const oversized = new File([new Uint8Array(MAX_PLAN_FILE_BYTES + 1)], "plan.json", { type: "application/json" });
  await assert.rejects(attachProjectFile(project, "plans", oversized), /5 Mo/);
  assert.equal(project.documents.length, 0);
  assert.equal(project.revision, 0);
});
