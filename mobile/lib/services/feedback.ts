import { supabase } from '../supabase';

// ─── Team-level batch feedback (for dashboard heatmap) ───────────────────────

export interface TeamFeedbackRow {
  training_id: string;
  player_id: string;
  date: string;
  auto_evaluation: number | null;
  rpe: number | null;
  physical_form: number | null;
  pleasure: number | null;
}

/**
 * Récupère les feedbacks de TOUS les joueurs pour les N dernières séances d'une équipe.
 * Utilisé par le dashboard pour la heatmap wellbeing collective.
 */
export async function getTeamFeedbackForLastSessions(
  teamId: string,
  sessionCount = 5
): Promise<TeamFeedbackRow[]> {
  const { data: trainings, error: tErr } = await supabase
    .from('trainings')
    .select('id, date')
    .eq('team_id', teamId)
    .order('date', { ascending: false })
    .limit(sessionCount);

  if (tErr || !trainings?.length) return [];

  const trainingIds = (trainings as { id: string; date: string }[]).map((t) => t.id);
  const dateById = Object.fromEntries(
    (trainings as { id: string; date: string }[]).map((t) => [t.id, t.date])
  );

  const { data, error } = await supabase
    .from('training_player_feedback')
    .select('training_id, player_id, auto_evaluation, rpe, physical_form, pleasure')
    .in('training_id', trainingIds);

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    training_id: row.training_id,
    player_id:   row.player_id,
    date:        dateById[row.training_id] ?? '',
    auto_evaluation: row.auto_evaluation ?? null,
    rpe:             row.rpe             ?? null,
    physical_form:   row.physical_form   ?? null,
    pleasure:        row.pleasure        ?? null,
  }));
}

// ─── Per-player feedback (for player detail chart) ───────────────────────────

export interface PlayerFeedbackRow {
  training_id: string;
  date: string;           // ISO string
  auto_evaluation: number | null;
  rpe: number | null;
  physical_form: number | null;
  pleasure: number | null;
}

/**
 * Récupère l'historique des réponses aux questionnaires d'un joueur,
 * triées du plus ancien au plus récent.
 */
export async function getPlayerFeedbackHistory(playerId: string): Promise<PlayerFeedbackRow[]> {
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

  const rows = ((data ?? []) as any[]).map((row) => ({
    training_id:     row.training_id,
    date:            row.trainings?.date ?? row.training_id,
    auto_evaluation: row.auto_evaluation ?? null,
    rpe:             row.rpe ?? null,
    physical_form:   row.physical_form ?? null,
    pleasure:        row.pleasure ?? null,
  }));

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return rows;
}

/**
 * Historique des feedbacks du joueur connecté.
 * Utilise un RPC SECURITY DEFINER car la RLS de training_player_feedback
 * ne couvre que les coaches (has_club_access), pas les joueurs eux-mêmes.
 */
export async function getMyOwnFeedbackHistory(): Promise<PlayerFeedbackRow[]> {
  const { data, error } = await supabase.rpc('get_my_feedback_history');
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    training_id:     row.training_id,
    date:            row.date ?? '',
    auto_evaluation: row.auto_evaluation ?? null,
    rpe:             row.rpe ?? null,
    physical_form:   row.physical_form ?? null,
    pleasure:        row.pleasure ?? null,
  }));
}
