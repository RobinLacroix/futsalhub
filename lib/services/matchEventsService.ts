import { supabase } from '../supabaseClient';
import type { MatchEvent } from '@/types';

export const matchEventsService = {
  /**
   * Récupère tous les événements d'un match
   */
  async getEventsByMatch(matchId: string): Promise<MatchEvent[]> {
    const { data, error } = await supabase
      .from('match_events')
      .select('*')
      .eq('match_id', matchId)
      .order('match_time_seconds', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupère tous les événements d'une équipe
   */
  async getEventsByTeam(teamId: string): Promise<MatchEvent[]> {
    const { data, error } = await supabase
      .from('match_events')
      .select('*')
      .eq('team_id', teamId)
      .order('match_time_seconds', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Crée un nouvel événement de match
   */
  async createEvent(eventData: Omit<MatchEvent, 'id' | 'created_at'>): Promise<MatchEvent> {
    const { data, error } = await supabase
      .from('match_events')
      .insert(eventData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Crée plusieurs événements en batch
   */
  async createEvents(events: Omit<MatchEvent, 'id' | 'created_at'>[]): Promise<MatchEvent[]> {
    const { data, error } = await supabase
      .from('match_events')
      .insert(events)
      .select();

    if (error) throw error;
    return data || [];
  },

  /**
   * Met à jour un événement
   */
  async updateEvent(eventId: string, eventData: Partial<MatchEvent>): Promise<MatchEvent> {
    const { data, error } = await supabase
      .from('match_events')
      .update(eventData)
      .eq('id', eventId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Supprime un événement
   */
  async deleteEvent(eventId: string): Promise<void> {
    const { error } = await supabase
      .from('match_events')
      .delete()
      .eq('id', eventId);

    if (error) throw error;
  },

  /**
   * Supprime tous les événements d'un match
   */
  async deleteEventsByMatch(matchId: string): Promise<void> {
    const { error } = await supabase
      .from('match_events')
      .delete()
      .eq('match_id', matchId);

    if (error) throw error;
  }
};



