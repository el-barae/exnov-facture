"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Check, House, LoaderCircle, MessageSquareText, MousePointer2, Ruler, Sparkles, Square, X } from "lucide-react";
import { MAX_CAD_AI_ENTITIES, MAX_CAD_AI_MESSAGES, MAX_CAD_AI_PROMPT, parseCadAiReply, type CadAiMessage } from "@/lib/cad/ai";
import { exportSvg } from "@/lib/cad/svg";
import { TOOL_LABELS, type CadPlan } from "@/lib/cad/types";

type Props = {
  plan: CadPlan;
  selectedEntityId: string | null;
  onApply: (proposal: CadPlan, source: CadPlan) => boolean;
  onClose: () => void;
};

type Proposal = { plan: CadPlan; source: CadPlan; signature: string };
type ActiveRequest = { controller: AbortController; timer: ReturnType<typeof setTimeout> | null };

/** Retain complete exchanges; a retry replaces the unanswered instruction. */
function requestMessages(history: CadAiMessage[], content: string): CadAiMessage[] {
  const complete = history.at(-1)?.role === "user" ? history.slice(0, -1) : history;
  return [...complete.slice(-(MAX_CAD_AI_MESSAGES - 2)), { role: "user", content }];
}

export function CadAssistant({ plan, selectedEntityId, onApply, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<CadAiMessage[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const requestRef = useRef<ActiveRequest | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const selectedEntity = plan.entities.find((entity) => entity.id === selectedEntityId);
  const tooManyEntities = plan.entities.length > MAX_CAD_AI_ENTITIES;
  const stale = proposal !== null && JSON.stringify(plan) !== proposal.signature;
  const preview = useMemo(() => proposal ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportSvg(proposal.plan))}` : null, [proposal]);

  useEffect(() => () => {
    const request = requestRef.current;
    requestRef.current = null;
    if (request?.timer) clearTimeout(request.timer);
    request?.controller.abort();
  }, []);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [messages, busy]);

  const cancel = () => {
    const request = requestRef.current;
    requestRef.current = null;
    if (request?.timer) clearTimeout(request.timer);
    request?.controller.abort();
    setBusy(false);
    setStatus("Demande annulée. Votre consigne est conservée.");
  };

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const content = prompt.trim();
    if (requestRef.current || proposal || !content || content.length > MAX_CAD_AI_PROMPT || tooManyEntities) return;

    const source: CadPlan = structuredClone(plan);
    const history = requestMessages(messages, content);
    const request: ActiveRequest = { controller: new AbortController(), timer: null };
    requestRef.current = request;
    setMessages(history);
    setBusy(true);
    setError(null);
    setStatus("");
    request.timer = setTimeout(() => {
      if (requestRef.current !== request) return;
      requestRef.current = null;
      request.controller.abort();
      setBusy(false);
      setError("L’assistant met trop de temps à répondre. Votre consigne est conservée : réessayez.");
    }, 285_000);

    try {
      const response = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, plan: source, selectedEntityId: selectedEntity?.id ?? null }),
        signal: request.controller.signal,
      });
      if (requestRef.current !== request) return;
      const payload: unknown = await response.json();
      if (requestRef.current !== request) return;
      if (!response.ok) {
        const details = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
        throw new Error(typeof details === "string" ? details : "La demande n’a pas abouti. Réessayez dans un instant.");
      }
      const reply = parseCadAiReply(payload, source);
      if (requestRef.current !== request) return;
      setMessages([...history, { role: "assistant", content: reply.message }]);
      setPrompt("");
      if (reply.plan) {
        setProposal({ plan: reply.plan, source, signature: JSON.stringify(source) });
        setStatus("Proposition prête. Vérifiez l’aperçu avant de l’appliquer.");
      } else {
        setStatus("L’assistant a répondu. Vous pouvez préciser votre demande.");
      }
    } catch (cause) {
      if (requestRef.current !== request) return;
      setError(cause instanceof Error && cause.name !== "SyntaxError" && cause.name !== "TypeError"
        ? cause.message
        : "Impossible de recevoir la réponse de l’assistant. Vérifiez votre connexion puis réessayez.");
    } finally {
      if (request.timer) clearTimeout(request.timer);
      if (requestRef.current === request) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  };

  const chooseExample = (value: string) => {
    setPrompt(value);
    setError(null);
    promptRef.current?.focus();
  };

  const apply = () => {
    if (!proposal || stale) return;
    if (!onApply(proposal.plan, proposal.source)) {
      setError("Le plan a changé. Ignorez cette proposition puis relancez votre demande sur le plan actuel.");
      return;
    }
    setProposal(null);
    setError(null);
    setStatus("Proposition appliquée au plan. Vous pouvez annuler cette modification avec Annuler.");
  };

  return (
    <section id="cad-assistant" className="cad-panel cad-assistant" aria-labelledby="cad-ai-title" onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
      <div className="cad-panel-heading cad-ai-heading">
        <div className="cad-ai-identity"><span className="cad-ai-symbol"><Sparkles size={16} aria-hidden="true" /></span><div><h2 id="cad-ai-title">Assistant IA</h2><span>Imaginez. Décrivez. Dessinez.</span></div></div>
        <button type="button" className="cad-icon-button" aria-label="Fermer l’assistant IA" title="Fermer l’assistant IA" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>

      {messages.length === 0 && <div className="cad-ai-welcome">
        <p>Décrivez votre idée pour créer ou modifier ce plan.</p>
        <div className="cad-ai-examples" aria-label="Exemples de consignes">
          <button type="button" onClick={() => chooseExample("Crée une maison de 10 × 8 m avec deux chambres, un salon, une cuisine et une salle de bain. Ajoute les noms des pièces et les cotes extérieures.")}><House size={14} aria-hidden="true" /><span>Maison 10 × 8 m · 2 chambres</span></button>
          <button type="button" onClick={() => chooseExample("Ajoute les cotes extérieures et les noms des pièces de ce plan. Demande-moi les noms si tu ne peux pas les déduire.")}><Ruler size={14} aria-hidden="true" /><span>Annoter et ajouter les cotes</span></button>
          <button type="button" disabled={!selectedEntity} title={selectedEntity ? undefined : "Sélectionnez d’abord un objet sur le plan"} onClick={() => chooseExample("Déplace l’objet sélectionné de 1 m vers la droite, en conservant ses dimensions.")}><MousePointer2 size={14} aria-hidden="true" /><span>Modifier l’objet sélectionné</span></button>
        </div>
      </div>}

      {messages.length > 0 && <div className="cad-ai-conversation" ref={conversationRef} role="log" aria-label="Conversation avec l’assistant" aria-live="polite" aria-relevant="additions text">
        {messages.map((message, index) => <div className={`cad-ai-message cad-ai-message-${message.role}`} key={`${index}-${message.role}`}><span>{message.role === "user" ? "Vous" : "Assistant IA"}</span><p>{message.content}</p></div>)}
      </div>}

      {proposal && preview && <div className="cad-ai-proposal" data-testid="cad-ai-proposal">
        <div className="cad-ai-proposal-heading"><h3>Proposition de plan</h3><span>À valider</span></div>
        {/* A local, escaped SVG data URL is the actual vector proposal, with no remote image to optimize. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cad-ai-preview" src={preview} alt="Aperçu de la proposition de plan" width={480} height={320} />
        <p className="cad-ai-proposal-count"><strong>{proposal.plan.entities.length}</strong> objets <span>· {proposal.plan.layers.length} calques</span></p>
        {stale && <p className="cad-ai-stale" role="alert">Le plan a été modifié depuis cette demande. Ignorez cette proposition puis relancez l’assistant pour conserver vos changements.</p>}
        <button className="cad-ai-apply" type="button" onClick={apply} disabled={stale}><Check size={14} aria-hidden="true" />Appliquer au plan</button>
        <button className="cad-ai-dismiss" type="button" onClick={() => { setProposal(null); setError(null); setStatus("Proposition ignorée. Vous pouvez envoyer une nouvelle consigne."); }}>Ignorer la proposition</button>
      </div>}

      {error && <p className="plans-error cad-ai-error" role="alert">{error}</p>}
      {tooManyEntities && <p className="cad-ai-limit" role="note">L’assistant accepte jusqu’à {MAX_CAD_AI_ENTITIES} objets par plan. Ce plan en contient {plan.entities.length}.</p>}

      <form className="cad-ai-form" onSubmit={submit}>
        <label htmlFor="cad-ai-prompt">Votre consigne</label>
        <div className="cad-ai-context"><MessageSquareText size={12} aria-hidden="true" /><span>{selectedEntity ? `Sélection : ${TOOL_LABELS[selectedEntity.type]}` : `Plan actuel · ${plan.entities.length} objets`}</span></div>
        <textarea ref={promptRef} id="cad-ai-prompt" value={prompt} rows={4} maxLength={MAX_CAD_AI_PROMPT} disabled={busy || proposal !== null} placeholder="Ex. : un bureau de 6 × 4 m, avec une porte et deux fenêtres…" aria-describedby="cad-ai-sharing cad-ai-count" onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
        }} />
        <div className="cad-ai-input-meta"><span>Ctrl / ⌘ + Entrée</span><span id="cad-ai-count">{prompt.length.toLocaleString("fr-FR")} / {MAX_CAD_AI_PROMPT.toLocaleString("fr-FR")}</span></div>
        {proposal ? <p className="cad-ai-pending-note">Appliquez ou ignorez la proposition avant de poursuivre.</p> : busy ? <button type="button" className="cad-ai-cancel" onClick={cancel}><Square size={11} aria-hidden="true" />Annuler la demande</button> : <button type="submit" className="cad-ai-send" disabled={!prompt.trim() || tooManyEntities}><ArrowUp size={14} aria-hidden="true" />Envoyer à l’assistant</button>}
        <p className="cad-ai-sharing" id="cad-ai-sharing">À l’envoi, le plan actuel et cette conversation sont transmis à l’IA. Vous validez chaque modification avant son application.</p>
      </form>
      <div className={`cad-ai-status${busy ? " is-loading" : ""}`} role="status" aria-live="polite">{busy ? <><LoaderCircle size={14} className="cad-ai-spinner" aria-hidden="true" /><span>L’assistant prépare votre proposition…</span></> : status}</div>
    </section>
  );
}
