import test from "node:test";
import assert from "node:assert/strict";
import { MAX_CAD_AI_ENTITIES, MAX_CAD_AI_MESSAGES, MAX_CAD_AI_PROMPT, MAX_CAD_AI_REQUEST_BYTES, parseCadAiReply, parseCadAiRequest, validateCadAiPlan, type CadAiRequest } from "../src/lib/cad/ai";
import { attachOpening, createWallDimension, resolvePlanGeometry } from "../src/lib/cad/architecture";
import { parsePlan } from "../src/lib/cad/validation";
import { createEmptyPlan, createExamplePlan } from "../src/lib/cad/templates";
import type { CadEntity, CadPlan } from "../src/lib/cad/types";
import { cadAiPayload, generateCadPlan } from "../src/lib/server/cad-ai";
import { RequestError } from "../src/lib/server/request";
import { POST } from "../src/app/api/plans/generate/route";

const line = (properties: Partial<CadEntity> = {}): CadEntity => ({ id: "line-1", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ...properties });
const input = (plan = createEmptyPlan()): CadAiRequest => ({ messages: [{ role: "user", content: "Dessine une pièce de 4 m sur 3 m." }], plan, selectedEntityId: null });
const drawing = (plan: CadPlan) => ({ name: plan.name, layers: plan.layers, entities: plan.entities });
const result = (plan: CadPlan | null, message = "Proposition prête.") => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "submit_plan", input: { message, drawing: plan === null ? null : drawing(plan) } }] });
const errorStatus = (status: number) => (error: unknown) => error instanceof RequestError && error.status === status;
async function withConfig(action: () => Promise<void>) {
  const keys = ["AWS_REGION", "AWS_BEARER_TOKEN_BEDROCK", "BEDROCK_MODEL_ID"];
  const previous = keys.map(key => process.env[key]);
  process.env.AWS_REGION = "eu-west-3";
  process.env.AWS_BEARER_TOKEN_BEDROCK = "fake-cad-test-token";
  process.env.BEDROCK_MODEL_ID = "global.anthropic.claude-sonnet-4-6";
  try { await action(); } finally { keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }); }
}

test("Plans IA : conversation alternée, sélection connue et limites avant envoi", () => {
  const plan = { ...createEmptyPlan(), entities: [line()] };
  const request = input(plan);
  assert.deepEqual(parseCadAiRequest({ ...request, selectedEntityId: "line-1" }), { ...request, selectedEntityId: "line-1" });
  assert.equal(parseCadAiRequest({ ...request, messages: [{ role: "user", content: "  Bonjour  " }] }).messages[0].content, "Bonjour");
  const followup = { ...request, messages: [...request.messages, { role: "assistant", content: "Une pièce." }, { role: "user", content: "Ajoute une fenêtre." }] };
  assert.equal(parseCadAiRequest(followup).messages.length, 3);
  for (const change of [
    { messages: [] }, { messages: [{ role: "assistant", content: "Bonjour" }] },
    { messages: [...request.messages, ...request.messages] },
    { messages: [...request.messages, { role: "assistant", content: "Fin" }] },
    { messages: [{ role: "user", content: " " }] },
    { messages: [{ role: "user", content: "x".repeat(MAX_CAD_AI_PROMPT + 1) }] },
    { messages: Array.from({ length: MAX_CAD_AI_MESSAGES + 1 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: "x" })) },
    { selectedEntityId: "unknown" }, { selectedEntityId: 1 },
    { plan: { ...plan, entities: Array.from({ length: MAX_CAD_AI_ENTITIES + 1 }, (_, index) => line({ id: String(index) })) } },
  ]) assert.throws(() => parseCadAiRequest({ ...request, ...change }));
});

test("Plans IA : validation des références, géométries, métadonnées et réponses de clarification", () => {
  const source = createEmptyPlan();
  const proposed = { ...source, entities: [line()], updatedAt: "2030-01-01T00:00:00.000Z" };
  assert.equal(validateCadAiPlan(proposed, source).updatedAt, source.updatedAt);
  assert.deepEqual(parseCadAiReply({ message: "Quelle largeur ?", plan: null }, source), { message: "Quelle largeur ?", plan: null });
  for (const plan of [
    { ...proposed, id: "other" }, { ...proposed, version: 2 },
    { ...proposed, entities: [line({ layerId: "unknown" })] },
    { ...proposed, entities: [line(), line()] },
    { ...proposed, entities: [line({ start: { x: Infinity, y: 0 } })] },
    { ...proposed, entities: [line({ type: "rectangle" })] },
    { ...proposed, entities: [line({ type: "text", text: " " })] },
    ...["line", "wall", "circle", "dimension"].map(type => ({ ...proposed, entities: [line({ type: type as CadEntity["type"], end: { x: 0, y: 0 } })] })),
  ]) assert.throws(() => validateCadAiPlan(plan, source));
  for (const reply of [{ message: "ok" }, { message: "", plan: null }, { message: "x".repeat(3001), plan: null }]) assert.throws(() => parseCadAiReply(reply, source));
  const legacy = { ...source, entities: [line({ end: { x: 0, y: 0 } })] };
  assert.deepEqual(validateCadAiPlan(legacy, legacy), legacy, "Un objet importé inchangé reste intact");
});

test("Plans IA : calques protégés préservés contre suppression, changement et déplacement d’objets", () => {
  for (const protection of [{ locked: true }, { visible: false }]) {
    const source = createEmptyPlan();
    source.layers[0] = { ...source.layers[0], ...protection };
    source.entities = [line()];
    assert.deepEqual(validateCadAiPlan(source, source), source);
    const edited = structuredClone(source);
    edited.name = "Nom actualisé";
    edited.entities.push(line({ id: "new", layerId: "cotes" }));
    assert.equal(validateCadAiPlan(edited, source).entities.length, 2);
    for (const proposed of [
      { ...source, entities: [] },
      { ...source, entities: [line({ end: { x: 5, y: 0 } })] },
      { ...source, entities: [line({ layerId: "annotations" })] },
      { ...source, entities: [line(), line({ id: "new" })] },
      { ...source, entities: [line({ id: "renamed" })] },
      { ...source, layers: source.layers.map(layer => ({ ...layer, locked: false, visible: true })) },
      { ...source, layers: source.layers.map(layer => ({ ...layer, color: "#123456" })) },
      { ...source, layers: source.layers.slice(1), entities: [] },
    ]) assert.throws(() => validateCadAiPlan(proposed, source), /calques verrouillés ou masqués/);
  }
});

test("Plans IA : contexte courant et sélection, outil unique imposé, création puis révision complète", async () => {
  await withConfig(async () => {
    const request = input();
    const created = { ...request.plan, name: "Pièce 4 × 3 m", entities: [line({ type: "rectangle", end: { x: 4, y: 3 } })] };
    const payload = cadAiPayload(request);
    assert.deepEqual(payload.tool_choice, { type: "tool", name: "submit_plan", disable_parallel_tool_use: true });
    assert.equal(payload.tools.length, 1);
    assert.equal(payload.max_tokens, 16000);
    assert.match(payload.system, /Y vers le bas/);
    assert.match(payload.system, /calques locked: true OU visible: false/);
    assert.ok(!JSON.stringify(payload.tools[0].input_schema).includes('"maxItems"'));
    const response = await generateCadPlan(request, undefined, async (url, options) => {
      assert.equal(url, "https://bedrock-runtime.eu-west-3.amazonaws.com/model/global.anthropic.claude-sonnet-4-6/invoke");
      assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer fake-cad-test-token");
      assert.equal(options?.cache, "no-store");
      assert.ok(options?.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(String(options?.body)), payload);
      return Response.json(result(created));
    });
    assert.deepEqual(response.plan, created);
    const followup: CadAiRequest = { plan: created, selectedEntityId: "line-1", messages: [...request.messages, { role: "assistant", content: response.message }, { role: "user", content: "Porte la hauteur à 5 m." }] };
    const revised = { ...created, entities: [line({ type: "rectangle", end: { x: 4, y: 5 } })] };
    const reply = await generateCadPlan(followup, undefined, async (_url, options) => {
      const sent = JSON.parse(String(options?.body));
      assert.deepEqual(sent.messages.slice(0, -1), followup.messages.slice(0, -1));
      const reference = sent.messages.at(-1).content[0].text;
      assert.ok(reference.includes(JSON.stringify(created)));
      assert.ok(reference.includes('"selectedEntityId":"line-1"'));
      assert.equal(sent.messages.at(-1).content[1].text, "Porte la hauteur à 5 m.");
      return Response.json(result(revised));
    });
    assert.deepEqual(reply.plan, revised);
    assert.deepEqual(await generateCadPlan(request, undefined, async () => Response.json(result(null, "Quelle largeur ?"))), { message: "Quelle largeur ?", plan: null });
  });
});

test("Plans IA : refus des outils absents, multiples, inattendus et des réponses tronquées ou invalides", async () => {
  await withConfig(async () => {
    const request = input(createExamplePlan());
    const valid = result(request.plan);
    for (const body of [
      { ...valid, stop_reason: "max_tokens" }, { ...valid, stop_reason: "model_context_window_exceeded" },
      { ...valid, stop_reason: "end_turn" }, { ...valid, content: [] },
      { ...valid, content: [valid.content[0], valid.content[0]] },
      { ...valid, content: [{ ...valid.content[0], name: "another_tool" }] },
      result({ ...request.plan, entities: [line({ layerId: "missing" })] }),
      result({ ...request.plan, entities: [line({ end: { x: 0, y: 0 } })] }),
      result(request.plan, "x".repeat(3001)),
    ]) await assert.rejects(() => generateCadPlan(request, undefined, async () => Response.json(body)), errorStatus(502));
    await assert.rejects(() => generateCadPlan(request, undefined, async () => new Response("not json")), errorStatus(502));
    await assert.rejects(() => generateCadPlan(request, undefined, async () => new Response("x".repeat(2 * 1024 * 1024 + 1))), errorStatus(502));
    request.plan.layers[0].locked = true;
    await assert.rejects(() => generateCadPlan(request, undefined, async () => Response.json(result({ ...request.plan, entities: [] }))), errorStatus(502));
  });
});

test("Plans IA : erreurs AWS et de configuration sans détails ni secrets du fournisseur", async () => {
  await withConfig(async () => {
    for (const status of [400, 401, 403, 404, 429, 500]) {
      await assert.rejects(() => generateCadPlan(input(), undefined, async () => new Response("secret-upstream-details", { status })), error => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.status, status === 429 ? 429 : 502);
        assert.doesNotMatch(error.message, /secret-upstream-details|fake-cad-test-token/);
        return true;
      });
    }
    await assert.rejects(() => generateCadPlan(input(), undefined, async () => { throw new Error("network-secret"); }), errorStatus(502));
    delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    await assert.rejects(() => generateCadPlan(input(), undefined, async () => assert.fail("Appel sans clé")), errorStatus(503));
    process.env.AWS_BEARER_TOKEN_BEDROCK = "fake-cad-test-token";
    process.env.AWS_REGION = "invalid region";
    await assert.rejects(() => generateCadPlan(input(), undefined, async () => assert.fail("Appel avec région invalide")), errorStatus(503));
  });
});

test("Plans IA : annulation et délai couvrent aussi la lecture du corps HTTP", async context => {
  await withConfig(async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await assert.rejects(() => generateCadPlan(input(), alreadyAborted.signal, async () => assert.fail("Appel après annulation")), errorStatus(499));
    await assert.rejects(() => generateCadPlan(input(), undefined, async () => { throw new DOMException("Timeout", "TimeoutError"); }), errorStatus(504));
    const controller = new AbortController();
    let cancelled = false;
    const pending = generateCadPlan(input(), controller.signal, async () => new Response(new ReadableStream({
      start() { setTimeout(() => controller.abort(), 5); },
      cancel() { cancelled = true; },
    })));
    await assert.rejects(() => pending, errorStatus(499));
    assert.equal(cancelled, true);
    const deadline = new AbortController();
    const timeoutMock = context.mock.method(AbortSignal, "timeout", (milliseconds: number) => { assert.equal(milliseconds, 270_000); return deadline.signal; });
    try {
      await assert.rejects(() => generateCadPlan(input(), undefined, async () => new Response(new ReadableStream({
        start() { setTimeout(() => deadline.abort(new DOMException("Timeout", "TimeoutError")), 5); },
      }))), errorStatus(504));
    } finally { timeoutMock.mock.restore(); }
  });
});

test("Plans IA API : validation avant appel, taille maximale, erreurs et réponses no-store", async context => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => assert.fail("Aucun appel externe pour une requête invalide"));
  const make = (body: string, type = "application/json") => new Request("http://localhost/api/plans/generate", { method: "POST", headers: { "Content-Type": type }, body });
  for (const [request, status] of [
    [make("{"), 400], [make("{}"), 400], [make("{}", "text/plain"), 415],
    [make(" ".repeat(MAX_CAD_AI_REQUEST_BYTES + 1)), 413],
    [make(JSON.stringify({ ...input(), selectedEntityId: "unknown" })), 400],
  ] as const) {
    const response = await POST(request);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  fetchMock.mock.restore();
  await withConfig(async () => {
    const request = input();
    const proposed = { ...request.plan, entities: [line()] };
    const successMock = context.mock.method(globalThis, "fetch", async () => Response.json(result(proposed)));
    try {
      const response = await POST(make(JSON.stringify(request)));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.deepEqual((await response.json()).plan, proposed);
    } finally { successMock.mock.restore(); }
  });
});


test("Plans IA : portes, fenêtres, cotes liées, pièces et symboles survivent au schéma fournisseur", async () => {
  await withConfig(async () => {
    const source = createEmptyPlan();
    const proposed = { ...source, entities: [line({ id: "wall", type: "wall", end: { x: 8, y: 0 } })] };
    proposed.entities.push(attachOpening(proposed, "door", "wall", { x: 2, y: 0 }, 0.9, "murs"));
    proposed.entities.push({ ...attachOpening(proposed, "window", "wall", { x: 5, y: 0 }, 1.2, "murs"), id: "window" });
    proposed.entities[1].swing = -1;
    proposed.entities.push(createWallDimension(proposed, "wall", -0.7));
    proposed.entities.push(line({ id: "room", type: "room", text: "Salon", points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }] }));
    proposed.entities.push(line({ id: "symbol", type: "symbol", symbolId: "sofa", rotation: 90, end: { x: 2.2, y: 0.9 } }));
    const reply = await generateCadPlan(input(source), undefined, async () => Response.json(result(proposed)));
    assert.deepEqual(reply.plan, parsePlan(proposed));
    assert.equal(reply.plan!.entities.find(entity => entity.id === "room")!.points!.length, 4);
    assert.equal(reply.plan!.entities[1].swing, -1);
    assert.equal(reply.plan!.entities.find(entity => entity.type === "dimension")!.wallId, "wall");
  });
});

test("Plans IA : trous d’un mur protégé et dépendants protégés ne sont pas modifiables indirectement", () => {
  const source = createEmptyPlan();
  source.entities = [line({ id: "wall", type: "wall", end: { x: 8, y: 0 } })];
  const opening = attachOpening(source, "door", "wall", { x: 2, y: 0 }, 0.9, "annotations");
  source.entities.push(opening);
  source.layers[0].locked = true;
  for (const proposed of [
    { ...source, entities: [source.entities[0]] },
    { ...source, entities: [source.entities[0], { ...opening, wallAttachment: { ...opening.wallAttachment!, width: 1.2 } }] },
    { ...source, entities: [...source.entities, { ...opening, id: "new", wallAttachment: { ...opening.wallAttachment!, t: 0.8 } }] },
    { ...source, layers: source.layers.map(layer => layer.id === "annotations" ? { ...layer, visible: false } : layer) },
  ]) assert.throws(() => validateCadAiPlan(proposed, source), /ouvertures d’un mur/);
  const protectedOpening = resolvePlanGeometry({ ...source, layers: source.layers.map(layer => ({ ...layer, locked: layer.id === "annotations" })) });
  assert.throws(() => validateCadAiPlan({ ...protectedOpening, entities: protectedOpening.entities.map(entity => entity.id === "wall" ? { ...entity, end: { x: 10, y: 0 } } : entity) }, protectedOpening), /calques verrouillés ou masqués/);
});
