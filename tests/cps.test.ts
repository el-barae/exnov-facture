import test from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { MAX_CPS_REQUEST_BYTES, cpsAmount, cpsExportSchema, cpsFilename, cpsGenerateSchema, cpsSchema, cpsTotals, type CpsGenerate } from "../src/lib/cps";
import { cpsPayload, generateCps } from "../src/lib/server/cps-ai";
import { cpsError, parseCpsRequest, validateCpsLogo } from "../src/lib/server/cps-request";
import { generateCpsWord } from "../src/lib/server/cps-word";
import { RequestError } from "../src/lib/server/request";
import { exampleCps, testLogo } from "./fixtures/cps";

const input = (): CpsGenerate => ({ prompt: "Prépare le CPS de mon projet.", reference: "auto", document: null });
const errorStatus = (status: number) => (error: unknown) => error instanceof RequestError && error.status === status;
async function withConfig(action: () => Promise<void>) {
  const keys = ["AWS_REGION", "AWS_BEARER_TOKEN_BEDROCK", "BEDROCK_MODEL_ID"];
  const old = keys.map(key => process.env[key]);
  process.env.AWS_REGION = "eu-west-3"; process.env.AWS_BEARER_TOKEN_BEDROCK = "fake-test-token"; process.env.BEDROCK_MODEL_ID = "global.anthropic.claude-sonnet-4-6";
  try { await action(); } finally { keys.forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; }); }
}

test("CPS : schéma, limites et nom de fichier sûr", () => {
  assert.ok(cpsSchema.safeParse(exampleCps()).success);
  assert.ok(cpsGenerateSchema.safeParse(input()).success);
  for (const change of [{ prompt: "   " }, { prompt: "a".repeat(16001) }, { reference: "inconnu" }]) assert.equal(cpsGenerateSchema.safeParse({ ...input(), ...change }).success, false);
  for (const change of [{ works: [] }, { administrative: [] }, { technical: [] }, { vatRate: "101" }, { vatRate: "-1" }, { vatRate: "NaN" }]) assert.equal(cpsSchema.safeParse({ ...exampleCps(), ...change }).success, false);
  const doc = exampleCps(); doc.works[0].unitPrice = "1,50";
  assert.equal(cpsSchema.safeParse(doc).success, false);
  assert.equal(cpsFilename({ ...doc, title: 'École / "\r\n../../test' }), "CPS-Ecole-test.docx");
});

test("CPS : montants arrondis, zéro connu et totaux incomplets jamais assimilés à zéro", () => {
  const doc = exampleCps();
  assert.deepEqual(cpsTotals(doc), { lines: ["15975.00", null], ht: null, vat: null, ttc: null });
  assert.equal(cpsAmount(null), "[À compléter]");
  assert.equal(cpsAmount("12345.60"), "12 345,60");
  doc.works[1].unitPrice = "0";
  doc.vatRate = "20";
  assert.deepEqual(cpsTotals(doc), { lines: ["15975.00", "0.00"], ht: "15975.00", vat: "3195.00", ttc: "19170.00" });
  doc.works = [{ ...doc.works[0], quantity: "1.5", unitPrice: "0.01" }];
  doc.vatRate = "0";
  assert.deepEqual(cpsTotals(doc), { lines: ["0.02"], ht: "0.02", vat: "0.00", ttc: "0.02" });
  doc.works = Array.from({ length: 150 }, () => ({ ...doc.works[0], quantity: "999999999", unitPrice: "999999999.99" }));
  assert.equal(cpsTotals(doc).ht, "149999999848500000001.50");
});

test("CPS : le logo doit être embarqué et ses dimensions doivent correspondre au PNG", () => {
  validateCpsLogo(testLogo);
  for (const dataUrl of ["https://example.org/logo.png", "file:///etc/passwd", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,invalid!"]) assert.equal(cpsExportSchema.safeParse({ document: exampleCps(), logo: { ...testLogo, dataUrl } }).success, false);
  assert.throws(() => validateCpsLogo({ ...testLogo, width: 2 }), errorStatus(400));
  assert.throws(() => validateCpsLogo({ ...testLogo, dataUrl: "data:image/png;base64,PHN2Zz48L3N2Zz4=" }), errorStatus(400));
});

test("CPS Word : texte éditable échappé, logo, numérotation cohérente, tableau et pagination", () => {
  const doc = exampleCps(); doc.works[0].title = 'Peinture <test> & "finition"';
  doc.administrative[0].paragraphs.push("Texte avec contrôle\u0000 supprimé.");
  const zip = new PizZip(generateCpsWord(doc, testLogo));
  const xml = zip.file("word/document.xml")!.asText();
  assert.ok(xml.includes("Peinture &lt;test&gt; &amp; &quot;finition&quot;"));
  assert.ok(!xml.includes("\u0000"));
  assert.ok(xml.includes("PRIX N° 1 : Peinture &lt;test&gt;"));
  assert.ok(xml.includes("ARTICLE 1.1 : Préparation"));
  assert.ok(xml.includes("15 975,00"));
  assert.ok(xml.includes("[À compléter]"));
  assert.ok(xml.includes("<w:tblHeader/>"));
  assert.ok(xml.includes('<w:pgSz w:w="11906" w:h="16838"/>'));
  assert.ok(xml.includes('r:embed="rLogo"'));
  assert.deepEqual(zip.file("word/media/logo.png")!.asNodeBuffer(), Buffer.from(testLogo.dataUrl.split(",")[1], "base64"));
  assert.ok(zip.file("word/footer1.xml")!.asText().includes('w:instr="NUMPAGES"'));
  assert.equal(zip.file("word/_rels/document.xml.rels")!.asText().includes('TargetMode="External"'), false);
  const ids = [...xml.matchAll(/<w:bookmarkStart w:id="(\d+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  const plain = new PizZip(generateCpsWord(doc));
  assert.equal(plain.file("word/media/logo.png"), null);
  assert.equal(plain.file("word/document.xml")!.asText().includes('r:embed="rLogo"'), false);
});

test("CPS : API refuse requêtes invalides ou volumineuses avant la génération", async () => {
  const make = (body: string, type = "application/json") => new Request("http://localhost/api/cps/generate", { method: "POST", headers: { "Content-Type": type }, body });
  assert.deepEqual(await parseCpsRequest(make(JSON.stringify(input())), cpsGenerateSchema), input());
  await assert.rejects(() => parseCpsRequest(make("{"), cpsGenerateSchema), errorStatus(400));
  await assert.rejects(() => parseCpsRequest(make("{}", "text/plain"), cpsGenerateSchema), errorStatus(415));
  await assert.rejects(() => parseCpsRequest(make(" ".repeat(MAX_CPS_REQUEST_BYTES + 1)), cpsGenerateSchema), errorStatus(413));
});

test("CPS IA : instructions séparées des modèles, référence choisie et révision complète", async () => {
  await withConfig(async () => {
    const doc = exampleCps();
    const request: CpsGenerate = { ...input(), reference: "souk", document: doc, prompt: "Porte le délai à 4 mois." };
    const payload = cpsPayload(request);
    assert.ok(payload.system.includes("DONNÉES"));
    assert.ok(payload.messages[0].content.includes("GHOUJINE"));
    assert.ok(!payload.messages[0].content.includes("BOUKMAKH"));
    assert.ok(payload.messages[0].content.includes(JSON.stringify(doc)));
    assert.ok(payload.messages.at(-1)?.content.endsWith(request.prompt));
    assert.ok(!JSON.stringify(payload.output_config).includes('"maxLength"'));
    const revised = { ...doc, deadline: "4 mois" };
    const reply = await generateCps(request, undefined, async (url, options) => {
      assert.equal(url, "https://bedrock-runtime.eu-west-3.amazonaws.com/model/global.anthropic.claude-sonnet-4-6/invoke");
      assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer fake-test-token");
      const sent = JSON.parse(String(options?.body));
      assert.deepEqual(sent, payload);
      assert.equal(sent.anthropic_version, "bedrock-2023-05-31");
      assert.equal(sent.max_tokens, 24000);
      assert.equal(sent.output_config.format.type, "json_schema");
      return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ message: "Délai modifié.", document: revised }) }] });
    });
    assert.deepEqual(reply.document, revised);
  });
});

test("CPS IA : erreurs, annulation, réponses tronquées et secrets non exposés", async () => {
  await withConfig(async () => {
    for (const status of [400, 401, 403, 404, 429, 500]) {
      await assert.rejects(() => generateCps(input(), undefined, async () => new Response("secret-upstream-details", { status })), error => {
        assert.ok(error instanceof RequestError); assert.equal(error.status, status === 429 ? 429 : 502);
        assert.ok(!error.message.includes("secret-upstream-details")); return true;
      });
    }
    for (const response of [
      { stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "invalid" }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ message: "ok", document: {} }) }] },
    ]) await assert.rejects(() => generateCps(input(), undefined, async () => Response.json(response)), errorStatus(502));
    await assert.rejects(() => generateCps(input(), undefined, async () => { throw new DOMException("Timeout", "TimeoutError"); }), errorStatus(504));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(() => generateCps(input(), controller.signal, async () => { throw new DOMException("Abort", "AbortError"); }), errorStatus(499));
    delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    await assert.rejects(() => generateCps(input(), undefined, async () => assert.fail("Aucun appel sans clé")), errorStatus(503));
    const response = cpsError(new RequestError("Message maîtrisé", 400));
    assert.equal(response.status, 400); assert.equal(response.headers.get("Cache-Control"), "no-store");
  });
});
