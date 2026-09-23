import type { TrainingGame } from '../services/trainingGames';

export interface SquadStanding {
  squadId: string;
  label: string;
  colorIndex: number;
  wins: number;
  draws: number;
  losses: number;
  /** Écart de score cumulé (+/-) — départage à égalité de victoires, jamais le critère de tri principal (cf. design doc §1 : gagné/nul/perdu reste comparable même entre jeux d'unités différentes, l'écart brut ne l'est pas forcément). */
  diff: number;
  /** Cumul brut des scores — informatif uniquement, jamais utilisé pour trier. */
  points: number;
}

/** Un plateau minimal, suffisant pour le classement — satisfait à la fois `TrainingSquad` (DB) et le snapshot local allégé. */
export interface SquadLike {
  id: string;
  label: string;
  color_token: string;
}

/** Classement des plateaux d'une séance : gagné/nul/perdu prime, l'écart départage. N'agrège que les jeux clos (`ended_at`). */
export function computeSquadStandings(squads: SquadLike[], games: TrainingGame[]): SquadStanding[] {
  const map = new Map<string, SquadStanding>();
  for (const sq of squads) {
    map.set(sq.id, { squadId: sq.id, label: sq.label, colorIndex: Number(sq.color_token) || 0, wins: 0, draws: 0, losses: 0, diff: 0, points: 0 });
  }
  for (const g of games) {
    if (!g.ended_at) continue;
    const home = map.get(g.home_squad_id);
    const away = map.get(g.away_squad_id);
    if (home) {
      home.points += g.score_home;
      home.diff += g.score_home - g.score_away;
    }
    if (away) {
      away.points += g.score_away;
      away.diff += g.score_away - g.score_home;
    }
    if (g.score_home === g.score_away) {
      if (home) home.draws += 1;
      if (away) away.draws += 1;
    } else if (g.score_home > g.score_away) {
      if (home) home.wins += 1;
      if (away) away.losses += 1;
    } else {
      if (away) away.wins += 1;
      if (home) home.losses += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.points - a.points);
}
