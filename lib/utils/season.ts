// Utilitaires saison — règle juillet → juin, format "YYYY-YYYY".
// Doit rester aligné avec futsal_season_for_date() côté DB (migration
// 20260708100000_matches_trainings_season.sql) : bascule au 1er juillet.

/** Saison "YYYY-YYYY" à laquelle appartient une date donnée. */
export function seasonForDate(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-indexed, juillet = 6
  return m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** Saison courante (basée sur la date du jour). */
export function currentSeason(): string {
  return seasonForDate(new Date());
}

/** Saison suivante : "2025-2026" -> "2026-2027". */
export function nextSeason(season: string): string {
  const [a, b] = season.split('-').map(Number);
  return `${a + 1}-${b + 1}`;
}

/** Saison précédente : "2025-2026" -> "2024-2025". */
export function prevSeason(season: string): string {
  const [a, b] = season.split('-').map(Number);
  return `${a - 1}-${b - 1}`;
}
