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
  location?: string;
  /** Un des 4 thèmes : Offensif, Défensif, Transition, Supériorité */
  theme: 'Offensif' | 'Défensif' | 'Transition' | 'Supériorité';
  /** Principe clé (optionnel) */
  key_principle?: string;
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
      location: (input.location ?? '').trim() || null,
      theme: input.theme,
      key_principle: (input.key_principle ?? '').trim() || null,
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

export interface UpdateTrainingInput {
  date?: Date;
  location?: string;
  theme?: 'Offensif' | 'Défensif' | 'Transition' | 'Supériorité';
  key_principle?: string;
}

export async function updateTraining(trainingId: string, input: UpdateTrainingInput): Promise<Training> {
  const updateData: Record<string, unknown> = {};
  if (input.date != null) updateData.date = input.date.toISOString();
  if (input.location !== undefined) updateData.location = (input.location ?? '').trim() || null;
  if (input.theme != null) updateData.theme = input.theme;
  if (input.key_principle !== undefined) updateData.key_principle = (input.key_principle ?? '').trim() || null;
  const { data, error } = await supabase
    .from('trainings')
    .update(updateData)
    .eq('id', trainingId)
    .select()
    .single();
  if (error) throw error;
  return data as Training;
}

export async function updateTrainingAttendance(
  trainingId: string,
  attendance: Record<string, PlayerStatus>,
  convokedPlayerIds?: string[]
): Promise<Training> {
  const updateData: { attendance: Record<string, PlayerStatus>; convoked_players?: { id: string }[] } = {
    attendance,
  };
  if (convokedPlayerIds !== undefined) {
    updateData.convoked_players = convokedPlayerIds.map((id) => ({ id }));
  }
  const { data, error } = await supabase
    .from('trainings')
    .update(updateData)
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
