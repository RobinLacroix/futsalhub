/**
 * Statistiques joueur — modèle, métriques et mise en perspective (P0-3)
 *
 * Extrait de `AnalyticsView.tsx` (1 549 lignes) avant restylage, conformément à
 * la règle du Batch 2 : on décompose la portion touchée avant d'y toucher.
 *
 * Ce fichier ajoute ce qui manquait le plus au produit : le **référentiel**.
 * « 4 buts » est un comptage, pas une analyse. « 4 buts, +1,8 vs moyenne, 82e
 * centile de l'effectif, 2,1 par 20 minutes » en est une. Tout est calculé à
 * partir des données déjà présentes, rien à ajouter côté backend.
 */

/** Statistiques agrégées d'un joueur sur un ensemble de matchs filtrés. */
export type PlayerStats = {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  goals: number;
  shot_on_target: number;
  shot: number;
  ball_loss: number;
  recovery: number;
  assist: number;
  yellow_cards: number;
  red_cards: number;
  plusMinusGoals: number;
  plusMinusShots: number;
  totalTimeSeconds: number;
  /** Note data moyenne /10 sur les matchs filtrés. `null` si non calculée. */
  avgRating: number | null;
};

/** Clé d'une métrique comptable, dérivable de `PlayerStats`. */
export type MetricKey =
  | 'goals'
  | 'assist'
  | 'plusMinusGoals'
  | 'shot_on_target'
  | 'totalShots'
  | 'recovery'
  | 'ball_loss'
  | 'cards';

export interface MetricDef {
  key: MetricKey;
  /** Libellé court, pour un en-tête de colonne sur tablette. */
  short: string;
  /** Libellé complet, pour une carte sur téléphone. Plus de légende à décoder. */
  long: string;
  /** Une valeur haute est-elle une bonne nouvelle ? Pilote la couleur. */
  higherIsBetter: boolean;
  /** La métrique a-t-elle du sens ramenée au temps de jeu ? */
  normalizable: boolean;
}

/**
 * Les métriques du produit, dans l'ordre d'importance décroissante.
 * Source unique : la carte téléphone et le tableau tablette lisent la même liste,
 * donc elles ne peuvent plus diverger.
 */
export const METRICS: readonly MetricDef[] = [
  { key: 'goals',          short: 'B',    long: 'Buts',            higherIsBetter: true,  normalizable: true },
  { key: 'assist',         short: 'PD',   long: 'Passes déc.',     higherIsBetter: true,  normalizable: true },
  { key: 'plusMinusGoals', short: '+/-',  long: '+/- buts',        higherIsBetter: true,  normalizable: false },
  { key: 'shot_on_target', short: 'TC',   long: 'Tirs cadrés',     higherIsBetter: true,  normalizable: true },
  { key: 'totalShots',     short: 'TT',   long: 'Tirs totaux',     higherIsBetter: true,  normalizable: true },
  { key: 'recovery',       short: 'Réc',  long: 'Récupérations',   higherIsBetter: true,  normalizable: true },
  { key: 'ball_loss',      short: 'Prt',  long: 'Pertes de balle', higherIsBetter: false, normalizable: true },
  { key: 'cards',          short: 'Cart', long: 'Cartons',         higherIsBetter: false, normalizable: false },
] as const;

/** Durée de référence pour la normalisation, en secondes. */
export const NORMALIZE_WINDOW_SECONDS = 20 * 60;

/** Valeur brute d'une métrique pour un joueur. */
export function rawMetric(row: PlayerStats, key: MetricKey): number {
  switch (key) {
    case 'totalShots': return row.shot + row.shot_on_target;
    case 'cards':      return row.yellow_cards + row.red_cards;
    default:           return row[key] ?? 0;
  }
}

/**
 * Valeur ramenée à 20 minutes de jeu.
 *
 * En futsal les rotations sont permanentes : un pivot qui joue 8 minutes et
 * marque 1 but n'est pas comparable à un joueur qui en marque 2 en 35 minutes.
 * Les totaux bruts sont trompeurs, c'est la raison d'être de ce mode.
 *
 * Sous 5 minutes cumulées, on ne normalise pas : l'échantillon est trop petit et
 * la projection produirait des valeurs absurdes.
 */
const MIN_TIME_FOR_NORMALIZATION = 5 * 60;

export function normalizedMetric(row: PlayerStats, key: MetricKey): number | null {
  const def = METRICS.find((m) => m.key === key);
  if (!def?.normalizable) return null;
  if (row.totalTimeSeconds < MIN_TIME_FOR_NORMALIZATION) return null;
  return (rawMetric(row, key) * NORMALIZE_WINDOW_SECONDS) / row.totalTimeSeconds;
}

/** Repères d'une métrique sur l'ensemble de l'effectif filtré. */
export interface MetricBenchmark {
  min: number;
  max: number;
  mean: number;
}

export type Benchmarks = Record<MetricKey, MetricBenchmark>;

/** Calcule min / max / moyenne par métrique, base de toute mise en perspective. */
export function computeBenchmarks(rows: PlayerStats[], normalized: boolean): Benchmarks {
  const out = {} as Benchmarks;
  for (const def of METRICS) {
    const values = rows
      .map((r) => (normalized ? normalizedMetric(r, def.key) : rawMetric(r, def.key)))
      .filter((v): v is number => v != null);
    if (values.length === 0) {
      out[def.key] = { min: 0, max: 0, mean: 0 };
      continue;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    out[def.key] = { min, max, mean };
  }
  return out;
}

/**
 * Position d'une valeur sur l'amplitude de l'effectif, entre 0 et 1.
 * Alimente la barre de densité : le coach lit la position sans lire le chiffre.
 * Pour une métrique où bas vaut mieux (pertes de balle), l'échelle est inversée
 * afin qu'une barre pleine signifie toujours « bonne performance ».
 */
export function density(
  value: number,
  bench: MetricBenchmark,
  higherIsBetter: boolean,
): number {
  const span = bench.max - bench.min;
  if (span <= 0) return 0.5;
  const ratio = (value - bench.min) / span;
  return higherIsBetter ? ratio : 1 - ratio;
}

/**
 * Écart à la moyenne de l'effectif, orienté pour que positif signifie toujours
 * « meilleur que la moyenne », y compris sur les métriques à minimiser.
 */
export function deltaToMean(
  value: number,
  bench: MetricBenchmark,
  higherIsBetter: boolean,
): number {
  const raw = value - bench.mean;
  return higherIsBetter ? raw : -raw;
}

// ─── Formatage ───────────────────────────────────────────────────────────────

/** « Robin Lacroix » → « R. Lacroix ». */
export function abbrevName(full: string): string {
  const parts = full.trim().split(' ');
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

/** Secondes → « 12:40 ». */
export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Formate une valeur de métrique selon le mode d'affichage. */
export function fmtMetric(value: number | null, normalized: boolean, key: MetricKey): string {
  if (value == null) return '—';
  if (normalized) return value.toFixed(1);
  if (key === 'plusMinusGoals') return value > 0 ? `+${value}` : String(value);
  return String(Math.round(value));
}

// ─── Tri ─────────────────────────────────────────────────────────────────────

export type SortKey = MetricKey | 'playerName' | 'matchesPlayed' | 'totalTimeSeconds' | 'avgRating';

export interface SortOption {
  key: SortKey;
  label: string;
}

/** Options proposées dans le sélecteur de tri explicite. */
export const SORT_OPTIONS: readonly SortOption[] = [
  { key: 'avgRating',        label: 'Note data' },
  { key: 'goals',            label: 'Buts' },
  { key: 'assist',           label: 'Passes décisives' },
  { key: 'plusMinusGoals',   label: '+/- buts' },
  { key: 'recovery',         label: 'Récupérations' },
  { key: 'ball_loss',        label: 'Pertes de balle' },
  { key: 'totalTimeSeconds', label: 'Temps de jeu' },
  { key: 'matchesPlayed',    label: 'Matchs joués' },
  { key: 'playerName',       label: 'Nom' },
] as const;

function sortValue(row: PlayerStats, key: SortKey, normalized: boolean): number {
  if (key === 'avgRating') return row.avgRating ?? -1;
  if (key === 'matchesPlayed') return row.matchesPlayed;
  if (key === 'totalTimeSeconds') return row.totalTimeSeconds;
  if (key === 'playerName') return 0;
  const def = METRICS.find((m) => m.key === key);
  if (normalized && def?.normalizable) return normalizedMetric(row, key) ?? -1;
  return rawMetric(row, key);
}

export function sortRows(
  rows: PlayerStats[],
  key: SortKey,
  dir: 'asc' | 'desc',
  normalized: boolean,
): PlayerStats[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'playerName') return sign * a.playerName.localeCompare(b.playerName);
    return sign * (sortValue(a, key, normalized) - sortValue(b, key, normalized));
  });
}
