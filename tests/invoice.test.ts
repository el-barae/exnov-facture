import test from "node:test";
import assert from "node:assert/strict";
import { calculateInvoice, exampleInvoice, invoiceSchema, invoiceView, formatDate, formatMoney } from "../src/lib/invoice";
import { amountInWords, numberInWords } from "../src/lib/words";
import { buildInvoiceHtml } from "../src/lib/document/html";
import { generateWord } from "../src/lib/server/word";
import PizZip from "pizzip";
import { parseInvoiceRequest } from "../src/lib/server/request";
import { documentFilename } from "../src/lib/invoice";
import { lastDocumentNumber, numberPreference } from "../src/lib/storage";

test("Factures et devis partagent les calculs et adaptent leurs titres et exports", async () => {
  const facture = exampleInvoice();
  const devis = { ...facture, typeDocument: "devis" as const, reference: "", afficherTotalAPayer: false };
  assert.deepEqual(calculateInvoice(devis), calculateInvoice(facture));
  assert.equal(invoiceSchema.parse({ ...facture, typeDocument: undefined }).typeDocument, "facture");
  assert.equal(invoiceSchema.safeParse({ ...facture, typeDocument: "autre" }).success, false);
  assert.equal(documentFilename("devis", 13, "docx"), "Devis-EXNOV-13.docx");
  for (const invoice of [facture, devis]) {
    const html = buildInvoiceHtml(invoice);
    const xml = new PizZip(await generateWord(invoice)).file("word/document.xml")!.asText();
    for (const text of [html, xml.replace(/<[^>]*>/g, "")]) {
      assert.ok(text.includes(invoice.typeDocument === "devis" ? "DEVIS Nº 13" : "FACTURE Nº 13"));
      assert.ok(text.includes(invoice.typeDocument === "devis" ? "Arrêté le présent devis" : "Arrêté la présente facture"));
      assert.equal(text.includes("REFERENCE:"), invoice.typeDocument === "facture");
      assert.equal(text.includes("TOTAL A PAYER"), invoice.afficherTotalAPayer);
      assert.ok(text.includes("Onze Mille Dirhams"));
    }
  }
});
test("Les numéros de facture et devis restent indépendants avec l’ancien stockage", () => {
  const legacy = { dernierNumero: 13 };
  assert.equal(lastDocumentNumber(legacy, "facture"), 13);
  assert.equal(lastDocumentNumber(legacy, "devis"), 0);
  const saved = { ...legacy, ...numberPreference("devis", 4) };
  assert.equal(lastDocumentNumber(saved, "facture"), 13);
  assert.equal(lastDocumentNumber(saved, "devis"), 4);
});

test("Le modèle Dar Taliba aboutit à 11 000 DH avec les deux retenues", () => {
  assert.deepEqual(calculateInvoice(exampleInvoice()), { lineTotals: [6500, 4500], totalHT: 11000, tva: 2200, ttc: 13200, rasIS: 550, rasTVA: 1650, totalAPayer: 11000 });
  assert.equal(invoiceView(exampleInvoice()).montantEnLettres, "Onze Mille Dirhams");
  assert.equal(formatDate("2025-09-04"), "04/09/2025");
  assert.equal(formatMoney(11000), "11 000,00");
});
test("Chaque combinaison de retenues donne le montant attendu", () => {
  for (const [is, tva, expected] of [[false, false, 13200], [true, false, 12650], [false, true, 11550], [true, true, 11000]] as const) {
    assert.equal(calculateInvoice({ ...exampleInvoice(), appliquerRasIS: is, appliquerRasTVA: tva }).totalAPayer, expected);
  }
});
test("Arrondi commercial par ligne, puis des taxes, sans flottants intermédiaires", () => {
  const i = exampleInvoice();
  i.lignes = [{ ...i.lignes[0], quantite: 3, prixUnitaire: 0.335 }];
  assert.equal(calculateInvoice(i).totalHT, 1.01);
  assert.equal(invoiceSchema.safeParse(i).success, false, "le prix unitaire saisi est limité à 2 décimales");
  i.lignes = [{ ...i.lignes[0], quantite: 0.5, prixUnitaire: 2.01 }];
  assert.equal(calculateInvoice(i).totalHT, 1.01);
  i.lignes = [{ ...i.lignes[0], quantite: 1, prixUnitaire: .1 }, { ...i.lignes[0], id: "2", quantite: 1, prixUnitaire: .2 }];
  assert.equal(calculateInvoice(i).totalHT, .3);
});
test("Validation : calendrier, bornes, absence de lignes et valeurs non finies", () => {
  for (const patch of [{ date: "2025-02-29" }, { numero: 0 }, { numero: 1.5 }, { lignes: [] }, { tauxTVA: -1 }, { tauxRasIS: 101 }, { tauxTVA: Infinity }, { destinataire: " " }]) {
    assert.equal(invoiceSchema.safeParse({ ...exampleInvoice(), ...patch }).success, false);
  }
  assert.equal(invoiceSchema.safeParse({ ...exampleInvoice(), date: "2024-02-29", reference: "" }).success, true);
});
test("Conversion française : accords, milliers, millions et centimes", () => {
  for (const [n, words] of [[0,"zéro"],[21,"vingt et un"],[71,"soixante et onze"],[80,"quatre-vingts"],[81,"quatre-vingt-un"],[91,"quatre-vingt-onze"],[200,"deux cents"],[201,"deux cent un"],[1000,"mille"],[80000,"quatre-vingt mille"],[200000,"deux cent mille"],[2000000,"deux millions"]] as const) assert.equal(numberInWords(n), words);
  assert.equal(amountInWords(1000000), "Un Million De Dirhams");
  assert.equal(amountInWords(11.01), "Onze Dirhams Et Un Centime");
  assert.equal(amountInWords(0), "Zéro Dirham");
});
test("L’HTML échappe les données et supprime les retenues désactivées", () => {
  const html = buildInvoiceHtml({ ...exampleInvoice(), destinataire: "</script><img src=x onerror=alert(1)>", appliquerRasIS: false, appliquerRasTVA: false });
  assert.ok(!html.includes("<IMG")); assert.ok(html.includes("&lt;/SCRIPT&gt;"));
  assert.ok(!html.includes("A DEDUIRE RAS"));
});
test("Le template Word génère des lignes et efface entièrement les lignes RAS", async () => {
  const i = exampleInvoice(); i.lignes.push({ ...i.lignes[0], id: "third", designation: "Troisième prestation\nDeuxième paragraphe", prixUnitaire: 0 });
  for (const active of [false, true]) {
    const doc = new PizZip(await generateWord({ ...i, appliquerRasIS: active, appliquerRasTVA: active }));
    const xml = doc.file("word/document.xml")!.asText();
    const text = xml.replace(/<[^>]*>/g, "");
    assert.ok(text.includes("Troisième prestation"));
    assert.equal(text.includes("A DEDUIRE RAS IS"), active);
    assert.equal(text.includes("A DEDUIRE RAS TVA"), active);
    assert.ok(text.includes(active ? "11 000,00" : "13 200,00"));
    assert.ok(!/\{(?:numero|lignes|total|tva|ras|montant|destinataire)/.test(text));
    assert.ok(xml.includes("<w:br/>"));
    assert.ok(doc.file("word/footer1.xml")!.asText().includes("www.exnov.ma"));
    assert.ok(doc.file("word/media/exnov-logo.png"));
  }
});
test("Une saisie invalide provisoire ne fait pas planter l’aperçu", () => {
  const invoice = exampleInvoice();
  invoice.lignes[0].prixUnitaire = -100000;
  assert.ok(buildInvoiceHtml(invoice).includes("Montant à vérifier"));
  invoice.lignes[0].prixUnitaire = 1e15;
  assert.ok(buildInvoiceHtml(invoice).includes("Montant à vérifier"));
});
test("Le serveur borne le flux JSON et ignore les totaux envoyés par le navigateur", async () => {
  const req = (body: string, type = "application/json") => new Request("http://localhost/api/factures/pdf", { method: "POST", headers: { "Content-Type": type }, body });
  await assert.rejects(parseInvoiceRequest(req("{")), /JSON/);
  await assert.rejects(parseInvoiceRequest(req("a".repeat(500001))), /volumineux/);
  await assert.rejects(parseInvoiceRequest(req("{}", "text/plain")), /JSON/);
  const invoice = await parseInvoiceRequest(req(JSON.stringify({ ...exampleInvoice(), totalAPayer: 1 })));
  assert.equal(calculateInvoice(invoice).totalAPayer, 11000);
});
