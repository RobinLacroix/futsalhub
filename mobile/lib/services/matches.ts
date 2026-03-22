import { supabase } from '../supabase';
import type { Match, MatchPlayer } from '../../types';

export async function getMatchesByTeam(teamId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('team_id', teamId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Liste légère pour le calendrier (sans players JSONB). Réduit fortement le payload. */
export async function getMatchesForCalendar(teamId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, date, title, location, competition, score_team, score_opponent, team_id')
    .eq('team_id', teamId)
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
  if (error) return null;
  return data;
}

export type GoalsByType = Record<'offensive' | 'transition' | 'cpa' | 'superiority', number>;

export interface UpdateMatchInput {
  convoquedPlayerIds?: string[];
  score_team?: number;
  score_opponent?: number;
  playerStats?: Record<string, { goals: number; yellow_cards: number; red_cards: number; time_played?: number }>;
  goals_by_type?: GoalsByType;
  conceded_by_type?: GoalsByType;
}

export async function deleteMatch(matchId: string): Promise<void> {
  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) throw error;
}

export async function updateMatch(matchId: string, input: UpdateMatchInput): Promise<Match> {
  const updateData: Record<string, unknown> = {};
  if (input.score_team !== undefined) updateData.score_team = input.score_team;
  if (input.score_opponent !== undefined) updateData.score_opponent = input.score_opponent;
  if (input.goals_by_type !== undefined) updateData.goals_by_type = input.goals_by_type;
  if (input.conceded_by_type !== undefined) updateData.conceded_by_type = input.conceded_by_type;

  if (input.convoquedPlayerIds !== undefined) {
    const stats = input.playerStats ?? {};
    updateData.players = toPlayersArray(input.convoquedPlayerIds, stats);
  } else if (input.playerStats !== undefined) {
    const { data: current } = await supabase.from('matches').select('players').eq('id', matchId).single();
    const raw = current?.players;
    let list: { id: string }[] = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === 'string') try { list = JSON.parse(raw); } catch { /* noop */ }
    const ids = list.map((p: { id: string }) => p.id);
    updateData.players = toPlayersArray(ids, input.playerStats);
  }

  const { data, error } = await supabase
    .from('matches')
    .update(updateData)
    .eq('id', matchId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
