import { supabase } from '../supabaseClient';

const TOKEN_VALIDITY_DAYS = 7;

/**
 * Crée ou met à jour les tokens de feedback pour les joueurs présents ou en retard.
 * À appeler après création ou mise à jour d'un entraînement.
 */
export async function createTokensForTraining(
  trainingId: string,
  attendance: Record<string, string>
): Promise<void> {
  const playerIds = Object.entries(attendance)
    .filter(([, status]) => status === 'present' || status === 'late')
    .map(([playerId]) => playerId);

  if (playerIds.length === 0) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TOKEN_VALIDITY_DAYS);

  const rows = playerIds.map(playerId => ({
    training_id: trainingId,
    player_id: playerId,
    token: crypto.randomUUID(),
    expires_at: expiresAt.toISOString(),
    used_at: null
  }));

  const { error } = await supabase
    .from('training_feedback_tokens')
    .upsert(rows, {
      onConflict: 'training_id,player_id',
      ignoreDuplicates: false
    });

  if (error) throw error;
}

/**
 * Envoie les questionnaires pour une séance (RPC : crée les tokens pour présents/retard).
 * À appeler en fin de séance par le coach.
 */
export async function sendQuestionnairesForTraining(trainingId: string): Promise<{ ok: boolean; count?: number; error?: string }> {
  const { data, error } = await supabase.rpc('create_feedback_tokens_for_training', {
    p_training_id: trainingId
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; count?: number; error?: string } | null;
  if (r?.ok) return { ok: true, count: r.count };
  return { ok: false, error: (r?.error as string) || 'Erreur' };
}

/**
 * Récupère les infos d'une séance par token (pour la page questionnaire).
 * Utilise l'RPC qui peut être appelée sans auth.
 */
export async function getFeedbackSessionByToken(token: string): Promise<{
  training_id: string;
  player_id: string;
  training_date: string;
  theme: string | null;
  player_name: string | null;
} | { error: string } | null> {
  const { data, error } = await supabase.rpc('get_feedback_session_by_token', {
    p_token: token
  });

  if (error) {
    console.error('get_feedback_session_by_token', error);
    return null;
  }
  if (data == null) return null;
  if (typeof data === 'object' && 'error' in data) return data as { error: string };
  return data as {
    training_id: string;
    player_id: string;
    training_date: string;
    theme: string | null;
    player_name: string | null;
  };
}

/**
 * Soumet le questionnaire de feedback (appelable sans auth avec le token).
 */
export async function submitTrainingFeedback(
  token: string,
  values: { auto_evaluation: number; rpe: number; physical_form: number; pleasure: number }
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('submit_training_feedback', {
    p_token: token,
    p_auto_evaluation: values.auto_evaluation,
    p_rpe: values.rpe,
    p_physical_form: values.physical_form,
    p_pleasure: values.pleasure
  });

  if (error) {
    console.error('submit_training_feedback', error);
    return { success: false, error: error.message };
  }
  const result = data as { success: boolean; error?: string };
  return result;
}

/**
 * Liste les liens de feedback pour un entraînement (pour le coach).
 */
export async function getFeedbackLinksForTraining(
  trainingId: string
): Promise<{ player_id: string; player_name: string; token: string; url: string }[]> {
  const { data, error } = await supabase
    .from('training_feedback_tokens')
    .select(`
      token,
      player_id,
      players!inner ( first_name, last_name )
    `)
    .eq('training_id', trainingId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString());

  if (error) throw error;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return (data || []).map((row: any) => ({
    player_id: row.player_id,
    player_name: [row.players?.first_name, row.players?.last_name].filter(Boolean).join(' ') || 'Joueur',
    token: row.token,
    url: `${baseUrl}/feedback/session/${row.token}`
  }));
}

export interface PlayerTrainingFeedbackRow {
  training_id: string;
  date: string;
  auto_evaluation: number | null;
  rpe: number | null;
  physical_form: number | null;
  pleasure: number | null;
}

/**
 * Récupère l'historique des feedbacks d'entraînement pour un joueur (pour le graphique évolutif).
 */
export async function getPlayerTrainingFeedback(playerId: string): Promise<PlayerTrainingFeedbackRow[]> {
  const { data, error } = await supabase
    .from('training_player_feedback')
    .select(`
      training_id,
      auto_evaluation,
      rpe,
      physical_form,
      pleasure,
      trainings!inner ( date )
    `)
    .eq('player_id', playerId);

  if (error) throw error;

  const rows = (data || []).map((row: any) => ({
    training_id: row.training_id,
    date: row.trainings?.date ?? row.training_id,
    auto_evaluation: row.auto_evaluation ?? null,
    rpe: row.rpe ?? null,
    physical_form: row.physical_form ?? null,
    pleasure: row.pleasure ?? null
  }));

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return rows;
}
