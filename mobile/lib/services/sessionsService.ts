import { supabase } from '../supabase';

/**
 * Miroir mobile de lib/services/sessionsService.ts (web) — meme table
 * training_sessions, meme format, scope club (pas equipe). Cf
 * PLAN_SEANCE_BIBLIOTHEQUE_MOBILE_2026-09.md §5.
 */

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

export async function getSessionsByClub(clubId: string): Promise<TrainingSessionRecord[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('club_id', clubId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSessionById(id: string): Promise<TrainingSessionRecord | null> {
  const { data, error } = await supabase.from('training_sessions').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function saveSession(payload: {
  id?: string | null;
  clubId: string;
  name: string;
  meta: SessionMeta;
  blocks: SessionBlock[];
}): Promise<TrainingSessionRecord> {
  if (payload.id) {
    const { data, error } = await supabase
      .from('training_sessions')
      .update({ name: payload.name, meta: payload.meta, blocks: payload.blocks, updated_at: new Date().toISOString() })
      .eq('id', payload.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('training_sessions')
    .insert({ club_id: payload.clubId, name: payload.name, meta: payload.meta, blocks: payload.blocks })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('training_sessions').delete().eq('id', id);
  if (error) throw error;
}
