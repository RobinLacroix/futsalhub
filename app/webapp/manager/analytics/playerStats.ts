/**
 * Statistiques joueur — miroir exact de mobile/components/analytics/playerStats.ts
 * Logique pure, aucune dépendance de plateforme : copie fidèle.
 */

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
  avgRating: number | null;
};

export type MetricKey =
  | 'goals'
  | 'assist'
  | 'plusMinusGoals'
  | 'plusMinusShots'
  | 'shot_on_target'
  | 'totalShots'
  | 'recovery'
  | 'ball_loss'
  | 'cards';

export interface MetricDef {
  key: MetricKey;
  short: string;
  long: string;
  higherIsBetter: boolean;
  normalizable: boolean;
}

export const METRICS: readonly MetricDef[] = [
  { key: 'goals',          short: 'B',    long: 'Buts',            higherIsBetter: true,  normalizable: true },
  { key: 'assist',         short: 'PD',   long: 'Passes déc.',     higherIsBetter: true,  normalizable: true },
  { key: 'plusMinusGoals', short: '+/-',  long: '+/- buts',        higherIsBetter: true,  normalizable: false },
  { key: 'plusMinusShots', short: '+/-T', long: '+/- tirs',        higherIsBetter: true,  normalizable: false },
  { key: 'shot_on_target', short: 'TC',   long: 'Tirs cadrés',     higherIsBetter: true,  normalizable: true },
  { key: 'totalShots',     short: 'TT',   long: 'Tirs totaux',     higherIsBetter: true,  normalizable: true },
  { key: 'recovery',       short: 'Réc',  long: 'Récupérations',   higherIsBetter: true,  normalizable: true },
  { key: 'ball_loss',      short: 'Prt',  long: 'Pertes de balle', higherIsBetter: false, normalizable: true },
  { key: 'cards',          short: 'Cart', long: 'Cartons',         higherIsBetter: false, normalizable: false },
] as const;

export const NORMALIZE_WINDOW_SECONDS = 20 * 60;

export function rawMetric(row: PlayerStats, key: MetricKey): number {
  switch (key) {
    case 'totalShots': return row.shot + row.shot_on_target;
    case 'cards':      return row.yellow_cards + row.red_cards;
    default:           return row[key] ?? 0;
  }
}

const MIN_TIME_FOR_NORMALIZATION = 5 * 60;

export function normalizedMetric(row: PlayerStats, key: MetricKey): number | null {
  const def = METRICS.find((m) => m.key === key);
  if (!def?.normalizable) return null;
  if (row.totalTimeSeconds < MIN_TIME_FOR_NORMALIZATION) return null;
  return (rawMetric(row, key) * NORMALIZE_WINDOW_SECONDS) / row.totalTimeSeconds;
}

export interface MetricBenchmark {
  min: number;
  max: number;
  mean: number;
}

export type Benchmarks = Record<MetricKey, MetricBenchmark>;

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

export function deltaToMean(
  value: number,
  bench: MetricBenchmark,
  higherIsBetter: boolean,
): number {
  const raw = value - bench.mean;
  return higherIsBetter ? raw : -raw;
}

export function abbrevName(full: string): string {
  const parts = full.trim().split(' ');
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtMetric(value: number | null, normalized: boolean, key: MetricKey): string {
  if (value == null) return '—';
  if (normalized) return value.toFixed(1);
  if (key === 'plusMinusGoals' || key === 'plusMinusShots') return value > 0 ? `+${value}` : String(value);
  return String(Math.round(value));
}

export type SortKey = MetricKey | 'playerName' | 'matchesPlayed' | 'totalTimeSeconds' | 'avgRating';

export interface SortOption {
  key: SortKey;
  label: string;
}

export const SORT_OPTIONS: readonly SortOption[] = [
  { key: 'avgRating',        label: 'Note data' },
  { key: 'goals',            label: 'Buts' },
  { key: 'assist',           label: 'Passes décisives' },
  { key: 'plusMinusGoals',   label: '+/- buts' },
  { key: 'plusMinusShots',   label: '+/- tirs' },
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
