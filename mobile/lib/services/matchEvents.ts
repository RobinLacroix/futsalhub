/**
 * Agrège les événements match_events (goal, yellow_card, red_card) par joueur
 * pour pré-remplir les stats si le match a été enregistré via le match recorder.
 */
import { supabase } from '../supabase';

export interface MatchEventAggregate {
  player_id: string;
  goals: number;
  yellow_cards: number;
  red_cards: number;
}

export async function getMatchEventsAggregate(matchId: string): Promise<MatchEventAggregate[]> {
  const { data, error } = await supabase
    .from('match_events')
    .select('event_type, player_id')
    .eq('match_id', matchId)
    .in('event_type', ['goal', 'yellow_card', 'red_card']);

  if (error) throw error;

  const byPlayer = new Map<string, { goals: number; yellow_cards: number; red_cards: number }>();

  (data ?? []).forEach((row: { event_type: string; player_id: string | null }) => {
    if (!row.player_id) return;
    let entry = byPlayer.get(row.player_id);
    if (!entry) {
      entry = { goals: 0, yellow_cards: 0, red_cards: 0 };
      byPlayer.set(row.player_id, entry);
    }
    if (row.event_type === 'goal') entry.goals += 1;
    else if (row.event_type === 'yellow_card') entry.yellow_cards += 1;
    else if (row.event_type === 'red_card') entry.red_cards += 1;
  });

  return Array.from(byPlayer.entries()).map(([player_id, s]) => ({
    player_id,
    goals: s.goals,
    yellow_cards: s.yellow_cards,
    red_cards: s.red_cards,
  }));
}

export async function hasMatchEvents(matchId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('match_events')
    .select('*', { count: 'exact', head: true })
    .eq('match_id', matchId);
  if (error) return false;
  return (count ?? 0) > 0;
}
