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

/** Date ISO 'YYYY-MM-DD' locale du jour. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Bornes calendaires d'une saison "YYYY-YYYY" : 1er juillet -> 30 juin.
 *
 * `to` s'arrête à aujourd'hui si la saison est en cours — sans ça, une saison
 * qui vient de commencer demanderait des données jusqu'à un 30 juin encore à
 * venir, ce qui ne change rien au résultat (aucune séance future) mais rend
 * l'intention de la borne plus lisible pour qui relit l'appel RPC.
 */
export function seasonDateRange(season: string): { from: string; to: string } {
  const [start] = season.split('-').map(Number);
  const from = `${start}-07-01`;
  const seasonEnd = `${start + 1}-06-30`;
  const today = todayIso();
  return { from, to: today < seasonEnd ? today : seasonEnd };
}
