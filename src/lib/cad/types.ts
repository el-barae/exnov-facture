/** All geometry is stored in metres; the drawing uses a downward-positive Y axis. */
export type Point = { x: number; y: number };
export type EntityType = "line" | "wall" | "rectangle" | "circle" | "dimension" | "text" | "door" | "window" | "symbol" | "room";
export type CadTool = "select" | "pan" | EntityType;
export type SymbolId = "bed" | "sofa" | "table" | "sink" | "toilet" | "stairs" | "north";
export type CadPrimitive =
  | { kind: "polyline"; points: Point[]; closed?: boolean; fill?: boolean }
  | { kind: "circle"; center: Point; radius: number }
  | { kind: "text"; point: Point; text: string; size: number; centered?: boolean };
export type CadEntity = {
  id: string;
  type: EntityType;
  layerId: string;
  start: Point;
  end: Point;
  text?: string;
  thickness?: number;
  fontSize?: number;
  /** Opening centre along a host wall (0..1), with a width in metres. */
  wallAttachment?: { wallId: string; t: number; width: number };
  /** Dimensions attached to a complete wall use a perpendicular offset in metres. */
  wallId?: string;
  offset?: number;
  /** Room outline, without a repeated closing point. */
  points?: Point[];
  symbolId?: SymbolId;
  rotation?: number;
  swing?: 1 | -1;
};
export type CadLayer = { id: string; name: string; color: string; visible: boolean; locked: boolean };
export type CadPlan = { version: 1; id: string; name: string; updatedAt: string; layers: CadLayer[]; entities: CadEntity[] };
export type CadView = { x: number; y: number; scale: number };
export const GRID_STEP = 0.1;
export const DEFAULT_VIEW: CadView = { x: 80, y: 80, scale: 50 };
export const TOOL_LABELS: Record<CadTool, string> = { select: "Sélection", pan: "Déplacer la vue", wall: "Mur", line: "Ligne", rectangle: "Rectangle", circle: "Cercle", dimension: "Cote", text: "Texte", door: "Porte", window: "Fenêtre", symbol: "Symbole", room: "Pièce" };
