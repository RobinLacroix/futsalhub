// Types pour l'outil de schémas tactiques

export type ToolType = 
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'player'
  | 'ball'
  | 'goal'
  | 'cone'
  | 'ladder';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface Position {
  x: number;
  y: number;
}

export interface BaseElement {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  color: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  fillColor?: string;
  fillOpacity?: number;
  rotation?: number;
  isLocked?: boolean; // Si true, l'élément est verrouillé et reste à la même position dans toutes les séquences
}

export interface ZoneElement extends BaseElement {
  type: 'rectangle' | 'circle';
  width: number;
  height: number;
}

export interface LineElement extends BaseElement {
  type: 'line' | 'arrow';
  endX: number;
  endY: number;
  isCurved?: boolean;
  controlPoint?: Position; // Point de contrôle pour la courbe
  startPlayerId?: string; // ID du joueur associé au début de la ligne
  endPlayerId?: string; // ID du joueur associé à la fin de la ligne
}

export interface PlayerElement extends BaseElement {
  type: 'player';
  number: string;
  size: number;
  textColor?: string; // Couleur du texte/numéro
}

export interface BallElement extends BaseElement {
  type: 'ball';
  size: number;
}

export interface MaterialElement extends BaseElement {
  type: 'goal' | 'cone' | 'ladder';
  size: number;
}

export type SchematicElement = ZoneElement | LineElement | PlayerElement | BallElement | MaterialElement;

export type FieldType = 'futsal' | 'blank';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  elementId: string | null;
}

