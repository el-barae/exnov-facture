"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Download, FilePlus2, FolderOpen, Grid2X2, Magnet, Maximize, Minus, Plus, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Ruler, Sparkles, Upload } from "lucide-react";
import { workspaceStorage } from "@/lib/client-storage";
import { canUseAi } from "@/lib/team";
import { useTeam } from "./TeamProvider";
import { CadAssistant } from "./cad/CadAssistant";
import { CadProjectActions } from "./cad/CadProjectActions";
import { projectPlanContent, projectPlanDraft } from "@/lib/cad/project-draft";
import type { LoadedProjectPlan, ProjectPlanSource } from "@/lib/cad/project";
import { useProjectWorkspace, useWorkshopState } from "./ProjectWorkspace";
import { validateCadAiPlan } from "@/lib/cad/ai";
import { CadCanvas } from "./cad/CadCanvas";
import { CadToolbar } from "./cad/CadToolbar";
import { CadProperties } from "./cad/CadProperties";
import { CadLibrary } from "./cad/CadLibrary";
import { CadRooms } from "./cad/CadRooms";
import { createWallDimension, removePlanEntity, updatePlanEntity } from "@/lib/cad/architecture";
import { CadLayers } from "./cad/CadLayers";
import { CadExportModal } from "./cad/CadExportModal";
import { createEmptyPlan, createExamplePlan } from "@/lib/cad/templates";
import { planBounds } from "@/lib/cad/geometry";
import { parsePlan } from "@/lib/cad/validation";
import { loadPlans, PlanConflictError, savePlan } from "@/lib/cad/storage";
import { DEFAULT_VIEW, TOOL_LABELS, type CadEntity, type CadLayer, type CadPlan, type CadTool, type CadView, type Point, type SymbolId } from "@/lib/cad/types";

type History = { past: CadPlan[]; present: CadPlan; future: CadPlan[] };
const SHORTCUTS: Record<string, CadTool> = { v: "select", h: "pan", w: "wall", l: "line", r: "rectangle", c: "circle", d: "dimension", t: "text", o: "door", f: "window", p: "room", b: "symbol" };
const HINTS: Record<CadTool, string> = {
  select: "Cliquez sur un objet pour le modifier. Glissez pour le déplacer.",
  pan: "Glissez pour déplacer la vue. La molette permet de zoomer.",
  wall: "Cliquez le début puis la fin du mur. Échap annule le tracé.",
  line: "Cliquez le début puis la fin de la ligne. Maj active le mode orthogonal.",
  rectangle: "Cliquez deux coins opposés pour dessiner un rectangle.",
  circle: "Cliquez le centre, puis un point sur le cercle.",
  dimension: "Cliquez les deux extrémités d’un mur pour créer une cote liée, ou deux points libres pour une mesure indépendante.",
  door: "Choisissez la largeur dans la bibliothèque, puis cliquez sur un mur pour placer une porte.",
  window: "Choisissez la largeur dans la bibliothèque, puis cliquez sur un mur pour placer une fenêtre.",
  symbol: "Choisissez un symbole dans la bibliothèque, puis cliquez pour le placer. Sa taille et sa rotation sont modifiables.",
  room: "Cliquez les sommets du contour intérieur. Entrée ou Terminer la pièce ferme le contour et calcule sa surface.",
  text: "Saisissez votre annotation dans les propriétés, puis cliquez pour la placer.",
};

function fittedView(plan: CadPlan, element: HTMLDivElement): CadView {
  const bounds = planBounds(plan);
  const { width, height } = element.getBoundingClientRect();
  const scale = Math.max(10, Math.min(150, (width - 90) / Math.max(1, bounds.maxX - bounds.minX), (height - 90) / Math.max(1, bounds.maxY - bounds.minY)));
  return { scale, x: width / 2 - (bounds.minX + bounds.maxX) / 2 * scale, y: height / 2 - (bounds.minY + bounds.maxY) / 2 * scale };
}

export function AtelierPlan() {
  const { user, mode } = useTeam();
  const aiAllowed = canUseAi(user);
  const workspace = useProjectWorkspace();
  const project = workspace?.project;
  const [projectSource, setProjectSource] = useWorkshopState<ProjectPlanSource | null>("projectPlanSource", workspace?.planDocument?.source ?? null);
  const [projectSavedContent, setProjectSavedContent] = useWorkshopState<string | null>("projectPlanSavedContent", workspace?.planDocument ? projectPlanContent(workspace.planDocument.plan) : null);
  const [history, setHistory] = useWorkshopState<History | null>("history", null);
  const [library, setLibrary] = useState<CadPlan[]>([]);
  const [tool, setTool] = useState<CadTool>("select");
  const [activeLayerId, setActiveLayerId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useWorkshopState("view", DEFAULT_VIEW);
  const [snap, setSnap] = useState(true);
  const [grid, setGrid] = useState(true);
  const [ortho, setOrtho] = useState(false);
  const [thickness, setThickness] = useState(0.2);
  const [text, setText] = useState("Pièce");
  const [symbolId, setSymbolId] = useState<SymbolId>("bed");
  const [openingWidth, setOpeningWidth] = useState(0.9);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [resetKey, setResetKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const [unsavedIds, setUnsavedIds] = useWorkshopState<string[]>("unsavedIds", []);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [saveWarning, setSaveWarning] = useState("");
  const [snapshotValues] = useWorkshopState<Record<string, string>>("snapshots", {});
  const snapshots = useRef(snapshotValues);
  const latestPlan = useRef<CadPlan | null>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const assistantToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      let plans: CadPlan[] = [];
      let activeId: string | null = null;
      try {
        const result = loadPlans(workspaceStorage());
        plans = result.plans;
        activeId = result.activeId;
        for (const [id, snapshot] of Object.entries(result.snapshots)) {
          if (!(id in snapshots.current)) snapshots.current[id] = snapshot;
        }
        setStorageWarning(result.warning);
      } catch {
        setStorageWarning("Le stockage local est inaccessible. Exportez vos plans en JSON pour les conserver.");
      }
      const plan = history?.present ?? (workspace?.planDocument ? projectPlanDraft(workspace.planDocument.plan, workspace.planDocument.source) : project ? createEmptyPlan(project.name.slice(0, 120)) : plans.find(item => item.id === activeId) || plans[0] || createEmptyPlan());
      latestPlan.current = plan;
      try { snapshots.current[plan.id] = savePlan(workspaceStorage(), plan, snapshots.current[plan.id] ?? null); }
      catch (reason) {
        setSaved(false); setUnsavedIds([plan.id]);
        setSaveWarning(reason instanceof PlanConflictError ? reason.message : "Sauvegarde locale impossible. Exportez votre plan en JSON pour le conserver.");
      }
      setLibrary(plans.some(item => item.id === plan.id) ? plans : [plan, ...plans]);
      setHistory(history ?? { past: [], present: plan, future: [] });
      setActiveLayerId(plan.layers[0].id);
      if (plan.entities.length) requestAnimationFrame(() => {
        if (!cancelled && canvasWrap.current) setView(fittedView(plan, canvasWrap.current));
      });
    });
    return () => { cancelled = true; };
    // Initialiser une seule fois ce dossier ; conserver ensuite le dessin et son historique.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const projectDirty = !!projectSource && !!history && projectPlanContent(history.present) !== projectSavedContent;
    const sessionDraft = mode === "team" && !!history?.present.entities.length && (!projectSource || projectDirty);
    if (!unsavedIds.length && !projectDirty && !sessionDraft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedIds.length, projectSource, history, projectSavedContent, mode]);

  function persist(plan: CadPlan) {
    latestPlan.current = plan;
    setLibrary(previous => [plan, ...previous.filter(item => item.id !== plan.id)]);
    try {
      snapshots.current[plan.id] = savePlan(workspaceStorage(), plan, snapshots.current[plan.id] ?? null);
      setSaved(true);
      setUnsavedIds(previous => previous.filter(id => id !== plan.id));
      setSaveWarning("");
    } catch (reason) {
      setSaved(false);
      setUnsavedIds(previous => [...new Set([...previous, plan.id])]);
      setSaveWarning(reason instanceof PlanConflictError ? reason.message : "Sauvegarde locale impossible (stockage plein ou bloqué). Le plan reste ouvert : exportez-le en JSON pour le conserver.");
    }
  }
  function commit(plan: CadPlan): boolean {
    if (!history) return false;
    try {
      const next = parsePlan({ ...plan, updatedAt: new Date().toISOString() });
      setHistory({ past: [...history.past.slice(-49), history.present], present: next, future: [] });
      setError("");
      persist(next);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Modification invalide.");
      return false;
    }
  }
  function acceptProjectPlan(result: LoadedProjectPlan, savedPlan: CadPlan, reload = false) {
    // The draft object survives unmounts while a save is in flight.
    const current = (workspace?.draft.get("history") as History | undefined) ?? history;
    if (!current) return;
    const scope = (value: CadPlan) => projectPlanDraft(value, result.source);
    const next: History = reload
      ? { past: [...current.past.slice(-49), current.present].map(scope), present: scope(result.plan), future: [] }
      : { past: current.past.map(scope), present: scope(current.present), future: current.future.map(scope) };
    const content = projectPlanContent(savedPlan);
    workspace?.draft.set("history", next);
    workspace?.draft.set("projectPlanSource", result.source);
    workspace?.draft.set("projectPlanSavedContent", content);
    workspace?.draft.set("destination", result.source.projectId);
    setHistory(next); setProjectSource(result.source); setProjectSavedContent(content);
    persist(next.present);
    workspace?.onPlanSaved?.(result);
    if (reload) { cancelAction(); setTool("select"); }
  }
  function toggleAssistant() {
    if (!aiAllowed) return;
    const open = !assistantOpen;
    setAssistantOpen(open);
    if (open) setInspectorOpen(true);
    if (open) requestAnimationFrame(() => {
      const panel = document.getElementById("cad-assistant");
      panel?.scrollIntoView({ block: "nearest" });
      panel?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    });
  }
  function closeAssistant() {
    setAssistantOpen(false);
    assistantToggle.current?.focus({ preventScroll: true });
  }
  function applyAiProposal(proposal: CadPlan, source: CadPlan): boolean {
    if (!latestPlan.current || JSON.stringify(latestPlan.current) !== JSON.stringify(source)) {
      setError("Le plan a changé depuis cette demande. Relancez l’assistant sur la version actuelle avant d’appliquer une proposition.");
      return false;
    }
    try {
      const next = validateCadAiPlan(proposal, source);
      if (!commit(next)) return false;
      cancelAction();
      setTool("select");
      setActiveLayerId(next.layers.find(layer => layer.id === activeLayerId && layer.visible && !layer.locked)?.id
        || next.layers.find(layer => layer.visible && !layer.locked)?.id || next.layers[0].id);
      requestAnimationFrame(() => {
        if (canvasWrap.current) setView(fittedView(next, canvasWrap.current));
      });
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La proposition ne contient pas de plan valide.");
      return false;
    }
  }
  function resetCanvas() {
    const hadFocus = canvasWrap.current?.contains(document.activeElement);
    setResetKey(value => value + 1);
    if (hadFocus) requestAnimationFrame(() => canvasWrap.current?.querySelector("svg")?.focus({ preventScroll: true }));
  }
  function cancelAction() { setSelectedId(null); resetCanvas(); }
  function changeTool(next: CadTool) {
    setTool(next); resetCanvas();
    if (next === "door" || next === "window") setOpeningWidth(next === "door" ? 0.9 : 1.2);
    if (["door", "window", "symbol", "text", "room"].includes(next)) setInspectorOpen(true);
  }
  function openPlan(plan: CadPlan) {
    if (workspace?.onOpenPlanDraft) { workspace.onOpenPlanDraft(plan); return; }
    setProjectSource(null); setProjectSavedContent(null);
    setHistory({ past: [], present: plan, future: [] });
    setActiveLayerId(plan.layers.find(layer => layer.visible && !layer.locked)?.id || plan.layers[0].id);
    cancelAction();
    setTool("select");
    setView(DEFAULT_VIEW);
    if (plan.entities.length) requestAnimationFrame(() => {
      if (canvasWrap.current) setView(fittedView(plan, canvasWrap.current));
    });
    setError("");
    persist(plan);
  }
  function undo() {
    if (!history?.past.length) return;
    const previous = { ...history.past[history.past.length - 1], updatedAt: new Date().toISOString() };
    setHistory({ past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] });
    cancelAction(); persist(previous);
  }
  function redo() {
    if (!history?.future.length) return;
    const next = { ...history.future[0], updatedAt: new Date().toISOString() };
    setHistory({ past: [...history.past, history.present], present: next, future: history.future.slice(1) });
    cancelAction(); persist(next);
  }
  function addEntity(entity: CadEntity) {
    if (!history) return;
    const layer = history.present.layers.find(item => item.id === entity.layerId);
    if (!layer?.visible || layer.locked) return;
    if (commit({ ...history.present, entities: [...history.present.entities, entity] })) setSelectedId(entity.id);
  }
  function updateEntity(entity: CadEntity) {
    if (!history) return;
    const previous = history.present.entities.find(item => item.id === entity.id);
    const layer = history.present.layers.find(item => item.id === previous?.layerId);
    const target = history.present.layers.find(item => item.id === entity.layerId);
    if (!layer?.visible || layer.locked || !target?.visible || target.locked) return;
    try { commit(updatePlanEntity(history.present, entity)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Modification impossible."); }
  }
  function removeSelected() {
    if (!history || !selectedId) return;
    const entity = history.present.entities.find(item => item.id === selectedId);
    const layer = history.present.layers.find(item => item.id === entity?.layerId);
    if (!layer?.visible || layer.locked) return;
    try { if (commit(removePlanEntity(history.present, selectedId))) cancelAction(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Suppression impossible."); }
  }
  function updateLayer(layer: CadLayer) {
    if (!history) return;
    commit({ ...history.present, layers: history.present.layers.map(item => item.id === layer.id ? layer : item) });
    cancelAction();
  }
  function fit() {
    if (history && canvasWrap.current) setView(fittedView(history.present, canvasWrap.current));
  }
  function zoom(factor: number) {
    const rect = canvasWrap.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = Math.min(300, Math.max(10, view.scale * factor));
    setView({ scale, x: rect.width / 2 - (rect.width / 2 - view.x) * scale / view.scale, y: rect.height / 2 - (rect.height / 2 - view.y) * scale / view.scale });
  }
  async function importPlan(file: File) {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Le fichier JSON ne doit pas dépasser 5 Mo.");
      const imported = parsePlan(JSON.parse(await file.text()));
      openPlan({ ...imported, id: crypto.randomUUID(), name: `${imported.name.slice(0, 100)} (importé)`, updatedAt: new Date().toISOString() });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible d’importer ce plan JSON."); }
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (exporting) return;
    const input = event.target instanceof HTMLElement && (event.target.closest("input, textarea, select, [contenteditable=true]"));
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (input && event.target instanceof HTMLElement) event.target.blur();
      // Blur commits draft fields synchronously; never overwrite that commit with an old render.
      if (latestPlan.current) persist(latestPlan.current);
      return;
    }
    if (input) return;
    if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    else if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    else if (!modifier && !event.altKey && SHORTCUTS[event.key.toLowerCase()]) { event.preventDefault(); changeTool(SHORTCUTS[event.key.toLowerCase()]); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeSelected(); }
    else if (event.key === "Escape") { cancelAction(); changeTool("select"); }
  }

  if (!history) return <main className="plans-workspace" role="status">Chargement de l’atelier de plans…</main>;
  const plan = history.present;
  const selected = plan.entities.find(entity => entity.id === selectedId) || null;
  const selectedLayer = plan.layers.find(layer => layer.id === selected?.layerId);
  const activeLayer = plan.layers.find(layer => layer.id === activeLayerId) || plan.layers[0];
  return <main className="plans-workspace" onKeyDown={keyboard}>
    <div className="plans-heading">
      <div><div className="eyebrow"><span/> ATELIER DE DESSIN</div><h1>Vos idées prennent plan.</h1><p>Dessinez, mesurez et préparez vos plans en 2D.</p></div>
      <div className="plans-actions">
        {aiAllowed && <button ref={assistantToggle} type="button" className={`secondary-button plans-ai-toggle${assistantOpen ? " is-active" : ""}`} aria-expanded={assistantOpen} aria-controls="cad-assistant" onClick={toggleAssistant}><Sparkles size={16}/> Assistant IA</button>}
        <button type="button" className="secondary-button" onClick={() => openPlan(createExamplePlan())}><FolderOpen size={16}/> Exemple</button>
        <button type="button" className="secondary-button" onClick={() => importInput.current?.click()}><Upload size={16}/> Importer JSON</button>
        <button type="button" className="secondary-button" onClick={() => openPlan(createEmptyPlan())}><FilePlus2 size={16}/> Nouveau plan</button>
        <button type="button" className="primary-button" onClick={() => setExporting(true)}><Download size={16}/> Exporter</button>
        <input ref={importInput} className="sr-only" type="file" accept=".json,application/json" aria-label="Importer un plan JSON" onChange={event => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importPlan(file);
        }}/>
      </div>
    </div>
    <CadProjectActions plan={plan} source={projectSource} savedContent={projectSavedContent} onSaved={(result, snapshot) => acceptProjectPlan(result, snapshot)} onReload={result => acceptProjectPlan(result, result.plan, true)}/>
    <div className="plans-document-bar">
      <label>Nom du plan<input key={plan.id + plan.name} aria-label="Nom du plan" defaultValue={plan.name} maxLength={120} onBlur={event => {
        const name = event.currentTarget.value.trim() || "Sans titre";
        if (name !== plan.name) commit({ ...plan, name }); else event.currentTarget.value = name;
      }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}/></label>
      <label>Mes plans<select aria-label="Mes plans" value={plan.id} onChange={event => { const next = library.find(item => item.id === event.target.value); if (next) openPlan(next); }}>
        {library.map(item => <option key={item.id} value={item.id}>{unsavedIds.includes(item.id) ? "● " : ""}{item.name}</option>)}
      </select></label>
      <span role="status" className={saved ? "plans-saved" : "plans-unsaved"}>{saved ? mode === "team" ? "Brouillon de cette session · enregistrez dans le projet" : "Enregistré dans ce navigateur" : "Non enregistré · exportez en JSON"}</span>
    </div>
    {storageWarning && <p className="plans-error" role="alert">{storageWarning}</p>}
    {saveWarning && <p className="plans-error" role="alert">{saveWarning}</p>}
    {error && <p className="plans-error" role="alert">{error}</p>}
    <div className={`plans-layout${toolsOpen ? "" : " is-tools-collapsed"}${inspectorOpen ? "" : " is-inspector-collapsed"}`}>
      <div id="cad-tools" className="plans-tools" hidden={!toolsOpen}><CadToolbar tool={tool} onToolChange={changeTool} onUndo={undo} onRedo={redo} canUndo={!!history.past.length} canRedo={!!history.future.length} onDelete={removeSelected} canDelete={!!selected && !!selectedLayer?.visible && !selectedLayer.locked}/></div>
      <section className="plans-drawing" aria-label="Atelier de dessin 2D">
        <div className="plans-view-controls">
          <button type="button" aria-expanded={toolsOpen} aria-controls="cad-tools" aria-label={toolsOpen ? "Masquer outils" : "Afficher outils"} title={toolsOpen ? "Masquer les outils" : "Afficher les outils"} onClick={() => setToolsOpen(!toolsOpen)}>{toolsOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>} Outils</button>
          <button type="button" aria-expanded={inspectorOpen} aria-controls="cad-inspector" aria-label={inspectorOpen ? "Masquer panneaux" : "Afficher panneaux"} title={inspectorOpen ? "Masquer les panneaux" : "Afficher les panneaux"} onClick={() => setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? <PanelRightClose size={16}/> : <PanelRightOpen size={16}/>} Panneaux</button>
          <button type="button" aria-pressed={grid} onClick={() => setGrid(!grid)} title="Afficher la grille"><Grid2X2 size={15}/> Grille</button>
          <button type="button" aria-pressed={snap} onClick={() => setSnap(!snap)} title="Aligner les points sur une grille de 10 cm"><Magnet size={15}/> Aimant 10 cm</button>
          <button type="button" aria-pressed={ortho} onClick={() => setOrtho(!ortho)} title="Tracer horizontalement ou verticalement (ou maintenir Maj)"><Ruler size={15}/> Ortho</button>
          <span className="plans-zoom-controls"><button type="button" aria-label="Dézoomer" onClick={() => zoom(1 / 1.25)}><Minus size={16}/></button><span>{Math.round(view.scale / DEFAULT_VIEW.scale * 100)} %</span><button type="button" aria-label="Zoomer" onClick={() => zoom(1.25)}><Plus size={16}/></button><button type="button" aria-label="Cadrer le plan" title="Cadrer le plan" onClick={fit}><Maximize size={16}/></button></span>
        </div>
        <div ref={canvasWrap} className="plans-canvas-wrap">
          <CadCanvas plan={plan} tool={tool} activeLayerId={activeLayer.id} selectedId={selectedId} onSelect={setSelectedId} onAdd={addEntity} onUpdate={updateEntity} view={view} onViewChange={setView} snap={snap} grid={grid} ortho={ortho} thickness={thickness} text={text} symbolId={symbolId} openingWidth={openingWidth} onCursorChange={setCursor} resetKey={resetKey}/>
        </div>
        <div className="plans-statusbar"><span>{TOOL_LABELS[tool]} · {plan.entities.length} objet{plan.entities.length !== 1 ? "s" : ""}</span><span>X {cursor.x.toFixed(2)} · Y {cursor.y.toFixed(2)} m</span><span>Unités : mètres</span></div>
        <p className="plans-help">{HINTS[tool]}{(!activeLayer.visible || activeLayer.locked) && " Le calque actif est masqué ou verrouillé : choisissez un autre calque pour dessiner."}</p>
      </section>
      <aside id="cad-inspector" className="plans-inspector" aria-label="Assistant, bibliothèque, propriétés et calques" hidden={!inspectorOpen}>
        {aiAllowed && assistantOpen && <CadAssistant key={plan.id} plan={plan} selectedEntityId={selectedId} onApply={applyAiProposal} onClose={closeAssistant}/>}
        <CadProperties entity={selected} plan={plan} onDimensionWall={id => { try { addEntity(createWallDimension(plan, id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible de coter ce mur."); } }} onChange={entity => { updateEntity(entity); resetCanvas(); }} thickness={thickness} onThicknessChange={setThickness} text={text} onTextChange={setText}/>
        <CadLibrary tool={tool} symbolId={symbolId} openingWidth={openingWidth} onOpeningWidth={setOpeningWidth} onSymbol={id => { setSymbolId(id); changeTool("symbol"); }}/>
        <CadRooms plan={plan} selectedId={selectedId} onSelect={id => { setSelectedId(id); changeTool("select"); document.querySelector<HTMLDetailsElement>(".cad-properties")?.setAttribute("open", ""); }}/>
        <CadLayers layers={plan.layers} activeLayerId={activeLayer.id} onActivate={id => { setActiveLayerId(id); setResetKey(value => value + 1); }} onChange={updateLayer} onAdd={() => {
          const layer: CadLayer = { id: crypto.randomUUID(), name: `Calque ${plan.layers.length + 1}`, color: "#35a5a0", visible: true, locked: false };
          commit({ ...plan, layers: [...plan.layers, layer] }); setActiveLayerId(layer.id);
        }}/>
      </aside>
    </div>
    <p className="plans-help">Deux clics pour tracer · Molette pour zoomer · Outil main pour naviguer · Ctrl/Cmd + Z pour annuler. {mode === "team" ? "Enregistrez votre plan dans un projet ou exportez-le en JSON avant de quitter cette session." : "Les plans sont sauvegardés sur cet appareil ; le JSON permet de les rouvrir ailleurs."}</p>
    {exporting && <CadExportModal plan={plan} project={project ? { name: project.name, client: project.client, reference: project.reference } : undefined} onClose={() => setExporting(false)}/>}
  </main>;
}
