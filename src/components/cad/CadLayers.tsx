"use client";

import { Eye, EyeOff, Layers, LockKeyhole, LockKeyholeOpen, Plus } from "lucide-react";
import { MAX_PLAN_LAYERS } from "@/lib/cad/validation";
import type { CadLayer } from "@/lib/cad/types";

type Props = {
  layers: CadLayer[];
  activeLayerId: string;
  onActivate: (id: string) => void;
  onChange: (layer: CadLayer) => void;
  onAdd: () => void;
};

export function CadLayers({ layers, activeLayerId, onActivate, onChange, onAdd }: Props) {
  return (
    <details open className="cad-panel cad-layers" aria-labelledby="cad-layers-title">
      <summary className="cad-panel-heading"><h2 id="cad-layers-title"><Layers size={15} aria-hidden="true" />Calques</h2></summary><button type="button" className="cad-panel-button cad-add-layer" disabled={layers.length >= MAX_PLAN_LAYERS} onClick={onAdd} aria-label="Ajouter un calque" title="Ajouter un calque"><Plus size={16} aria-hidden="true" />Ajouter un calque</button>
      <p className="cad-panel-intro">Le calque actif reçoit vos nouveaux tracés.</p>
      <ul className="cad-layer-list">
        {layers.map((layer) => (
          <li key={layer.id} className={`cad-layer${activeLayerId === layer.id ? " is-active" : ""}${!layer.visible ? " is-hidden" : ""}`}>
            <button type="button" className="cad-layer-activate" aria-label={`Activer le calque ${layer.name}`} aria-pressed={activeLayerId === layer.id} onClick={() => onActivate(layer.id)} title={`Dessiner sur ${layer.name}`}><span style={{ backgroundColor: layer.color }} /></button>
            <input key={layer.name} className="cad-layer-name" aria-label={`Nom du calque ${layer.name}`} defaultValue={layer.name} maxLength={80} onBlur={(event) => {
              const name = event.currentTarget.value.trim();
              if (name && name !== layer.name) onChange({ ...layer, name });
              else event.currentTarget.value = layer.name;
            }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
            <button type="button" className="cad-icon-button" aria-label={`${layer.visible ? "Masquer" : "Afficher"} le calque ${layer.name}`} title={layer.visible ? "Masquer le calque" : "Afficher le calque"} aria-pressed={layer.visible} onClick={() => onChange({ ...layer, visible: !layer.visible })}>{layer.visible ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}</button>
            <button type="button" className="cad-icon-button" aria-label={`${layer.locked ? "Déverrouiller" : "Verrouiller"} le calque ${layer.name}`} title={layer.locked ? "Déverrouiller le calque" : "Verrouiller le calque"} aria-pressed={layer.locked} onClick={() => onChange({ ...layer, locked: !layer.locked })}>{layer.locked ? <LockKeyhole size={14} aria-hidden="true" /> : <LockKeyholeOpen size={14} aria-hidden="true" />}</button>
            <label className="cad-layer-color" title={`Couleur de ${layer.name}`}><span>Couleur de {layer.name}</span><input key={layer.color} type="color" defaultValue={layer.color} aria-label={`Couleur du calque ${layer.name}`} onBlur={(event) => { if (event.currentTarget.value !== layer.color) onChange({ ...layer, color: event.currentTarget.value }); }} /></label>
          </li>
        ))}
      </ul>
      <p className="cad-panel-footnote"><LockKeyhole size={11} aria-hidden="true" />Un calque verrouillé protège ses objets.</p>
    </details>
  );
}
