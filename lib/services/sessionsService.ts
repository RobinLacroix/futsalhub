import { supabase } from '../supabaseClient';

export interface SessionMeta {
  theme?: string;
  phaseCible?: string;
  objectif?: string;
  effectif?: string;
  dureeTotaleMin?: number;
  intensite?: string;
  philosophyTags?: string[];
}

export interface SessionBlock {
  id: string;
  type: 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu';
  duration: number;
  procedureId: string | null;
  intentionPedagogique: string;
}

export interface TrainingSessionRecord {
  id: string;
  club_id: string;
  created_by: string | null;
  name: string;
  meta: SessionMeta;
  blocks: SessionBlock[];
  created_at: string;
  updated_at: string;
}

export const sessionsService = {
  /**
   * Récupère les séances du club (bibliothèque partagée, cf.
   * SPEC_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md — portée club, pas équipe).
   */
  async getSessionsByClub(clubId: string): Promise<TrainingSessionRecord[]> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('club_id', clubId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupère une séance par son ID.
   */
  async getSessionById(id: string): Promise<TrainingSessionRecord | null> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Crée ou met à jour une séance.
   */
  async saveSession(payload: {
    id?: string | null;
    clubId: string;
    name: string;
    meta: SessionMeta;
    blocks: SessionBlock[];
  }): Promise<TrainingSessionRecord> {
    if (payload.id) {
      const { data, error } = await supabase
        .from('training_sessions')
        .update({
          name: payload.name,
          meta: payload.meta,
          blocks: payload.blocks,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('training_sessions')
        .insert({
          club_id: payload.clubId,
          name: payload.name,
          meta: payload.meta,
          blocks: payload.blocks,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  /**
   * Supprime une séance.
   */
  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase
      .from('training_sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};
