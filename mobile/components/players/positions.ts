/**
 * Postes de futsal — catalogue unique (P0-7)
 *
 * Le poste est une **catégorie**, pas un jugement : sa teinte vient donc de
 * `chartSeries`, la rampe catégorielle du thème, jamais de `positive` /
 * `negative` / `warning`.
 *
 * Avant, chaque écran redéfinissait sa propre table. `squad/index.tsx` donnait
 * ambre au Gardien, bleu à l'Ailier, vert au Meneur et orange au Pivot, en
 * valeurs figées sur fond clair ; `PlayerDetailView` en avait une autre. Deux
 * conséquences : un même joueur changeait de couleur de poste d'un écran à
 * l'autre, et le vert du Meneur laissait entendre « bon poste ».
 *
 * L'ordre est tactique et non alphabétique — Gardien, Meneur, Ailier, Pivot —
 * parce que c'est l'ordre dans lequel un coach lit une feuille de match.
 */

import type { ThemeColors } from '../../lib/design/tokens';

export type PositionKey = 'Gardien' | 'Meneur' | 'Ailier' | 'Pivot';

export interface PositionMeta {
  key: PositionKey;
  label: string;
  /** Abréviation de tableau, 2 à 3 lettres. */
  abbr: string;
  /** Index dans `chartSeries`. */
  seriesIndex: number;
}

/** Ordre tactique, celui d'une feuille de match. */
export const POSITIONS: readonly PositionMeta[] = [
  { key: 'Gardien', label: 'Gardien', abbr: 'GB', seriesIndex: 2 },
  { key: 'Meneur', label: 'Meneur', abbr: 'MEN', seriesIndex: 0 },
  { key: 'Ailier', label: 'Ailier', abbr: 'AIL', seriesIndex: 4 },
  { key: 'Pivot', label: 'Pivot', abbr: 'PIV', seriesIndex: 5 },
] as const;

const UNKNOWN_RANK = 99;

/** Rang tactique, pour trier. Les postes inconnus vont en fin de liste. */
export function positionRank(position?: string | null): number {
  if (!position) return UNKNOWN_RANK;
  const i = POSITIONS.findIndex((p) => position.toLowerCase().startsWith(p.key.toLowerCase()));
  return i === -1 ? UNKNOWN_RANK - 1 : i;
}

export function positionMeta(position?: string | null): PositionMeta | null {
  if (!position) return null;
  return POSITIONS.find((p) => position.toLowerCase().startsWith(p.key.toLowerCase())) ?? null;
}

/**
 * Pied fort — vocabulaire unique.
 *
 * `new-player` écrivait « Droit et gauche » et la modale d'édition « Les deux »
 * pour la même chose : le même joueur changeait de valeur en base selon l'écran
 * par lequel on passait, et aucun regroupement n'était fiable. La valeur
 * stockée est celle de `new-player`, qui est la plus ancienne et donc la plus
 * représentée dans les données existantes ; seul le libellé est raccourci.
 */
export const STRONG_FOOT_OPTIONS = [
  { value: 'Droit', label: 'Droit' },
  { value: 'Gauche', label: 'Gauche' },
  { value: 'Droit et gauche', label: 'Les deux' },
] as const;

export type StrongFoot = (typeof STRONG_FOOT_OPTIONS)[number]['value'];

/** Statuts d'un joueur dans l'effectif. `left` sort de l'effectif actif. */
export const PLAYER_STATUS_OPTIONS = [
  { value: 'Actif', label: 'Actif' },
  { value: 'Blessé', label: 'Blessé' },
  { value: 'Suspendu', label: 'Suspendu' },
  { value: 'left', label: 'Parti' },
] as const;

export interface PositionStyle {
  abbr: string;
  label: string;
  color: string;
}

/** Teinte et abréviation d'un poste, résolues sur le thème courant. */
export function positionStyle(position: string | null | undefined, c: ThemeColors): PositionStyle {
  const meta = positionMeta(position);
  if (!meta) {
    return {
      abbr: position ? position.slice(0, 3).toUpperCase() : '—',
      label: position || 'Poste non renseigné',
      color: c.neutralData,
    };
  }
  return {
    abbr: meta.abbr,
    label: meta.label,
    color: c.chartSeries[meta.seriesIndex] ?? c.neutralData,
  };
}
