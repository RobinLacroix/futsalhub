import type { DrillPitch } from './types';

/**
 * Port direct de `geo()` dans `render-core.js` (web) — même constantes
 * (TARGET/M), même formule. `TARGET` normalise la longueur du terrain à une
 * largeur de viewBox fixe quelle que soit la config (40m, 34m…), `M` est la
 * marge autour du terrain à l'intérieur du viewBox.
 */
const TARGET = 660;
const MARGIN = 38;

export interface PitchGeo {
  /** mètres → unités viewBox */
  sc: number;
  /** x en mètres → unité viewBox X */
  px: (x: number) => number;
  /** y en mètres (0 = ligne de but gauche) → unité viewBox Y (axe Y inversé, comme le SVG web) */
  py: (y: number) => number;
  /** largeur/hauteur du viewBox */
  W: number;
  H: number;
}

export function geo(pitch: DrillPitch): PitchGeo {
  const sc = TARGET / pitch.length;
  return {
    sc,
    px: (x: number) => MARGIN + x * sc,
    py: (y: number) => MARGIN + (pitch.width - y) * sc,
    W: pitch.length * sc + MARGIN * 2,
    H: pitch.width * sc + MARGIN * 2,
  };
}

/** Inverse de px()/py() : unités viewBox → mètres. Nécessaire côté natif pour convertir un geste écran (converti en viewBox) en coordonnées terrain. */
export function metersFromViewBox(g: PitchGeo, vx: number, vy: number, pitchWidth: number): { x: number; y: number } {
  return { x: (vx - MARGIN) / g.sc, y: pitchWidth - (vy - MARGIN) / g.sc };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
