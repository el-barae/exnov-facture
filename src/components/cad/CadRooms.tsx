"use client";

import { Scan } from "lucide-react";
import { roomArea } from "@/lib/cad/architecture";
import type { CadPlan } from "@/lib/cad/types";

export function CadRooms({ plan, selectedId, onSelect }: { plan: CadPlan; selectedId: string | null; onSelect: (id: string) => void }) {
  const rooms = plan.entities.filter(entity => entity.type === "room");
  const format = (area: number) => `${area.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m²`;
  return <details open className="cad-panel cad-rooms">
    <summary className="cad-panel-heading"><h2><Scan size={15} aria-hidden="true"/>Surfaces des pièces</h2><span className="cad-unit-badge">{rooms.length}</span></summary>
    <p className="cad-panel-intro">Tracez le contour intérieur avec l’outil Pièce. La surface se recalcule lorsque vous modifiez ses sommets.</p>
    {rooms.length ? <><ul className="cad-room-list">{rooms.map(room => {
      const visible = plan.layers.find(layer => layer.id === room.layerId)?.visible;
      return <li key={room.id}><button type="button" aria-pressed={room.id === selectedId} disabled={!visible} onClick={() => onSelect(room.id)}><span>{room.text || "Pièce"}{!visible && " · masquée"}</span><strong>{format(roomArea(room))}</strong></button></li>;
    })}</ul><div className="cad-measurement"><span>Total des contours</span><strong>{format(rooms.reduce((sum, room) => sum + roomArea(room), 0))}</strong></div><p className="cad-panel-footnote">Somme des pièces, y compris masquées. Les contours doivent être distincts pour éviter de compter une surface deux fois.</p></> : <p className="cad-related-note">Aucune pièce définie. Un rectangle peut aussi être converti en pièce depuis ses propriétés.</p>}
  </details>;
}
