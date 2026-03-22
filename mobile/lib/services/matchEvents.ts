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

export interface CreateMatchEventInput {
  match_id: string;
  event_type: MatchEventType;
  match_time_seconds: number;
  half: 1 | 2;
  player_id?: string | null;
  players_on_field: string[];
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
