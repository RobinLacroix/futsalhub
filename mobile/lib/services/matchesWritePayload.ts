import { supabase } from '../supabase';
import type { Match, MatchPlayer } from '../../types';
import type { UpdateMatchInput } from './matchUpdateTypes';

function toPlayersArray(
  convoquedIds: string[],
  stats?: Record<string, { goals: number; yellow_cards: number; red_cards: number; time_played?: number }>,
  existingPlayers?: MatchPlayer[]
): MatchPlayer[] {
  const existingById = new Map((existingPlayers ?? []).map((p) => [p.id, p]));
  return convoquedIds.map((id) => ({
    id,
    goals: stats?.[id]?.goals ?? 0,
    yellow_cards: stats?.[id]?.yellow_cards ?? 0,
    red_cards: stats?.[id]?.red_cards ?? 0,
    // Préserver le temps de jeu existant (match recorder) si non fourni explicitement
    time_played: stats?.[id]?.time_played ?? existingById.get(id)?.time_played ?? 0,
  }));
}

/** Payload `.update()` pour la table matches — même logique que `updateMatch` en ligne. */
export async function buildRemoteMatchUpdatePayload(
  matchId: string,
  input: UpdateMatchInput
): Promise<Record<string, unknown>> {
  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title.trim();
  if (input.date !== undefined) updateData.date = input.date;
  if (input.score_team !== undefined) updateData.score_team = input.score_team;
  if (input.score_opponent !== undefined) updateData.score_opponent = input.score_opponent;
  if (input.fouls_team !== undefined) updateData.fouls_team = input.fouls_team;
  if (input.fouls_opponent !== undefined) updateData.fouls_opponent = input.fouls_opponent;
  if (input.goals_by_type !== undefined) updateData.goals_by_type = input.goals_by_type;
  if (input.conceded_by_type !== undefined) updateData.conceded_by_type = input.conceded_by_type;

  if (input.convoquedPlayerIds !== undefined || input.playerStats !== undefined) {
    // Toujours charger les players existants pour préserver time_played (match recorder)
    const { data: current } = await supabase.from('matches').select('players').eq('id', matchId).single();
    const raw = current?.players;
    let existingPlayers: MatchPlayer[] = [];
    if (Array.isArray(raw)) existingPlayers = raw as MatchPlayer[];
    else if (typeof raw === 'string') {
      try { existingPlayers = JSON.parse(raw); } catch { /* noop */ }
    }

    if (input.convoquedPlayerIds !== undefined) {
      const stats = input.playerStats ?? {};
      updateData.players = toPlayersArray(input.convoquedPlayerIds, stats, existingPlayers);
    } else {
      const ids = existingPlayers.map((p) => p.id);
      updateData.players = toPlayersArray(ids, input.playerStats, existingPlayers);
    }
  }

  return updateData;
}

/** Fusion locale pour affichage / cache après mise en file `updateMatch` hors ligne. */
export function applyUpdateMatchLocal(base: Match, input: UpdateMatchInput): Match {
  const next: Match = { ...base };
  if (input.title !== undefined) next.title = input.title.trim();
  if (input.date !== undefined) next.date = input.date;
  if (input.score_team !== undefined) next.score_team = input.score_team;
  if (input.score_opponent !== undefined) next.score_opponent = input.score_opponent;
  if (input.fouls_team !== undefined) next.fouls_team = input.fouls_team;
  if (input.fouls_opponent !== undefined) next.fouls_opponent = input.fouls_opponent;
  if (input.goals_by_type !== undefined) next.goals_by_type = input.goals_by_type;
  if (input.conceded_by_type !== undefined) next.conceded_by_type = input.conceded_by_type;

  if (input.convoquedPlayerIds !== undefined || input.playerStats !== undefined) {
    const raw = base.players;
    let existingPlayers: MatchPlayer[] = [];
    if (Array.isArray(raw)) existingPlayers = raw as MatchPlayer[];
    else if (typeof raw === 'string') {
      try { existingPlayers = JSON.parse(raw); } catch { /* noop */ }
    }

    if (input.convoquedPlayerIds !== undefined) {
      const stats = input.playerStats ?? {};
      next.players = toPlayersArray(input.convoquedPlayerIds, stats, existingPlayers);
    } else {
      const ids = existingPlayers.map((p) => p.id);
      next.players = toPlayersArray(ids, input.playerStats, existingPlayers);
    }
  }

  return next;
}
