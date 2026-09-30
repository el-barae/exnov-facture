"use client";

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { dimensionLabel, dimensionTextPoint, distance, snapPoint, wallCorners } from "@/lib/cad/geometry";
import { architecturalPrimitives, attachOpening, createWallDimension, moveEntity, resolvePlanGeometry, SYMBOLS, updatePlanEntity, validateRoomPoints, visibleWallParts } from "@/lib/cad/architecture";
import { TOOL_LABELS, type CadEntity, type CadPlan, type CadTool, type CadView, type Point, type SymbolId } from "@/lib/cad/types";

type CadCanvasProps = {
  plan: CadPlan; tool: CadTool; activeLayerId: string; selectedId: string | null;
  onSelect: (id: string | null) => void; onAdd: (entity: CadEntity) => void; onUpdate: (entity: CadEntity) => void;
  view: CadView; onViewChange: (view: CadView) => void; snap: boolean; grid: boolean; ortho: boolean;
  thickness: number; text: string; symbolId: SymbolId; openingWidth: number;
  onCursorChange: (point: Point) => void; resetKey: number;
};
type Gesture =
  | { kind: "pan"; pointerId: number; origin: Point; view: CadView }
  | { kind: "move"; pointerId: number; origin: Point; entity: CadEntity; last: CadEntity; moved: boolean }
  | { kind: "draw"; pointerId: number; origin: Point };
const SELECTED_COLOR = "#d8aa55";
const measure = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const coordinates = (points: Point[]) => points.map(point => `${point.x},${point.y}`).join(" ");

/** Remounting discards unfinished gestures after tool, document or undo changes. */
export function CadCanvas(props: CadCanvasProps) {
  return <CanvasSurface key={`${props.plan.id}:${props.resetKey}:${props.tool}:${props.activeLayerId}`} {...props} />;
}

function EntityShape({ entity, plan, color, scale, selected = false, draft = false, interactive = false, onSelect }: {
  entity: CadEntity; plan: CadPlan; color: string; scale: number; selected?: boolean; draft?: boolean;
  interactive?: boolean; onSelect?: (id: string) => void;
}) {
  const { start, end, type } = entity;
  const ink = selected ? SELECTED_COLOR : color;
  const hitWidth = 14 / scale;
  const stroke = { stroke: ink, strokeWidth: selected ? 2.3 : 1.7, vectorEffect: "non-scaling-stroke", fill: "none", strokeDasharray: draft ? "6 4" : undefined };
  const hitStroke = { stroke: "transparent", strokeWidth: hitWidth, fill: "none" };
  let shape;
  if (type === "room" || type === "door" || type === "window" || type === "symbol") {
    shape = architecturalPrimitives(entity).map((primitive, index) => {
      if (primitive.kind === "text") return <text key={index} x={primitive.point.x} y={primitive.point.y} fill={ink} fontSize={primitive.size} textAnchor={primitive.centered ? "middle" : "start"} fontFamily="Arial, sans-serif" stroke="var(--cad-canvas-bg, #f8fafc)" strokeWidth={3 / scale} paintOrder="stroke" strokeLinejoin="round">{primitive.text.split(/\r?\n/).map((line, lineIndex) => <tspan key={lineIndex} x={primitive.point.x} dy={lineIndex ? primitive.size * 1.3 : 0}>{line}</tspan>)}</text>;
      if (primitive.kind === "circle") return <g key={index}>
        <circle cx={primitive.center.x} cy={primitive.center.y} r={primitive.radius} {...hitStroke} fill="transparent" />
        <circle cx={primitive.center.x} cy={primitive.center.y} r={primitive.radius} {...stroke} />
      </g>;
      const path = primitive.points.map((point, position) => `${position ? "L" : "M"} ${point.x} ${point.y}`).join(" ") + (primitive.closed ? " Z" : "");
      return <g key={index}>
        <path d={path} {...hitStroke} fill={primitive.closed ? "transparent" : "none"} />
        <path d={path} {...stroke} fill={primitive.fill ? ink : "none"} fillOpacity={type === "room" ? 0.075 : 0.18} />
      </g>;
    });
  } else if (type === "circle") {
    const radius = distance(start, end);
    shape = <><circle cx={start.x} cy={start.y} r={radius} {...hitStroke} fill="transparent" /><circle cx={start.x} cy={start.y} r={radius} {...stroke} /></>;
  } else if (type === "rectangle") {
    const bounds = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
    shape = <><rect {...bounds} {...hitStroke} fill="transparent" /><rect {...bounds} {...stroke} /></>;
  } else if (type === "text") {
    const fontSize = entity.fontSize ?? 0.3;
    const lines = (entity.text ?? "").split(/\r?\n/);
    shape = <>
      <rect x={start.x} y={start.y - fontSize} width={Math.max(fontSize, ...lines.map(line => line.length * fontSize * 0.64))} height={fontSize * lines.length * 1.3} fill="transparent" />
      <text x={start.x} y={start.y} fill={ink} fontSize={fontSize} fontFamily="Arial, sans-serif" style={{ whiteSpace: "pre" }}>{lines.map((line, index) => <tspan key={index} x={start.x} dy={index ? fontSize * 1.3 : 0}>{line}</tspan>)}</text>
    </>;
  } else if (type === "dimension") {
    if (distance(start, end) < 0.001) return null;
    const label = dimensionTextPoint(entity);
    const wall = entity.wallId ? plan.entities.find(item => item.id === entity.wallId) : undefined;
    const extensions = wall ? ` M ${wall.start.x} ${wall.start.y} L ${start.x} ${start.y} M ${wall.end.x} ${wall.end.y} L ${end.x} ${end.y}` : "";
    const paths = `M ${start.x} ${start.y} L ${end.x} ${end.y} M ${start.x - 0.1} ${start.y - 0.1} L ${start.x + 0.1} ${start.y + 0.1} M ${end.x - 0.1} ${end.y - 0.1} L ${end.x + 0.1} ${end.y + 0.1}${extensions}`;
    shape = <>
      <path d={paths} {...hitStroke} /><path d={paths} {...stroke} strokeWidth={selected ? 2 : 1.2} />
      <text x={label.x} y={label.y} textAnchor="middle" fontSize={entity.fontSize ?? 0.24} fill={ink} stroke="var(--cad-canvas-bg, #f8fafc)" strokeWidth={4 / scale} paintOrder="stroke" strokeLinejoin="round" fontFamily="Arial, sans-serif">{dimensionLabel(entity)}</text>
    </>;
  } else if (type === "wall") {
    shape = <>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...hitStroke} strokeWidth={Math.max(hitWidth, entity.thickness ?? 0.2)} strokeLinecap="butt" />
      {(draft ? [entity] : visibleWallParts(plan, entity)).map((part, index) => <polygon key={index} points={coordinates(wallCorners(part))} {...stroke} fill={ink} fillOpacity={draft ? 0.12 : 0.22} />)}
    </>;
  } else {
    const line = { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    shape = <><line {...line} {...hitStroke} /><line {...line} {...stroke} /></>;
  }
  const handles = type === "room" ? entity.points ?? [start, end] : [start, ...(type === "text" ? [] : [end])];
  return <g
    data-entity-id={draft ? undefined : entity.id} data-entity-type={type}
    role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
    aria-label={interactive ? `${TOOL_LABELS[type]}${entity.text ? ` : ${entity.text}` : ""}` : undefined}
    aria-pressed={interactive ? selected : undefined} pointerEvents={interactive ? "auto" : "none"}
    onKeyDown={interactive ? (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect?.(entity.id); }
    } : undefined}
  >
    {shape}
    {selected && <g pointerEvents="none">{handles.map((point, index) => <rect key={index} x={point.x - 3 / scale} y={point.y - 3 / scale} width={6 / scale} height={6 / scale} fill="var(--cad-canvas-bg, #f8fafc)" stroke={SELECTED_COLOR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)}</g>}
  </g>;
}

function CanvasSurface({ plan, tool, activeLayerId, selectedId, onSelect, onAdd, onUpdate, view, onViewChange, snap, grid, ortho, thickness, text, symbolId, openingWidth, onCursorChange }: CadCanvasProps) {
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<Gesture | null>(null);
  const roomFinishedAt = useRef(0);
  const [start, setStart] = useState<Point | null>(null), [cursor, setCursor] = useState<Point | null>(null);
  const [previewPlan, setPreviewPlan] = useState<CadPlan | null>(null), [panning, setPanning] = useState(false);
  const [roomPoints, setRoomPoints] = useState<Point[]>([]), [message, setMessage] = useState("");
  const [size, setSize] = useState({ width: 1000, height: 620 });
  const patternId = useId().replace(/:/g, "");
  const activeLayer = plan.layers.find(layer => layer.id === activeLayerId);
  const canDraw = !!activeLayer?.visible && !activeLayer.locked;
  const drawing = tool !== "select" && tool !== "pan";
  const displayedPlan = previewPlan ?? resolvePlanGeometry(plan);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (gesture.current) return;
      const bounds = element.getBoundingClientRect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      const scale = Math.min(300, Math.max(10, view.scale * Math.exp(-pixels * 0.0015)));
      onViewChange({ x: point.x - (point.x - view.x) / view.scale * scale, y: point.y - (point.y - view.y) / view.scale * scale, scale });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [view, onViewChange]);

  useEffect(() => {
    const element = svg.current;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = gesture.current;
      gesture.current = null;
      if (active && element?.hasPointerCapture(active.pointerId)) element.releasePointerCapture(active.pointerId);
      setStart(null); setPreviewPlan(null); setPanning(false); setRoomPoints([]); setMessage("");
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  function screenPoint(event: ReactPointerEvent<SVGSVGElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  function worldPoint(point: Point, shiftKey = false): Point {
    let result = { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
    if (snap) result = snapPoint(result);
    const anchor = tool === "room" ? roomPoints.at(-1) : start;
    if (anchor && (ortho || shiftKey) && ["line", "wall", "dimension", "room"].includes(tool)) {
      result = Math.abs(result.x - anchor.x) >= Math.abs(result.y - anchor.y) ? { x: result.x, y: anchor.y } : { x: anchor.x, y: result.y };
    }
    return result;
  }
  function makeEntity(from: Point, to: Point): CadEntity {
    return { id: crypto.randomUUID(), type: tool as CadEntity["type"], layerId: activeLayerId, start: from, end: to,
      ...(tool === "wall" ? { thickness } : {}), ...(tool === "text" ? { text: text.trim(), fontSize: 0.3 } : {}) };
  }
  function makeSymbol(point: Point): CadEntity {
    const preset = SYMBOLS.find(item => item.id === symbolId) ?? SYMBOLS[0];
    return { ...makeEntity(point, { x: point.x + preset.width, y: point.y + preset.height }), type: "symbol", symbolId: preset.id, rotation: 0 };
  }
  function openingAt(point: Point): CadEntity {
    const walls = plan.entities.filter(entity => entity.type === "wall" && plan.layers.some(layer => layer.id === entity.layerId && layer.visible && !layer.locked));
    const candidates = walls.map(wall => {
      const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y;
      const squaredLength = dx * dx + dy * dy;
      const t = squaredLength ? Math.min(1, Math.max(0, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / squaredLength)) : 0;
      return { wall, separation: distance(point, { x: wall.start.x + dx * t, y: wall.start.y + dy * t }) };
    }).filter(({ wall, separation }) => separation <= Math.max(10 / view.scale, (wall.thickness ?? .2) / 2)).sort((a, b) => a.separation - b.separation);
    if (!candidates.length) throw new Error("Cliquez sur un mur visible et déverrouillé pour placer l’ouverture.");
    return attachOpening(plan, tool as "door" | "window", candidates[0].wall.id, point, openingWidth, activeLayerId);
  }
  function addEntity(entity: CadEntity) {
    try { onAdd(entity); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de créer cet objet."); }
  }
  function finishRoom() {
    if (!canDraw) { setMessage("Choisissez un calque visible et déverrouillé pour dessiner."); return; }
    if (roomPoints.length < 3) { setMessage("Placez au moins trois sommets pour fermer la pièce."); return; }
    const entity: CadEntity = { id: crypto.randomUUID(), type: "room", layerId: activeLayerId, start: roomPoints[0], end: roomPoints.at(-1)!, points: roomPoints, text: text.trim() || "Pièce" };
    try {
      validateRoomPoints(roomPoints);
      onAdd(entity); roomFinishedAt.current = performance.now(); setRoomPoints([]); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Le contour de cette pièce est invalide."); }
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (gesture.current || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    const point = screenPoint(event), world = worldPoint(point, event.shiftKey);
    setCursor(world); onCursorChange(world);
    if (event.button === 1 || tool === "pan") {
      gesture.current = { kind: "pan", pointerId: event.pointerId, origin: point, view }; setPanning(true);
    } else if (tool === "select") {
      const entityId = (event.target as Element).closest("[data-entity-id]")?.getAttribute("data-entity-id");
      const entity = displayedPlan.entities.find(item => item.id === entityId);
      const layer = entity && plan.layers.find(item => item.id === entity.layerId);
      if (!entity || !layer?.visible || layer.locked) { onSelect(null); return; }
      setMessage(""); onSelect(entity.id);
      gesture.current = { kind: "move", pointerId: event.pointerId, origin: point, entity, last: entity, moved: false };
    } else {
      if (!canDraw) { setMessage("Choisissez un calque visible et déverrouillé pour dessiner."); return; }
      if (tool === "text" && !text.trim()) return;
      gesture.current = { kind: "draw", pointerId: event.pointerId, origin: point };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (active && event.pointerId !== active.pointerId) return;
    const point = screenPoint(event), world = worldPoint(point, event.shiftKey);
    setCursor(world); onCursorChange(world);
    if (active?.kind === "pan") {
      onViewChange({ ...active.view, x: active.view.x + point.x - active.origin.x, y: active.view.y + point.y - active.origin.y });
    } else if (active?.kind === "move") {
      if (!active.moved && distance(point, active.origin) < 3) return;
      let delta = { x: (point.x - active.origin.x) / view.scale, y: (point.y - active.origin.y) / view.scale };
      if (snap) delta = snapPoint(delta);
      try {
        const candidate = moveEntity(plan, active.entity, delta);
        const candidatePlan = updatePlanEntity(plan, candidate);
        active.moved = true; active.last = candidate;
        setPreviewPlan(candidatePlan); setMessage("");
      } catch (error) {
        // Reject the complete gesture if any dependent object is protected.
        active.moved = false; active.last = active.entity; setPreviewPlan(null);
        setMessage(error instanceof Error ? error.message : "Impossible de déplacer cet objet.");
      }
    }
  }
  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setPanning(false);
    if (active.kind === "move") {
      setPreviewPlan(null);
      if (active.moved && JSON.stringify(active.entity) !== JSON.stringify(active.last)) {
        try { onUpdate(active.last); } catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de déplacer cet objet."); }
      }
      return;
    }
    if (active.kind !== "draw" || !canDraw || distance(active.origin, screenPoint(event)) > 6) return;
    const point = worldPoint(screenPoint(event), event.shiftKey);
    if (tool === "text") { if (text.trim()) addEntity(makeEntity(point, point)); return; }
    if (tool === "symbol") { addEntity(makeSymbol(point)); return; }
    if (tool === "door" || tool === "window") {
      try { addEntity(openingAt(point)); } catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de placer cette ouverture."); }
      return;
    }
    if (tool === "room") {
      if (performance.now() - roomFinishedAt.current < 350) return;
      if (roomPoints.length >= 3 && distance(point, roomPoints[0]) < 10 / view.scale) { finishRoom(); return; }
      if (roomPoints.length && distance(point, roomPoints.at(-1)!) < 3 / view.scale) return;
      if (roomPoints.length >= 64) { setMessage("Une pièce peut contenir 64 sommets au maximum. Terminez le tracé."); return; }
      setRoomPoints([...roomPoints, point]); setMessage(""); return;
    }
    if (!start) { setStart(point); setCursor(point); return; }
    const width = Math.abs(point.x - start.x), height = Math.abs(point.y - start.y);
    if (distance(start, point) < 0.001 || (tool === "rectangle" && (width < 0.001 || height < 0.001))) return;
    if (tool === "dimension") {
      const tolerance = 10 / view.scale;
      const wall = plan.entities.find(entity => entity.type === "wall" && plan.layers.some(layer => layer.id === entity.layerId && layer.visible && !layer.locked) &&
        ((distance(start, entity.start) < tolerance && distance(point, entity.end) < tolerance) || (distance(start, entity.end) < tolerance && distance(point, entity.start) < tolerance)));
      if (wall) { addEntity({ ...createWallDimension(plan, wall.id, .6), layerId: activeLayerId }); setStart(null); return; }
    }
    addEntity(makeEntity(start, point)); setStart(null);
  }
  function cancelPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    setStart(null); setPreviewPlan(null); setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const minorStep = [0.1, 0.2, 0.5, 1].find(step => step * view.scale >= 8) ?? 1;
  const minorSize = minorStep * view.scale, majorSize = view.scale;
  let draft: CadEntity | null = null;
  if (drawing && canDraw && cursor) {
    if (tool === "symbol") draft = { ...makeSymbol(cursor), id: "preview" };
    else if (tool === "door" || tool === "window") {
      try { draft = { ...openingAt(cursor), id: "preview" }; } catch { /* An opening preview appears only on a valid host wall. */ }
    } else if (tool !== "room" && (start || tool === "text")) draft = { ...makeEntity(start ?? cursor, cursor), id: "preview" };
  }
  const scalePower = 10 ** Math.floor(Math.log10(100 / view.scale));
  const scaleLength = [1, 2, 5, 10].find(value => value * scalePower * view.scale >= 65)! * scalePower;
  const scalePixels = scaleLength * view.scale;
  const previewLabel = draft && start && cursor && !["text", "dimension", "symbol", "room", "door", "window"].includes(tool)
    ? tool === "rectangle" ? `${measure(Math.abs(cursor.x - start.x))} × ${measure(Math.abs(cursor.y - start.y))}` : `${tool === "circle" ? "R " : ""}${measure(distance(start, cursor))}` : null;
  const renderOrder = (entity: CadEntity) => entity.type === "room" ? 0 : entity.type === "wall" ? 1 : 2;

  return <>
    <svg
      ref={svg} className="cad-canvas" data-testid="cad-canvas" width="100%" height="100%"
      role="application" tabIndex={0} aria-label="Zone de dessin du plan" aria-describedby={`${patternId}-instructions`}
      style={{ display: "block", touchAction: "none", userSelect: "none", cursor: panning ? "grabbing" : tool === "pan" ? "grab" : tool === "select" ? "default" : canDraw ? "crosshair" : "not-allowed" }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer}
      onPointerLeave={() => { if (!gesture.current) setCursor(null); }} onContextMenu={event => event.preventDefault()}
      onDoubleClick={event => { if (tool === "room" && performance.now() - roomFinishedAt.current >= 350) { event.preventDefault(); finishRoom(); } }}
      onKeyDown={event => { if (tool === "room" && event.key === "Enter") { event.preventDefault(); event.stopPropagation(); finishRoom(); } }}
    >
      <desc id={`${patternId}-instructions`}>Deux clics définissent une forme. Pour une ouverture, cliquez sur un mur. Pour une pièce, cliquez sur chaque sommet puis appuyez sur Entrée, double-cliquez ou utilisez Terminer la pièce. La molette zoome et le bouton central déplace la vue. Échap annule le tracé en cours.</desc>
      <defs>
        <pattern id={`${patternId}-minor`} width={minorSize} height={minorSize} x={view.x % minorSize} y={view.y % minorSize} patternUnits="userSpaceOnUse"><path d={`M ${minorSize} 0 H 0 V ${minorSize}`} fill="none" stroke="var(--cad-grid-minor, #e5e9ef)" strokeWidth="0.7" /></pattern>
        <pattern id={`${patternId}-major`} width={majorSize} height={majorSize} x={view.x % majorSize} y={view.y % majorSize} patternUnits="userSpaceOnUse"><path d={`M ${majorSize} 0 H 0 V ${majorSize}`} fill="none" stroke="var(--cad-grid-major, #cbd5e1)" strokeWidth="0.9" /></pattern>
      </defs>
      <rect width="100%" height="100%" fill="var(--cad-canvas-bg, #f8fafc)" />
      {grid && <g pointerEvents="none">
        {minorStep < 1 && <rect width="100%" height="100%" fill={`url(#${patternId}-minor)`} />}
        <rect width="100%" height="100%" fill={`url(#${patternId}-major)`} />
        <path d={`M ${view.x} 0 V ${size.height} M 0 ${view.y} H ${size.width}`} stroke="var(--cad-axis, #a8b5c4)" strokeWidth="1" strokeDasharray="5 5" opacity="0.55" />
      </g>}
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        {[...displayedPlan.entities].sort((a, b) => renderOrder(a) - renderOrder(b)).map(entity => {
          const layer = displayedPlan.layers.find(item => item.id === entity.layerId);
          if (!layer?.visible) return null;
          return <EntityShape key={entity.id} entity={entity} plan={displayedPlan} color={layer.color} scale={view.scale} selected={entity.id === selectedId && !layer.locked} interactive={tool === "select" && !layer.locked} onSelect={onSelect} />;
        })}
        {draft && <EntityShape entity={draft} plan={displayedPlan} color={activeLayer?.color ?? SELECTED_COLOR} scale={view.scale} draft />}
        {tool === "room" && roomPoints.length > 0 && <g pointerEvents="none">
          <polyline points={coordinates([...roomPoints, ...(cursor ? [cursor] : [])])} fill="none" stroke={SELECTED_COLOR} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          {roomPoints.length >= 2 && cursor && <line x1={cursor.x} y1={cursor.y} x2={roomPoints[0].x} y2={roomPoints[0].y} stroke={SELECTED_COLOR} strokeWidth={1} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />}
          {roomPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={4 / view.scale} fill={SELECTED_COLOR} />)}
        </g>}
        {start && <circle cx={start.x} cy={start.y} r={4 / view.scale} fill={SELECTED_COLOR} pointerEvents="none" />}
      </g>
      {drawing && canDraw && cursor && <g pointerEvents="none" stroke={SELECTED_COLOR} strokeWidth="1" opacity="0.85">
        <path d={`M ${cursor.x * view.scale + view.x - 9} ${cursor.y * view.scale + view.y} h 18 M ${cursor.x * view.scale + view.x} ${cursor.y * view.scale + view.y - 9} v 18`} />
        {snap && <rect x={cursor.x * view.scale + view.x - 3} y={cursor.y * view.scale + view.y - 3} width="6" height="6" fill="var(--cad-canvas-bg, #f8fafc)" />}
      </g>}
      {previewLabel && cursor && <text pointerEvents="none" x={cursor.x * view.scale + view.x + 14} y={cursor.y * view.scale + view.y - 14} fill={SELECTED_COLOR} fontSize="12" fontFamily="Arial, sans-serif" stroke="var(--cad-canvas-bg, #f8fafc)" strokeWidth="4" paintOrder="stroke" strokeLinejoin="round">{previewLabel}</text>}
      <g pointerEvents="none" transform={`translate(24 ${Math.max(36, size.height - 26)})`} fill="var(--cad-muted, #8294a8)" fontFamily="Arial, sans-serif">
        <path d={`M 0 -5 V 0 H ${scalePixels} V -5`} fill="none" stroke="var(--cad-muted, #8294a8)" strokeWidth="1.5" /><text x={scalePixels / 2} y="-10" textAnchor="middle" fontSize="12">{scaleLength.toLocaleString("fr-FR")} m</text>
      </g>
    </svg>
    {tool === "room" && roomPoints.length > 0 && <div className="cad-room-actions">
      <span>{roomPoints.length} sommet{roomPoints.length > 1 ? "s" : ""}</span>
      <button type="button" disabled={roomPoints.length < 3} onClick={finishRoom}>Terminer la pièce</button>
      <button type="button" onClick={() => { setRoomPoints([]); setMessage(""); svg.current?.focus(); }}>Annuler le tracé</button>
    </div>}
    <div className="cad-canvas-message" role="status" aria-live="polite" aria-atomic="true">{message}</div>
  </>;
}
