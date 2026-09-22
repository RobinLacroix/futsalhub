/**
 * Format `drill` — identique à celui utilisé par l'éditeur vanilla JS
 * (`public/tools/tactics/render-core.js`/`editor.js`, web). Ne PAS réinventer
 * un format mobile : le même JSON doit s'ouvrir dans les deux éditeurs.
 *
 * Tranche 1 (cf PLAN_TACTIQUE_NATIF_MOBILE_TRANCHE1_2026-09.md) : seuls
 * `pitch` et `keyframes[].entities` sont vraiment typés/édités ici. Tout le
 * reste (zones, traits, textes, pulses, variantes au-delà de la première,
 * règles, mode avancé) est du passthrough opaque — chargé et réécrit tel
 * quel, jamais lu ni muté, pour ne jamais faire perdre à un schéma existant
 * ce que cette tranche ne gère pas encore.
 */

export interface DrillPitch {
  length: number;
  width: number;
  markings?: 'full' | 'minimal' | string;
  color?: string;
  outerColor?: string;
  lineColor?: string;
  goalAreaColor?: string;
  goalAreaOpacity?: number;
  view?: 'full' | 'half-left' | 'half-right';
  /** Champs non gérés tranche 1 (image de fond, logo, motif de surface…). */
  [key: string]: unknown;
}

export type EntityTeam = 'home' | 'away' | 'support' | 'none' | 'neutral';

/** `type` couvre aussi les clés de matériel (EQUIP côté vanilla JS) — hors tranche 1, jamais produit ici. */
export interface DrillEntity {
  id: string;
  type: 'player' | 'support' | 'ball' | 'goal' | 'cone' | string;
  team: EntityTeam;
  x: number;
  y: number;
  label?: string;
  role?: string;
  color?: string;
  size?: number;
  shape?: 'circle' | 'square' | 'triangle' | 'diamond' | 'body';
  facing?: number;
  attachedTo?: string;
  /** curve/arrowWidth/aerial/vision/bib… : posés par d'autres tranches, préservés tels quels. */
  [key: string]: unknown;
}

/**
 * Zone (tranche 2) : `drill.zones`, au niveau du drill (pas par étape,
 * contrairement aux traits/textes/pulses). Création mobile limitée au
 * rectangle (shape "rect") — ellipse et polygone restent lisibles/réécrits
 * tels quels si déjà présents (créés côté web), mais pas créables ici cette
 * tranche (écart assumé, cf conversation — pas de dessin libre au doigt).
 */
export interface DrillZone {
  id: string;
  kind: 'area' | 'target' | 'corridor' | 'neutral';
  shape: 'rect' | 'ellipse' | 'polygon';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  pts?: Array<{ x: number; y: number }>;
  label?: string;
  color?: string;
  stroke?: 'solid' | 'dash';
  strokeWidth?: number;
  fill?: 'solid' | 'hatch' | 'none';
  fillOpacity?: number;
  [key: string]: unknown;
}

/**
 * Trait libre (tranche 2). Création mobile limitée au trait droit (`ctrls`
 * vide) — un trait courbé déjà créé côté web reste affiché/déplaçable tel
 * quel (les points de courbure suivent le trait), mais pas éditable/ajoutable
 * ici cette tranche.
 */
export interface DrillLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  width?: number;
  dash?: boolean;
  aerial?: boolean;
  head?: 'none' | 'arrow' | 'bar';
  ctrls?: Array<{ x: number; y: number }>;
  [key: string]: unknown;
}

export interface DrillText {
  id: string;
  x: number;
  y: number;
  text: string;
  color?: string;
  size?: number;
  outline?: boolean;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  [key: string]: unknown;
}

export interface DrillPulse {
  id: string;
  x: number;
  y: number;
  color?: string;
  size?: number;
  [key: string]: unknown;
}

export interface DrillKeyframe {
  label: string;
  durationMs: number;
  entities: DrillEntity[];
  /** Flèches : dérivées automatiquement des déplacements entre étapes côté web — jamais éditées à la main, passthrough. */
  annotations: unknown[];
  lines: DrillLine[];
  texts: DrillText[];
  pulses: DrillPulse[];
}

export interface DrillTeamStyle {
  name?: string;
  fill?: string;
  stroke?: string;
  text?: string;
  size?: number;
  shape?: string;
}

export interface DrillVariant {
  id: string;
  name: string;
  /** Type large : seule keyframes[0] de la variante active est éditée ici, le reste (timeline avancée, etc.) est opaque. */
  keyframes: unknown;
}

export interface Drill {
  meta: Record<string, unknown>;
  pitch: DrillPitch;
  zones: DrillZone[];
  keyframes: DrillKeyframe[];
  variants: DrillVariant[];
  activeVariantIndex: number;
  teams?: Partial<Record<'home' | 'away' | 'support', DrillTeamStyle>>;
  rules: Record<string, unknown>;
  [key: string]: unknown;
}

/** Même structure que `defaultDrill()` dans `editor.js` — un schéma vide, prêt à positionner. */
export function emptyDrill(): Drill {
  const keyframes: DrillKeyframe[] = [
    { label: 'Dispositif', durationMs: 1500, entities: [], annotations: [], lines: [], texts: [], pulses: [] },
  ];
  return {
    meta: { category: 'entrainement', title: '', theme: '' },
    pitch: { length: 40, width: 20, markings: 'full' },
    zones: [],
    keyframes,
    variants: [{ id: 'var-1', name: 'Variante 1', keyframes }],
    activeVariantIndex: 0,
    rules: {},
  };
}
