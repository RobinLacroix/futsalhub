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
  training_id: string | null;
  match_id: string | null;
  date: string;           // ISO string
  auto_evaluation: number | null;
  rpe: number | null;
  physical_form: number | null;
  pleasure: number | null;
}

/**
 * Récupère l'historique des réponses aux questionnaires (séance ET match)
 * d'un joueur, triées du plus ancien au plus récent. `training_id`/`match_id`
 * sont mutuellement exclusifs (contrainte CHECK) : on embed les deux
 * relations sans `!inner` pour ne perdre ni l'un ni l'autre.
 */
export async function getPlayerFeedbackHistory(playerId: string): Promise<PlayerFeedbackRow[]> {
  const { data, error } = await supabase
    .from('training_player_feedback')
    .select(`
      training_id,
      match_id,
      auto_evaluation,
      rpe,
      physical_form,
      pleasure,
      trainings ( date ),
      matches ( date )
    `)
    .eq('player_id', playerId);

  if (error) throw error;

  const rows = ((data ?? []) as any[]).map((row) => ({
    training_id:     row.training_id ?? null,
    match_id:        row.match_id ?? null,
    date:            row.trainings?.date ?? row.matches?.date ?? row.training_id ?? row.match_id,
    auto_evaluation: row.auto_evaluation ?? null,
    rpe:             row.rpe ?? null,
    physical_form:   row.physical_form ?? null,
    pleasure:        row.pleasure ?? null,
  }));

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return rows;
}

// ─── Réponses au questionnaire d'une séance (staff) ───────────────────────────

export interface TrainingFeedbackResponse {
  player_id: string;
  player_name: string;
  team_id: string | null;
  team_name: string | null;
  /** Joueur d'une autre équipe que celle de la séance (invité). */
  is_guest: boolean;
  auto_evaluation: number | null;
  rpe: number | null;
  physical_form: number | null;
  pleasure: number | null;
  submitted_at: string | null;
  comment: string | null;
}

/**
 * Réponses au questionnaire pour une séance, staff uniquement — inclut les joueurs
 * invités d'autres équipes (is_guest). Note : `comment` est rattaché par date de séance,
 * pas par un lien direct en base (player_events n'a pas de training_id) — fiable dans la
 * quasi-totalité des cas, peut manquer si un joueur a deux séances le même jour.
 */
export async function getTrainingFeedbackResponses(trainingId: string): Promise<TrainingFeedbackResponse[]> {
  const { data, error } = await supabase.rpc('get_training_feedback_responses', { p_training_id: trainingId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    player_id: row.player_id,
    player_name: row.player_name ?? 'Joueur',
    team_id: row.team_id ?? null,
    team_name: row.team_name ?? null,
    is_guest: !!row.is_guest,
    auto_evaluation: row.auto_evaluation ?? null,
    rpe: row.rpe ?? null,
    physical_form: row.physical_form ?? null,
    pleasure: row.pleasure ?? null,
    submitted_at: row.submitted_at ?? null,
    comment: row.comment ?? null,
  }));
}

/**
 * Réponses au questionnaire d'un match, staff uniquement — même forme que
 * getTrainingFeedbackResponses, cf. get_match_feedback_responses (RPC miroir).
 */
export async function getMatchFeedbackResponses(matchId: string): Promise<TrainingFeedbackResponse[]> {
  const { data, error } = await supabase.rpc('get_match_feedback_responses', { p_match_id: matchId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    player_id: row.player_id,
    player_name: row.player_name ?? 'Joueur',
    team_id: row.team_id ?? null,
    team_name: row.team_name ?? null,
    is_guest: !!row.is_guest,
    auto_evaluation: row.auto_evaluation ?? null,
    rpe: row.rpe ?? null,
    physical_form: row.physical_form ?? null,
    pleasure: row.pleasure ?? null,
    submitted_at: row.submitted_at ?? null,
    comment: row.comment ?? null,
  }));
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
    training_id:     row.training_id ?? null,
    match_id:        row.match_id ?? null,
    date:            row.date ?? '',
    auto_evaluation: row.auto_evaluation ?? null,
    rpe:             row.rpe ?? null,
    physical_form:   row.physical_form ?? null,
    pleasure:        row.pleasure ?? null,
  }));
}
