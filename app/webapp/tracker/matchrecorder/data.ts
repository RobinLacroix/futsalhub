import { supabase } from '@/lib/supabaseClient';

/**
 * Insère un événement de match via la RPC Postgres (validation + sync compteurs côté serveur).
 */
export async function insertMatchEvent(params: {
  match_id: string;
  event_type: string;
  match_time_seconds: number;
  half: number;
  player_id: string | null;
  players_on_field: string[];
}) {
  const { data, error } = await supabase.rpc('insert_match_event', {
    p_match_id: params.match_id,
    p_event_type: params.event_type,
    p_match_time_seconds: params.match_time_seconds,
    p_half: params.half,
    p_player_id: params.player_id,
    p_players_on_field: params.players_on_field,
  });
  return { data, error };
}
