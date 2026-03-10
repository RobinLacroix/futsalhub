import { supabase } from '../supabase';
import type { Training, PlayerStatus } from '../../types';

export async function getTrainingsByTeam(teamId: string): Promise<Training[]> {
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .eq('team_id', teamId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface CreateTrainingInput {
  date: Date;
  location: string;
  /** Un des 4 thèmes : Offensif, Défensif, Transition, Supériorité */
  theme: 'Offensif' | 'Défensif' | 'Transition' | 'Supériorité';
  /** Principe clé (obligatoire en base) */
  key_principle: string;
  /** Ids des joueurs convoqués (seuls eux verront la séance dans leur calendrier). */
  convoked_player_ids: string[];
}

export async function createTraining(teamId: string, input: CreateTrainingInput): Promise<Training> {
  const convoked_players = input.convoked_player_ids.map((id) => ({ id }));
  const { data, error } = await supabase
    .from('trainings')
    .insert({
      team_id: teamId,
      date: input.date.toISOString(),
      location: input.location.trim() || null,
      theme: input.theme,
      key_principle: input.key_principle.trim(),
      attendance: {},
      convoked_players,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getTrainingById(trainingId: string): Promise<Training | null> {
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .eq('id', trainingId)
    .single();
  if (error) return null;
  return data;
}

export async function deleteTraining(trainingId: string): Promise<void> {
  const { error } = await supabase.from('trainings').delete().eq('id', trainingId);
  if (error) throw error;
}

export async function updateTrainingAttendance(
  trainingId: string,
  attendance: Record<string, PlayerStatus>
): Promise<Training> {
  const { data, error } = await supabase
    .from('trainings')
    .update({ attendance })
    .eq('id', trainingId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Crée les tokens questionnaire pour les joueurs présents/retard (en fin de séance). */
export async function sendQuestionnairesForTraining(trainingId: string): Promise<{ ok: boolean; count?: number; error?: string }> {
  const { data, error } = await supabase.rpc('create_feedback_tokens_for_training', {
    p_training_id: trainingId,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; count?: number; error?: string } | null;
  if (r?.ok) return { ok: true, count: r.count };
  return { ok: false, error: (r?.error as string) || 'Erreur' };
}
