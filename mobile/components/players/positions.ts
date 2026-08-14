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

export const STRONG_FOOT_VALUES: readonly string[] = STRONG_FOOT_OPTIONS.map((o) => o.value);

/**
 * Orthographes rencontrées en base ou dans les fichiers importés.
 *
 * Il y en avait **quatre** émetteurs, jamais accordés : `new-player` mobile
 * (« Droit et gauche »), la modale d'édition mobile (« Les deux »), les écrans
 * web (« Ambidextre ») et les deux importeurs CSV (« Ambidextre » également,
 * alors qu'ils tournent dans la même application que `new-player`).
 *
 * Miroir de `lib/playerVocabulary.ts` côté web. Les deux tables doivent rester
 * identiques : `mobile/lib/importPlayers.ts` et `lib/importPlayers.ts` sont
 * déjà deux copies du même fichier, c'est exactement ainsi que la divergence
 * s'est installée.
 */
const STRONG_FOOT_ALIASES: Record<string, StrongFoot> = {
  droit: 'Droit',
  'pied droit': 'Droit',
  d: 'Droit',
  gauche: 'Gauche',
  'pied gauche': 'Gauche',
  g: 'Gauche',
  ambidextre: 'Droit et gauche',
  'les deux': 'Droit et gauche',
  'droit et gauche': 'Droit et gauche',
  'deux pieds': 'Droit et gauche',
};

/** Renvoie la valeur canonique, ou `null` si la saisie n'est pas reconnue. */
export function normalizeStrongFoot(raw: unknown): StrongFoot | null {
  if (typeof raw !== 'string') return null;
  return STRONG_FOOT_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** Libellé d'affichage d'une valeur stockée, y compris non normalisée. */
export function strongFootLabel(raw: unknown): string {
  const value = normalizeStrongFoot(raw);
  if (!value) return typeof raw === 'string' && raw.trim() ? raw : 'Pied non renseigné';
  return STRONG_FOOT_OPTIONS.find((o) => o.value === value)!.label;
}

/**
 * Statuts ADMINISTRATIFS d'un joueur dans l'effectif. `left` le sort de
 * l'effectif actif.
 *
 * « Blessé » et « Suspendu » ont été retirés le 2026-08-13 : la disponibilité
 * vit désormais dans `player_availability`, historisée, avec une date de retour
 * et une zone. Les garder ici créait deux vérités concurrentes — un joueur
 * pouvait être « Blessé » sur sa fiche et « disponible » sur l'écran de
 * convocation, sans que rien ne relie les deux.
 *
 * Ce sont aussi deux valeurs DESTRUCTRICES : `players.status` porte le statut de
 * mutation FFF, et marquer quelqu'un blessé l'écrasait définitivement.
 *
 * Pour changer la disponibilité : écran Performance, ou la fiche du joueur.
 *
 * /!\ Le web et le mobile n'écrivent toujours pas le même vocabulaire dans cette
 * colonne : ici « Actif », là-bas « Non-muté » / « Muté » / « Muté HP ». La
 * colonne n'a aucune contrainte CHECK, donc rien ne l'a jamais empêché. Dette
 * connue, à normaliser à part.
 */
export const PLAYER_STATUS_OPTIONS = [
  { value: 'Actif', label: 'Actif' },
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
