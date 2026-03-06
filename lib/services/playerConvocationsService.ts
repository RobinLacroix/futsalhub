import { supabase } from '../supabaseClient';

export interface MyConvolutionRow {
  training_id: string;
  training_date: string;
  location: string | null;
  theme: string | null;
  team_name: string | null;
  my_status: string | null;
  feedback_token: string | null;
  feedback_url: string | null;
}

export interface MyPendingFeedbackRow {
  training_id: string;
  training_date: string;
  theme: string | null;
  token: string;
  url: string;
}

/**
 * Liste des convocations (entraînements à venir) pour le joueur connecté.
 */
export async function getMyConvocations(): Promise<MyConvolutionRow[]> {
  const { data, error } = await supabase.rpc('get_my_convocations');
  if (error) throw error;
  return (data || []).map((row: any) => ({
    training_id: row.training_id,
    training_date: row.training_date,
    location: row.location ?? null,
    theme: row.theme ?? null,
    team_name: row.team_name ?? null,
    my_status: row.my_status ?? null,
    feedback_token: row.feedback_token ?? null,
    feedback_url: row.feedback_url ?? null
  }));
}

/**
 * Met à jour la présence du joueur connecté pour un entraînement (présent / absent / en retard).
 */
export async function setMyTrainingAttendance(
  trainingId: string,
  status: 'present' | 'absent' | 'late'
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('set_my_training_attendance', {
    p_training_id: trainingId,
    p_status: status
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string } | null;
  if (result?.ok) return { ok: true };
  return { ok: false, error: result?.error || 'Erreur inconnue' };
}

/**
 * Liste des questionnaires en attente pour le joueur connecté.
 */
export async function getMyPendingFeedbackTokens(): Promise<MyPendingFeedbackRow[]> {
  const { data, error } = await supabase.rpc('get_my_pending_feedback_tokens');
  if (error) throw error;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return (data || []).map((row: any) => ({
    training_id: row.training_id,
    training_date: row.training_date,
    theme: row.theme ?? null,
    token: row.token,
    url: baseUrl + (row.url || `/feedback/session/${row.token}`)
  }));
}

/**
 * Crée un code de liaison pour qu'un joueur puisse lier son compte (côté coach).
 */
export async function createPlayerLinkCode(playerId: string): Promise<{
  ok: boolean;
  code?: string;
  expires_at?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('create_player_link_code', {
    p_player_id: playerId
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; code?: string; expires_at?: string; error?: string } | null;
  if (result?.ok && result?.code) return { ok: true, code: result.code, expires_at: result.expires_at };
  return { ok: false, error: result?.error ?? 'Erreur inconnue' };
}

/**
 * Lie le compte utilisateur connecté au joueur correspondant au code (côté joueur).
 */
export async function claimPlayerLinkCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('claim_player_link_code', { p_code: code });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string } | null;
  if (result?.ok) return { ok: true };
  return { ok: false, error: result?.error ?? 'Erreur inconnue' };
}
