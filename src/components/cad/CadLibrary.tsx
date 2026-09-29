"use client";

import { Armchair, Shapes } from "lucide-react";
import { architecturalPrimitives, SYMBOLS } from "@/lib/cad/architecture";
import type { CadTool, SymbolId } from "@/lib/cad/types";
import { NumberField } from "./CadProperties";

type Props = { symbolId: SymbolId; tool: CadTool; onSymbol: (id: SymbolId) => void; openingWidth: number; onOpeningWidth: (width: number) => void };

export function CadLibrary({ symbolId, tool, onSymbol, openingWidth, onOpeningWidth }: Props) {
  return <details open className="cad-panel cad-library">
    <summary className="cad-panel-heading"><h2><Shapes size={15} aria-hidden="true"/>Bibliothèque</h2><Armchair size={16} aria-hidden="true"/></summary>
    {(tool === "door" || tool === "window") && <div className="cad-opening-settings"><NumberField label={tool === "door" ? "Largeur des portes" : "Largeur des fenêtres"} value={openingWidth} min={0.1} max={50} onCommit={onOpeningWidth}/><p className="cad-related-note">Cliquez sur le mur qui accueillera l’ouverture.</p></div>}
    <p className="cad-panel-intro">Choisissez un symbole, puis cliquez dans le plan.</p>
    <div className="cad-symbol-library">{SYMBOLS.map(symbol => <button type="button" key={symbol.id} aria-label={`Insérer ${symbol.label}`} aria-pressed={tool === "symbol" && symbolId === symbol.id} onClick={() => onSymbol(symbol.id)}>
      <svg viewBox={`-0.15 -0.15 ${symbol.width + 0.3} ${symbol.height + 0.3}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={0.04}>{architecturalPrimitives({ id: "preview", type: "symbol", layerId: "preview", start: { x: 0, y: 0 }, end: { x: symbol.width, y: symbol.height }, symbolId: symbol.id }).map((primitive, index) => primitive.kind === "circle" ? <circle key={index} cx={primitive.center.x} cy={primitive.center.y} r={primitive.radius}/> : primitive.kind === "text" ? <text key={index} x={primitive.point.x} y={primitive.point.y} fontSize={primitive.size} textAnchor={primitive.centered ? "middle" : "start"} fill="currentColor" stroke="none">{primitive.text}</text> : primitive.closed ? <polygon key={index} points={primitive.points.map(p => `${p.x},${p.y}`).join(" ")}/> : <polyline key={index} points={primitive.points.map(p => `${p.x},${p.y}`).join(" ")}/>)}</svg>
      <span>{symbol.label}</span>
    </button>)}</div>
  </details>;
}
