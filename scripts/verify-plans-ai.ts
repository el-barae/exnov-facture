/** Deterministic browser coverage: every AI request is intercepted, never billed. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer, { type HTTPRequest } from "puppeteer-core";
import type { CadPlan } from "../src/lib/cad/types";
import { attachOpening, createWallDimension } from "../src/lib/cad/architecture";
import { parsePlan } from "../src/lib/cad/validation";
import { login } from "./helpers/login";

type AiRequest = { messages: { role: string; content: string }[]; plan: CadPlan; selectedEntityId: string | null };
type AiReply = { message: string; plan: CadPlan | null } | { error: string };
type Mock = (request: HTTPRequest, body: AiRequest) => Promise<void>;

const origin = process.env.TEST_BASE_URL || "http://localhost:3000";
const out = path.join(process.cwd(), "test-results", "plans-ai");
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), args: chromium.args, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1080 });
  const errors: string[] = [];
  const requests: AiRequest[] = [];
  const mocks: Mock[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.setRequestInterception(true);
  page.on("request", request => {
    void (async () => {
      if (new URL(request.url()).pathname !== "/api/plans/generate") { await request.continue(); return; }
      // No fallback to the actual endpoint, including when a mock is missing.
      const body = JSON.parse(request.postData() || "{}") as AiRequest;
      requests.push(body);
      const mock = mocks.shift();
      if (!mock) {
        errors.push("Requête IA inattendue : aucun appel réel n’est autorisé dans ce test.");
        await request.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Aucune réponse de test préparée." }) });
        return;
      }
      assert.equal(request.method(), "POST");
      await mock(request, body);
    })().catch(error => { errors.push(String(error)); });
  });
  const respond = (request: HTTPRequest, response: AiReply, status = 200) => request.respond({ status, contentType: "application/json", body: JSON.stringify(response) });
  const queue = (response: AiReply | ((body: AiRequest) => AiReply), status = 200) => {
    mocks.push((request, body) => respond(request, typeof response === "function" ? response(body) : response, status));
  };
  const waitFor = async (check: () => boolean, label: string) => {
    const deadline = Date.now() + 15_000;
    while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(check(), label);
  };
  const defer = () => {
    let pending: HTTPRequest | undefined;
    let source: AiRequest | undefined;
    mocks.push(async (request, body) => { pending = request; source = body; });
    return {
      received: async () => { await waitFor(() => !!pending, "La requête IA différée a été reçue"); return source!; },
      reply: async (response: AiReply) => {
        assert.ok(pending, "La requête doit avoir commencé avant sa réponse");
        // A correct AbortController may have already canceled the browser request.
        try { await respond(pending, response); } catch (error) {
          if (!/closed|invalid|interception|canceled|cancelled/i.test(String(error))) throw error;
        }
      },
    };
  };
  const click = async (label: string) => {
    await page.waitForFunction(label => [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled), {}, label);
    await page.evaluate(label => [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === label && button.checkVisibility() && !button.disabled)!.click(), label);
  };
  const openAssistant = async () => {
    if (!(await page.$("#cad-ai-prompt"))) await click("Assistant IA");
    await page.waitForSelector("#cad-ai-prompt", { visible: true });
  };
  const plan = (): Promise<CadPlan> => page.evaluate(() => JSON.parse(localStorage.getItem(`exnov.plans.v1.document.${localStorage.getItem("exnov.plans.v1.active")}`)!));
  const count = (expected: number) => page.waitForFunction(expected => {
    const current = JSON.parse(localStorage.getItem(`exnov.plans.v1.document.${localStorage.getItem("exnov.plans.v1.active")}`)!);
    return current?.entities.length === expected;
  }, {}, expected);
  const setField = async (selector: string, value: string) => {
    await page.focus(selector);
    await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
    await page.keyboard.type(value);
  };
  const submit = async (prompt: string) => {
    const before = requests.length;
    await setField("#cad-ai-prompt", prompt);
    await click("Envoyer à l’assistant");
    await waitFor(() => requests.length === before + 1, "La consigne a été envoyée une seule fois");
    return requests.at(-1)!;
  };
  const preview = () => page.waitForSelector('[data-testid="cad-ai-proposal"]', { visible: true });
  const noPreview = async () => { assert.equal(await page.$('[data-testid="cad-ai-proposal"]'), null); };
  const conversationContains = (message: string) => page.waitForFunction(message => document.querySelector('[role="log"][aria-label="Conversation avec l’assistant"]')?.textContent?.includes(message), {}, message);
  const idle = () => page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "Envoyer à l’assistant"));
  const selectWall = async () => {
    await page.click('.cad-toolbar button[aria-label="Sélection"]');
    await page.$eval('[data-testid="cad-canvas"] [data-entity-id="ai-wall"]', element => (element as SVGElement).focus());
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-entity-id="ai-wall"][aria-pressed="true"]');
  };
  const createProposal = (source: CadPlan): CadPlan => ({
    ...source,
    name: "Studio proposé par l’assistant",
    entities: [
      { id: "ai-wall", type: "wall", layerId: source.layers[0].id, start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, thickness: 0.2 },
      { id: "ai-line", type: "line", layerId: source.layers[0].id, start: { x: 6, y: 0 }, end: { x: 6, y: 4 } },
      { id: "ai-rectangle", type: "rectangle", layerId: source.layers[0].id, start: { x: 0, y: 0 }, end: { x: 6, y: 4 } },
      { id: "ai-label", type: "text", layerId: source.layers.at(-1)!.id, start: { x: 2, y: 2 }, end: { x: 2, y: 2 }, text: "Séjour proposé", fontSize: 0.3 },
    ],
  });
  const extendWall = (source: CadPlan): CadPlan => ({ ...source, entities: source.entities.map(entity => entity.id === "ai-wall" ? { ...entity, end: { ...entity.end, x: entity.end.x + 1 } } : entity) });

  await login(page, origin);
  await click("Plans 2D");
  await page.waitForSelector('[data-testid="cad-canvas"]', { visible: true });
  await count(0);
  await click("Assistant IA");
  await page.waitForSelector("#cad-ai-prompt", { visible: true });
  const initial = await plan();
  const proposal = createProposal(initial);

  // A proposal can be inspected before the original document is changed.
  queue({ message: "Voici un studio de six mètres sur quatre.", plan: proposal });
  const first = await submit("Dessine un studio de 6 m sur 4 m avec une annotation Séjour.");
  await preview();
  assert.deepEqual(first.plan, initial);
  assert.equal(first.selectedEntityId, null);
  assert.equal(first.messages.at(-1)?.role, "user");
  assert.deepEqual(await plan(), initial, "La proposition ne modifie pas le document sauvegardé");
  assert.equal(await page.$$eval('[data-testid="cad-canvas"] [data-entity-id]', elements => elements.length), 0);
  await page.screenshot({ path: path.join(out, "proposal-desktop.png"), fullPage: true });
  await click("Appliquer au plan");
  await count(4);
  let current = await plan();
  assert.equal(current.id, initial.id, "Appliquer conserve l’identité du document");
  assert.deepEqual(current.entities, proposal.entities);
  assert.ok(await page.$eval('[data-testid="cad-canvas"]', element => element.textContent?.includes("Séjour proposé")));
  await noPreview();
  await page.click('.cad-toolbar button[aria-label="Annuler"]');
  await count(0);
  assert.equal((await plan()).name, initial.name);
  assert.equal(await page.$eval('.cad-toolbar button[aria-label="Annuler"]', button => button.disabled), true, "Une proposition correspond à une seule étape d’historique");
  await page.click('.cad-toolbar button[aria-label="Rétablir"]');
  await count(4);

  // Follow-up requests contain the actual current drawing and selected object.
  await selectWall();
  current = await plan();
  queue(body => ({ message: "Je propose un mur plus long d’un mètre.", plan: extendWall(body.plan) }));
  const followUp = await submit("Allonge le mur sélectionné de 1 m.");
  await preview();
  assert.deepEqual(followUp.plan, current);
  assert.equal(followUp.selectedEntityId, "ai-wall");
  assert.ok(followUp.messages.some(message => message.role === "assistant" && message.content.includes("studio")), "La conversation précédente accompagne la demande");
  await click("Ignorer la proposition");
  await noPreview();
  assert.deepEqual(await plan(), current);

  // Clarification-only answers and upstream failures preserve the drawing.
  const clarification = "Quelle largeur souhaitez-vous pour la chambre ?";
  queue({ message: clarification, plan: null });
  await submit("Ajoute une chambre.");
  await conversationContains(clarification);
  await noPreview();
  assert.deepEqual(await plan(), current);
  queue({ error: "Service IA temporairement indisponible. Réessayez." }, 503);
  const retryPrompt = "Ajoute une chambre de 3 m sur 4 m.";
  await submit(retryPrompt);
  await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(element => element.textContent?.includes("temporairement indisponible")));
  assert.equal(await page.$eval("#cad-ai-prompt", element => (element as HTMLTextAreaElement).value), retryPrompt);
  assert.deepEqual(await plan(), current);

  // Explicit cancellation keeps the instruction and ignores a late response.
  const cancellationPrompt = "Crée une terrasse de 2 m.";
  const explicitCancel = defer();
  await submit(cancellationPrompt);
  const explicitCancelRequest = await explicitCancel.received();
  await click("Annuler la demande");
  await idle();
  assert.equal(await page.$eval("#cad-ai-prompt", element => (element as HTMLTextAreaElement).value), cancellationPrompt);
  await explicitCancel.reply({ message: "Réponse après annulation explicite.", plan: extendWall(explicitCancelRequest.plan) });
  await page.waitForNetworkIdle({ idleTime: 200 });
  await noPreview();
  assert.deepEqual(await plan(), current);
  assert.ok(!(await page.evaluate(() => document.querySelector('[role="log"]')?.textContent || "")).includes("Réponse après annulation"));

  // Closing the assistant invalidates a late answer from an in-flight request.
  const canceled = defer();
  await submit("Crée une terrasse de 2 m.");
  const canceledRequest = await canceled.received();
  await page.click('button[aria-label="Fermer l’assistant IA"]');
  await page.waitForSelector("#cad-ai-prompt", { hidden: true });
  await canceled.reply({ message: "Réponse annulée qui ne doit pas apparaître.", plan: extendWall(canceledRequest.plan) });
  await page.waitForNetworkIdle({ idleTime: 200 });
  await click("Assistant IA");
  await page.waitForSelector("#cad-ai-prompt");
  await idle();
  await noPreview();
  assert.deepEqual(await plan(), current);
  assert.ok(!(await page.evaluate(() => document.querySelector('[role="log"]')?.textContent || "")).includes("Réponse annulée"));

  // Editing while generation is pending must make its result inapplicable.
  const stale = defer();
  await submit("Allonge à nouveau le mur principal.");
  const staleRequest = await stale.received();
  await selectWall();
  await setField('input[aria-label="Arrivée X"]', "8");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(`exnov.plans.v1.document.${localStorage.getItem("exnov.plans.v1.active")}`)!).entities[0].end.x === 8);
  current = await plan();
  await stale.reply({ message: "Proposition basée sur une ancienne version.", plan: extendWall(staleRequest.plan) });
  await preview();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Appliquer au plan")?.disabled === true);
  // A synthetic click must also be harmless on the disabled control.
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Appliquer au plan")!.click());
  assert.deepEqual(await plan(), current, "Une ancienne proposition ne remplace pas la modification manuelle");
  await click("Ignorer la proposition");

  // Switching documents during generation discards its conversation and result.
  const switching = defer();
  await submit("Dessine un jardin autour de ce plan.");
  const switchingRequest = await switching.received();
  await click("Nouveau plan");
  await count(0);
  const newPlan = await plan();
  assert.notEqual(newPlan.id, initial.id);
  await switching.reply({ message: "Réponse de l’ancien document.", plan: extendWall(switchingRequest.plan) });
  await page.waitForNetworkIdle({ idleTime: 200 });
  // Each document has its own workspace; changing it closes transient panels.
  await openAssistant();
  await idle();
  await noPreview();
  assert.deepEqual(await plan(), newPlan);
  assert.ok(!(await page.evaluate(() => document.querySelector('[role="log"]')?.textContent || "")).includes("ancien document"));
  await page.select('select[aria-label="Mes plans"]', initial.id);
  await count(4);
  await openAssistant();
  assert.deepEqual((await plan()).entities, current.entities);

  // The browser independently rejects responses that modify protected layers.
  const layer = current.layers[0];
  await page.click(`button[aria-label="Verrouiller le calque ${layer.name}"]`);
  current = await plan();
  queue(body => ({ message: "Cette modification devrait être refusée.", plan: extendWall(body.plan) }));
  await submit("Modifie le mur verrouillé.");
  await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(element => /verrouill|protég|masqu/i.test(element.textContent || "")));
  await noPreview();
  assert.deepEqual(await plan(), current);

  // Architectural entities survive the mocked AI contract, preview, application and history.
  await page.click(`button[aria-label="Déverrouiller le calque ${layer.name}"]`);
  current = await plan();
  const annotationLayer = current.layers.at(-1)!.id;
  const architecturalProposal = parsePlan({
    ...current,
    entities: [
      ...current.entities,
      { ...attachOpening(current, "door", "ai-wall", { x: 1.5, y: 0 }, 0.9, annotationLayer), id: "ai-door" },
      { ...attachOpening(current, "window", "ai-wall", { x: 4.5, y: 0 }, 1.2, annotationLayer), id: "ai-window" },
      { ...createWallDimension(current, "ai-wall", -0.8), id: "ai-dimension" },
      { id: "ai-sofa", type: "symbol", layerId: annotationLayer, start: { x: 1, y: 1 }, end: { x: 3.2, y: 1.9 }, symbolId: "sofa" },
      { id: "ai-room", type: "room", layerId: annotationLayer, start: { x: 0.2, y: 0.2 }, end: { x: 0.2, y: 3.8 }, points: [{ x: 0.2, y: 0.2 }, { x: 7.8, y: 0.2 }, { x: 7.8, y: 3.8 }, { x: 0.2, y: 3.8 }], text: "Séjour architectural", fontSize: 0.25 },
    ],
  });
  queue({ message: "Voici une porte, une fenêtre, un canapé, une pièce cotée et sa surface.", plan: architecturalProposal });
  await submit("Ajoute une porte, une fenêtre, un canapé, une cote liée au mur et la surface de la pièce.");
  await preview();
  assert.deepEqual(await plan(), current, "L’aperçu architectural laisse le document inchangé");
  const architecturalPreview = await page.$eval(".cad-ai-preview", element => decodeURIComponent((element as HTMLImageElement).src.split(",").slice(1).join(",")));
  assert.match(architecturalPreview, /Séjour architectural/);
  assert.match(architecturalPreview, /27,36 m²/);
  assert.match(architecturalPreview, /8,00 m/);
  assert.equal(await page.evaluate(svg => new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror")?.textContent ?? null, architecturalPreview), null);
  await page.waitForFunction(() => { const image = document.querySelector<HTMLImageElement>(".cad-ai-preview"); return image?.complete && image.naturalWidth > 0; });
  await click("Appliquer au plan");
  await count(9);
  assert.deepEqual((await plan()).entities, architecturalProposal.entities);
  assert.ok(await page.$eval('[data-testid="cad-canvas"]', element => element.textContent?.includes("27,36 m²")));
  await page.click('.cad-toolbar button[aria-label="Annuler"]');
  await count(4);
  assert.deepEqual((await plan()).entities, current.entities);
  await page.click('.cad-toolbar button[aria-label="Rétablir"]');
  await count(9);
  assert.deepEqual((await plan()).entities, architecturalProposal.entities);

  // The assistant and its architectural preview remain usable at narrow widths and both themes.
  queue(body => ({ message: "Proposition pour vérifier l’affichage mobile.", plan: extendWall(body.plan) }));
  await submit("Propose une variante du séjour.");
  await preview();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [390, 320]) {
      // Keep the viewport mode: toggling isMobile reloads and closes transient panels.
      await page.setViewport({ width, height: 844 });
      await preview();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Pas de débordement à ${width}px en thème ${theme}`);
      assert.ok((await (await page.$('[data-testid="cad-canvas"]'))!.boundingBox())!.height >= 300);
      await page.screenshot({ path: path.join(out, `assistant-${theme}-${width}.png`), fullPage: true });
    }
  }
  assert.equal(mocks.length, 0, "Toutes les réponses simulées ont été utilisées");
  assert.deepEqual(errors, [], "Aucune erreur JavaScript ni requête IA réelle");
  console.log(`Assistant Plans IA : propositions, application, historique, contexte, clarification, erreurs, annulation, versions périmées, calques protégés, objets architecturaux et mobile vérifiés. Captures : ${out}`);
} finally { await browser.close(); }
