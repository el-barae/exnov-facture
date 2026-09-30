"use client";

import { AppWindow, Armchair, BrickWall, Circle, DoorOpen, Hand, Minus, MousePointer2, Pentagon, Redo2, Ruler, Square, Trash2, Type, Undo2 } from "lucide-react";
import { TOOL_LABELS, type CadTool } from "@/lib/cad/types";

type Props = {
  tool: CadTool;
  onToolChange: (tool: CadTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDelete: () => void;
  canDelete: boolean;
};

const drawingTools = [
  { id: "select", icon: MousePointer2, shortcut: "V" },
  { id: "pan", icon: Hand, shortcut: "H" },
  { id: "wall", icon: BrickWall, shortcut: "W" },
  { id: "door", icon: DoorOpen, shortcut: "O" },
  { id: "window", icon: AppWindow, shortcut: "F" },
  { id: "symbol", icon: Armchair, shortcut: "B" },
  { id: "room", icon: Pentagon, shortcut: "P" },
  { id: "line", icon: Minus, shortcut: "L" },
  { id: "rectangle", icon: Square, shortcut: "R" },
  { id: "circle", icon: Circle, shortcut: "C" },
  { id: "dimension", icon: Ruler, shortcut: "D" },
  { id: "text", icon: Type, shortcut: "T" },
] as const;

export function CadToolbar({ tool, onToolChange, onUndo, onRedo, canUndo, canRedo, onDelete, canDelete }: Props) {
  return (
    <div className="cad-toolbar" role="toolbar" aria-label="Outils de dessin">
      <div className="cad-tool-group">
        {drawingTools.map(({ id, icon: Icon, shortcut }) => (
          <button key={id} type="button" className="cad-tool" aria-label={TOOL_LABELS[id]} aria-pressed={tool === id} title={`${TOOL_LABELS[id]} (${shortcut})`} onClick={() => onToolChange(id)}>
            <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
            <span>{id === "pan" ? "Déplacer" : TOOL_LABELS[id]}</span>
          </button>
        ))}
      </div>
      <div className="cad-tool-group cad-history-tools">
        <button type="button" className="cad-tool" aria-label="Annuler" title="Annuler (Ctrl / ⌘ + Z)" disabled={!canUndo} onClick={onUndo}><Undo2 size={18} aria-hidden="true" /><span>Annuler</span></button>
        <button type="button" className="cad-tool" aria-label="Rétablir" title="Rétablir (Ctrl / ⌘ + Maj + Z)" disabled={!canRedo} onClick={onRedo}><Redo2 size={18} aria-hidden="true" /><span>Rétablir</span></button>
        <button type="button" className="cad-tool cad-tool-delete" aria-label="Supprimer la sélection" title="Supprimer la sélection (Suppr)" disabled={!canDelete} onClick={onDelete}><Trash2 size={17} aria-hidden="true" /><span>Suppr.</span></button>
      </div>
    </div>
  );
}
