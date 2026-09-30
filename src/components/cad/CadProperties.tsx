"use client";

import { LockKeyhole, MousePointer2, Ruler, SlidersHorizontal } from "lucide-react";
import { moveEntity, roomArea, SYMBOLS } from "@/lib/cad/architecture";
import { TOOL_LABELS, type CadEntity, type CadPlan } from "@/lib/cad/types";

type Props = {
  entity: CadEntity | null;
  plan: CadPlan;
  onChange: (entity: CadEntity) => void;
  onDimensionWall: (id: string) => void;
  thickness: number;
  onThicknessChange: (value: number) => void;
  text: string;
  onTextChange: (value: string) => void;
};

type NumberFieldProps = { label: string; value: number; onCommit: (value: number) => void; min?: number; max?: number; unit?: string };

export function NumberField({ label, value, onCommit, min = -100000, max = 100000, unit = "m" }: NumberFieldProps) {
  return <label className="cad-field"><span>{label}</span><div className="cad-number-input"><input key={value} type="number" defaultValue={Number(value.toFixed(4))} step="any" min={min} max={max} aria-label={label} onBlur={(event) => {
    const input = event.currentTarget;
    const next = input.valueAsNumber;
    // Rejected dependent geometry must not leave a stale draft in the inspector.
    input.value = String(Number(value.toFixed(4)));
    if (Number.isFinite(next) && next >= min && next <= max && next !== Number(value.toFixed(4)) && next !== value) onCommit(next);
  }} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { event.currentTarget.value = String(Number(value.toFixed(4))); event.currentTarget.blur(); }
  }} /><span>{unit}</span></div></label>;
}

const format = (number: number) => number.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

export function CadProperties({ entity, plan, onChange, onDimensionWall, thickness, onThicknessChange, text, onTextChange }: Props) {
  const layers = plan.layers;
  const layer = entity ? layers.find((item) => item.id === entity.layerId) : undefined;
  const length = entity ? Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y) : 0;
  const attached = entity?.wallAttachment;
  const linked = entity?.type === "dimension" && !!entity.wallId;
  const updatePoint = (point: "start" | "end", axis: "x" | "y", value: number) => {
    if (!entity) return;
    if (["circle", "symbol", "room"].includes(entity.type) && point === "start") {
      onChange(moveEntity(plan, entity, { x: axis === "x" ? value - entity.start.x : 0, y: axis === "y" ? value - entity.start.y : 0 }));
    } else onChange({ ...entity, [point]: { ...entity[point], [axis]: value } });
  };
  return (
    <details open className="cad-panel cad-properties" aria-labelledby="cad-properties-title">
      <summary className="cad-panel-heading"><h2 id="cad-properties-title"><SlidersHorizontal size={15} aria-hidden="true" />Propriétés</h2><span className="cad-unit-badge">MÈTRES</span></summary>
      {entity ? <>
        <div className="cad-selection-heading"><strong>{TOOL_LABELS[entity.type]}</strong><span>{layer?.name ?? "Calque"}</span></div>
        {layer?.locked && <p className="cad-locked-note"><LockKeyhole size={13} aria-hidden="true" />Déverrouillez le calque pour modifier cet objet.</p>}
        <fieldset disabled={layer?.locked || !layer?.visible} className="cad-property-fields" aria-label={`Propriétés : ${TOOL_LABELS[entity.type]}`}>
          <label className="cad-field"><span>Calque</span><select value={entity.layerId} onChange={(event) => onChange({ ...entity, layerId: event.target.value })}>{layers.map((item) => <option key={item.id} value={item.id} disabled={(item.locked || !item.visible) && item.id !== entity.layerId}>{item.name}{item.locked ? " · verrouillé" : !item.visible ? " · masqué" : ""}</option>)}</select></label>
          {attached ? <>
            <p className="cad-related-note">Ouverture liée au mur : sa position suit les déplacements du mur.</p>
            <NumberField label="Largeur de l’ouverture" value={attached.width} min={0.01} onCommit={(width) => onChange({ ...entity, wallAttachment: { ...attached, width } })}/>
            <NumberField label="Position sur le mur" value={attached.t * 100} min={0} max={100} unit="%" onCommit={(t) => onChange({ ...entity, wallAttachment: { ...attached, t: t / 100 } })}/>
            {entity.type === "door" && <button type="button" className="cad-panel-button" onClick={() => onChange({ ...entity, swing: entity.swing === -1 ? 1 : -1 })}>Inverser l’ouverture</button>}
          </> : linked ? <>
            <p className="cad-related-note">Cote liée au mur : longueur et position se mettent à jour automatiquement.</p>
            <NumberField label="Décalage de la cote" value={entity.offset ?? 0.6} onCommit={(offset) => onChange({ ...entity, offset })}/>
            <button type="button" className="cad-panel-button" onClick={() => onChange({ ...entity, wallId: undefined, offset: undefined })}>Détacher la cote</button>
          </> : <>
            <div className="cad-field-pair"><NumberField label={entity.type === "circle" ? "Centre X" : "Départ X"} value={entity.start.x} onCommit={(value) => updatePoint("start", "x", value)} /><NumberField label={entity.type === "circle" ? "Centre Y" : "Départ Y"} value={entity.start.y} onCommit={(value) => updatePoint("start", "y", value)} /></div>
            {!["text", "circle", "symbol", "room"].includes(entity.type) && <div className="cad-field-pair"><NumberField label="Arrivée X" value={entity.end.x} onCommit={(value) => updatePoint("end", "x", value)} /><NumberField label="Arrivée Y" value={entity.end.y} onCommit={(value) => updatePoint("end", "y", value)} /></div>}
          </>}
          {entity.type === "circle" && <NumberField label="Rayon" value={length} min={0.01} onCommit={(value) => {
            const angle = Math.atan2(entity.end.y - entity.start.y, entity.end.x - entity.start.x);
            onChange({ ...entity, end: { x: entity.start.x + Math.cos(angle) * value, y: entity.start.y + Math.sin(angle) * value } });
          }} />}
          {entity.type === "wall" && <>
            <NumberField label="Épaisseur du mur" value={entity.thickness ?? 0.2} min={0.001} max={100} onCommit={(value) => onChange({ ...entity, thickness: value })} />
            <button type="button" className="cad-panel-button" onClick={() => onDimensionWall(entity.id)}><Ruler size={15} aria-hidden="true"/>Coter ce mur</button>
          </>}
          {entity.type === "symbol" && <>
            <label className="cad-field"><span>Symbole</span><select aria-label="Type de symbole" value={entity.symbolId} onChange={(event) => onChange({ ...entity, symbolId: SYMBOLS.find(item => item.id === event.target.value)!.id })}>{SYMBOLS.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
            <div className="cad-field-pair"><NumberField label="Largeur du symbole" value={Math.abs(entity.end.x - entity.start.x)} min={0.01} onCommit={(width) => onChange({ ...entity, end: { ...entity.end, x: entity.start.x + width } })}/><NumberField label="Hauteur du symbole" value={Math.abs(entity.end.y - entity.start.y)} min={0.01} onCommit={(height) => onChange({ ...entity, end: { ...entity.end, y: entity.start.y + height } })}/></div>
            <NumberField label="Rotation" value={entity.rotation ?? 0} min={-360} max={360} unit="°" onCommit={(rotation) => onChange({ ...entity, rotation })}/>
          </>}
          {(entity.type === "text" || entity.type === "room") && <>
            <label className="cad-field"><span>{entity.type === "room" ? "Nom de la pièce" : "Texte"}</span><textarea aria-label={entity.type === "room" ? "Nom de la pièce" : "Texte"} key={`${entity.id}-${entity.text}`} defaultValue={entity.text ?? ""} rows={2} maxLength={2000} onBlur={(event) => {
              const nextText = event.currentTarget.value.trim();
              if (nextText && nextText !== entity.text) onChange({ ...entity, text: nextText });
              else event.currentTarget.value = entity.text ?? "";
            }} /></label>
            <NumberField label="Hauteur du texte" value={entity.fontSize ?? (entity.type === "room" ? 0.26 : 0.3)} min={0.01} max={50} onCommit={(value) => onChange({ ...entity, fontSize: value })} />
          </>}
          {entity.type === "room" && <details className="cad-vertices"><summary>Modifier les sommets ({entity.points?.length})</summary>{entity.points?.map((point, index) => <div className="cad-field-pair" key={index}><NumberField label={`Sommet ${index + 1} X`} value={point.x} onCommit={(x) => onChange({ ...entity, points: entity.points!.map((p, i) => i === index ? { ...p, x } : p) })}/><NumberField label={`Sommet ${index + 1} Y`} value={point.y} onCommit={(y) => onChange({ ...entity, points: entity.points!.map((p, i) => i === index ? { ...p, y } : p) })}/></div>)}</details>}
          {entity.type === "rectangle" && <button type="button" className="cad-panel-button" onClick={() => onChange({ ...entity, type: "room", text: "Pièce", points: [entity.start, { x: entity.end.x, y: entity.start.y }, entity.end, { x: entity.start.x, y: entity.end.y }] })}>Convertir en pièce</button>}
        </fieldset>
        {entity.type === "room" || entity.type === "rectangle" ? <div className="cad-measurement"><span>Surface {entity.type === "room" ? "de la pièce" : "du rectangle"}</span><strong>{format(entity.type === "room" ? roomArea(entity) : Math.abs((entity.end.x - entity.start.x) * (entity.end.y - entity.start.y)))} <small>m²</small></strong></div> : !["text", "symbol"].includes(entity.type) && <div className="cad-measurement"><span>{entity.type === "circle" ? "Diamètre" : "Longueur"}</span><strong>{format(entity.type === "circle" ? length * 2 : length)} <small>m</small></strong></div>}
      </> : <div className="cad-empty-selection"><MousePointer2 size={23} strokeWidth={1.4} aria-hidden="true" /><strong>Aucun objet sélectionné</strong><p>Avec l’outil Sélection, cliquez sur un tracé pour ajuster ses dimensions.</p></div>}
      <div className="cad-drawing-settings"><h3>Prochains tracés</h3><NumberField label="Épaisseur des murs" value={thickness} min={0.01} max={5} onCommit={onThicknessChange} /><label className="cad-field"><span>Texte ou nom de pièce à placer</span><input type="text" value={text} onChange={(event) => onTextChange(event.target.value)} maxLength={500} placeholder="Ex. : Salon" /></label></div>
    </details>
  );
}
