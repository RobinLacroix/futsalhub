import { supabase } from '../supabase';
import type { Match, MatchPlayer } from '../../types';
import { rememberMatchFromServer, getCachedMatch } from '../offline/matchCache';
import { enqueueMatchUpdate } from '../offline/matchRecorderOutbox';
import { isDeviceOffline, shouldTreatAsOfflineError } from '../offline/networkReachability';
import { buildRemoteMatchUpdatePayload, applyUpdateMatchLocal } from './matchesWritePayload';
import type { UpdateMatchInput } from './matchUpdateTypes';

export type { GoalsByType, UpdateMatchInput } from './matchUpdateTypes';

/** @param season si fourni, ne renvoie que les matchs de cette saison ("YYYY-YYYY"). */
export async function getMatchesByTeam(teamId: string, season?: string): Promise<Match[]> {
  let query = supabase
    .from('matches')
    .select('*')
    .eq('team_id', teamId);
  if (season) query = query.eq('season', season);
  const { data, error } = await query.order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Liste légère pour le calendrier (sans players JSONB). Réduit fortement le payload.
 * @param season si fourni, ne renvoie que les matchs de cette saison ("YYYY-YYYY").
 */
export async function getMatchesForCalendar(teamId: string, season?: string): Promise<Match[]> {
  let query = supabase
    .from('matches')
    .select('id, date, title, location, competition, score_team, score_opponent, team_id')
    .eq('team_id', teamId);
  if (season) query = query.eq('season', season);
  const { data, error } = await query
    .order('date', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export interface CreateMatchInput {
  title: string;
  date: Date;
  location: string;
  competition: string;
  convoquedPlayerIds: string[];
  score_team: number;
  score_opponent: number;
  opponent_team?: string;
  /** Optionnel : buts / cartons / temps de jeu par joueur (sinon 0 pour tous). */
  playerStats?: Record<string, { goals: number; yellow_cards: number; red_cards: number; time_played?: number }>;
}

function toPlayersArray(
  convoquedIds: string[],
  stats?: Record<string, { goals: number; yellow_cards: number; red_cards: number; time_played?: number }>
): MatchPlayer[] {
  return convoquedIds.map((id) => ({
    id,
    goals: stats?.[id]?.goals ?? 0,
    yellow_cards: stats?.[id]?.yellow_cards ?? 0,
    red_cards: stats?.[id]?.red_cards ?? 0,
    time_played: stats?.[id]?.time_played ?? 0,
  }));
}

export async function createMatch(teamId: string, input: CreateMatchInput): Promise<Match> {
  const playersArray = toPlayersArray(input.convoquedPlayerIds, input.playerStats);
  const { data, error } = await supabase
    .from('matches')
    .insert({
      team_id: teamId,
      title: input.title.trim(),
      date: input.date.toISOString(),
      location: input.location.trim(),
      competition: input.competition.trim(),
      score_team: input.score_team,
      score_opponent: input.score_opponent,
      opponent_team: input.opponent_team?.trim() || null,
      players: playersArray,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMatchById(matchId: string): Promise<Match | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();
  if (!error && data) {
    await rememberMatchFromServer(data as Match);
    return data as Match;
  }
  return getCachedMatch(matchId);
}

export async function deleteMatch(matchId: string): Promise<void> {
  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) throw error;
}

export async function updateMatch(matchId: string, input: UpdateMatchInput): Promise<Match> {
  const offlineFallback = async (cause?: unknown): Promise<Match> => {
    await enqueueMatchUpdate(matchId, input);
    const base = await getCachedMatch(matchId);
    if (!base) {
      if (cause instanceof Error) throw cause;
      throw new Error(
        'Hors ligne : aucune copie locale du match. Ouvrez ce match une fois avec Internet pour l’enregistrer ensuite hors ligne.'
      );
    }
    const merged = applyUpdateMatchLocal(base, input);
    await rememberMatchFromServer(merged);
    return merged;
  };

  if (await isDeviceOffline()) {
    return offlineFallback();
  }

  try {
    const updateData = await buildRemoteMatchUpdatePayload(matchId, input);
    const { data, error } = await supabase
      .from('matches')
      .update(updateData)
      .eq('id', matchId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    const m = data as Match;
    await rememberMatchFromServer(m);
    return m;
  } catch (e) {
    if (shouldTreatAsOfflineError(e)) {
      return offlineFallback(e);
    }
    throw e;
  }
}
