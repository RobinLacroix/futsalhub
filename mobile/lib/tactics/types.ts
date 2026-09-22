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

export interface DrillKeyframe {
  label: string;
  durationMs: number;
  entities: DrillEntity[];
  /** Traits/textes/pulses/flèches : passthrough, non édités tranche 1. */
  annotations: unknown[];
  lines: unknown[];
  texts: unknown[];
  pulses: unknown[];
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
  zones: unknown[];
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
