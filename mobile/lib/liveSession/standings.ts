import type { TrainingGame, TrainingGameSquad } from '../services/trainingGames';

export interface SquadStanding {
  squadId: string;
  label: string;
  colorIndex: number;
  wins: number;
  draws: number;
  losses: number;
  /** Écart de score cumulé (+/-) — départage à égalité de victoires, jamais le critère de tri principal (cf. design doc §1 : gagné/nul/perdu reste comparable même entre jeux d'unités différentes, l'écart brut ne l'est pas forcément). Pour un jeu à N équipes : score de l'équipe moins la moyenne des autres. */
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

/**
 * Classement des plateaux d'une séance (ou d'un sous-ensemble de jeux, ex:
 * filtré par procédé) : gagné/nul/perdu prime, l'écart départage. N'agrège
 * que les jeux clos (`ended_at`).
 *
 * Généralisé aux jeux à N équipes (pas seulement 2) : dans un jeu donné, la ou
 * les équipes au score maximum gagnent (une seule = victoire, plusieurs à
 * égalité = nul pour chacune), les autres perdent — pas de distinction entre
 * "2e" et "dernier" sur un jeu à 3+, seul le meilleur score compte. L'écart
 * d'une équipe sur un jeu = son score moins la moyenne des autres équipes de
 * ce même jeu (se réduit exactement à l'ancien calcul quand N=2).
 */
export function computeSquadStandings(squads: SquadLike[], games: TrainingGame[], gameSquads: TrainingGameSquad[]): SquadStanding[] {
  const map = new Map<string, SquadStanding>();
  for (const sq of squads) {
    map.set(sq.id, { squadId: sq.id, label: sq.label, colorIndex: Number(sq.color_token) || 0, wins: 0, draws: 0, losses: 0, diff: 0, points: 0 });
  }

  const finishedGameIds = new Set(games.filter((g) => g.ended_at).map((g) => g.id));
  const byGame = new Map<string, TrainingGameSquad[]>();
  for (const gs of gameSquads) {
    if (!finishedGameIds.has(gs.game_id)) continue;
    const list = byGame.get(gs.game_id);
    if (list) list.push(gs);
    else byGame.set(gs.game_id, [gs]);
  }

  for (const participants of byGame.values()) {
    if (participants.length < 2) continue;
    const maxScore = Math.max(...participants.map((p) => p.score));
    const winners = participants.filter((p) => p.score === maxScore);

    for (const p of participants) {
      const entry = map.get(p.squad_id);
      if (!entry) continue;
      entry.points += p.score;
      const others = participants.filter((o) => o.squad_id !== p.squad_id);
      const othersAvg = others.reduce((sum, o) => sum + o.score, 0) / others.length;
      entry.diff += p.score - othersAvg;

      if (winners.length > 1 && p.score === maxScore) entry.draws += 1;
      else if (p.score === maxScore) entry.wins += 1;
      else entry.losses += 1;
    }
  }

  for (const entry of map.values()) entry.diff = Math.round(entry.diff * 10) / 10;

  return Array.from(map.values()).sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.points - a.points);
}
