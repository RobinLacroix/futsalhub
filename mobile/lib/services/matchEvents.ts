import { supabase } from '../supabase';
import type { MatchEvent, MatchEventType } from '../../types';

export async function getEventsByMatchId(matchId: string): Promise<MatchEvent[]> {
  const { data, error } = await supabase
    .from('match_events')
    .select('*')
    .eq('match_id', matchId)
    .order('match_time_seconds', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MatchEvent[];
}

export type GoalType = 'offensive' | 'transition' | 'cpa' | 'superiority';

export interface CreateMatchEventInput {
  match_id: string;
  event_type: MatchEventType;
  match_time_seconds: number;
  half: 1 | 2;
  player_id?: string | null;
  players_on_field: string[];
  goal_type?: GoalType | null;
}

export async function createMatchEvent(input: CreateMatchEventInput): Promise<MatchEvent> {
  const playersOnField = input.players_on_field ?? [];
  const { data, error } = await supabase.rpc('insert_match_event', {
    p_match_id: input.match_id,
    p_event_type: input.event_type,
    p_match_time_seconds: input.match_time_seconds,
    p_half: input.half,
    p_player_id: input.player_id ?? null,
    p_players_on_field: playersOnField,
    p_location_x: null,
    p_location_y: null,
    p_goal_type: input.goal_type ?? null,
  });
  if (error) {
    const errMsg = typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message?: string; details?: string }).message
      : String(error);
    const errDetails = typeof error === 'object' && error !== null && 'details' in error
      ? (error as { details?: string }).details
      : '';
    throw new Error(errDetails ? `${errMsg} (${errDetails})` : errMsg);
  }
  return data as MatchEvent;
}

/** Agrège goals_by_type et conceded_by_type à partir des événements. */
export async function getGoalsByTypeForMatches(
  matchIds: string[]
): Promise<Record<string, { goals_by_type: Record<string, number>; conceded_by_type: Record<string, number> }>> {
  if (matchIds.length === 0) return {};
  const { data, error } = await supabase
    .from('match_events')
    .select('match_id, event_type, goal_type')
    .in('match_id', matchIds)
    .in('event_type', ['goal', 'opponent_goal']);
  if (error) throw error;
  const types = ['offensive', 'transition', 'cpa', 'superiority'] as const;
  const result: Record<string, { goals_by_type: Record<string, number>; conceded_by_type: Record<string, number> }> = {};
  for (const id of matchIds) {
    result[id] = {
      goals_by_type: { offensive: 0, transition: 0, cpa: 0, superiority: 0 },
      conceded_by_type: { offensive: 0, transition: 0, cpa: 0, superiority: 0 },
    };
  }
  for (const row of data ?? []) {
    const m = row as { match_id: string; event_type: string; goal_type?: string | null };
    const key = m.goal_type && types.includes(m.goal_type as any) ? m.goal_type : 'offensive';
    if (m.event_type === 'goal') {
      result[m.match_id].goals_by_type[key]++;
    } else if (m.event_type === 'opponent_goal') {
      result[m.match_id].conceded_by_type[key]++;
    }
  }
  return result;
}

export async function hasMatchEvents(matchId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('match_events')
    .select('*', { count: 'exact', head: true })
    .eq('match_id', matchId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export interface MatchEventsAggregateRow {
  player_id: string;
  goals: number;
  yellow_cards: number;
  red_cards: number;
}

export async function getMatchEventsAggregate(matchId: string): Promise<MatchEventsAggregateRow[]> {
  const events = await getEventsByMatchId(matchId);
  const byPlayer = new Map<string, { goals: number; yellow_cards: number; red_cards: number }>();
  events.forEach((ev) => {
    if (!ev.player_id) return;
    const cur = byPlayer.get(ev.player_id) ?? { goals: 0, yellow_cards: 0, red_cards: 0 };
    if (ev.event_type === 'goal') cur.goals++;
    if (ev.event_type === 'yellow_card') cur.yellow_cards++;
    if (ev.event_type === 'red_card') cur.red_cards++;
    byPlayer.set(ev.player_id, cur);
  });
  return Array.from(byPlayer.entries()).map(([player_id, v]) => ({
    player_id,
    goals: v.goals,
    yellow_cards: v.yellow_cards,
    red_cards: v.red_cards,
  }));
}
