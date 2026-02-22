import { supabase } from '../supabaseClient';
import type { PlayerEvent, PlayerEventType } from '@/types';

export const playerEventsService = {
  async getByPlayerId(playerId: string): Promise<PlayerEvent[]> {
    const { data, error } = await supabase
      .from('player_events')
      .select('*')
      .eq('player_id', playerId)
      .order('event_date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async create(event: Omit<PlayerEvent, 'id' | 'created_at' | 'updated_at'>): Promise<PlayerEvent> {
    const { data, error } = await supabase
      .from('player_events')
      .insert({
        player_id: event.player_id,
        event_type: event.event_type,
        event_date: event.event_date,
        report: event.report ?? null,
        injury_type: event.injury_type ?? null,
        unavailability_days: event.unavailability_days ?? null,
        matches_suspended: event.matches_suspended ?? null
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('player_events')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
