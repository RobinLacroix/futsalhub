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
export interface FeedbackSessionTeammate {
  id: string;
  name: string;
}

export async function getFeedbackSessionByToken(token: string): Promise<{
  kind: 'training' | 'match';
  training_id?: string;
  match_id?: string;
  player_id: string;
  training_date: string;
  theme: string | null;
  player_name: string | null;
  /** Coéquipiers votables pour le MVP (hors soi-même), présent seulement si kind === 'match'. */
  teammates?: FeedbackSessionTeammate[];
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
    kind: 'training' | 'match';
    training_id?: string;
    match_id?: string;
    player_id: string;
    training_date: string;
    theme: string | null;
    player_name: string | null;
    teammates?: FeedbackSessionTeammate[];
  };
}

/**
 * Soumet le questionnaire de feedback (appelable sans auth avec le token).
 * `mvpVotePlayerId` est obligatoire côté RPC pour un questionnaire de match
 * (ignoré pour une séance) : un joueur convoqué désigné, jamais soi-même.
 */
export async function submitTrainingFeedback(
  token: string,
  values: { auto_evaluation: number; rpe: number; physical_form: number; pleasure: number; comment?: string | null },
  mvpVotePlayerId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const params: Record<string, unknown> = {
    p_token: token,
    p_auto_evaluation: values.auto_evaluation,
    p_rpe: values.rpe,
    p_physical_form: values.physical_form,
    p_pleasure: values.pleasure
  };
  // p_comment n'est passé que s'il est fourni (préserve l'appelant public sans commentaire).
  if (values.comment !== undefined) params.p_comment = values.comment;
  if (mvpVotePlayerId) params.p_mvp_vote_player_id = mvpVotePlayerId;
  const { data, error } = await supabase.rpc('submit_training_feedback', params);

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
 * Feedbacks de TOUS les joueurs pour les N dernières séances d'une équipe
 * (miroir de mobile/lib/services/feedback.ts::getTeamFeedbackForLastSessions).
 * Utilisé par le Dashboard pour la forme physique récente par joueur.
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
    player_id: row.player_id,
    date: dateById[row.training_id] ?? '',
    auto_evaluation: row.auto_evaluation ?? null,
    rpe: row.rpe ?? null,
    physical_form: row.physical_form ?? null,
    pleasure: row.pleasure ?? null,
  }));
}

export interface PlayerTrainingFeedbackRow {
  training_id: string | null;
  match_id: string | null;
  date: string;
  auto_evaluation: number | null;
  rpe: number | null;
  physical_form: number | null;
  pleasure: number | null;
}

/**
 * Récupère l'historique des feedbacks (séance ET match) pour un joueur, pour
 * le graphique évolutif du profil. `training_id`/`match_id` sont mutuellement
 * exclusifs (contrainte CHECK) : on embed les deux relations sans `!inner`
 * pour ne perdre ni l'un ni l'autre.
 */
export async function getPlayerTrainingFeedback(playerId: string): Promise<PlayerTrainingFeedbackRow[]> {
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

  const rows = (data || []).map((row: any) => ({
    training_id: row.training_id ?? null,
    match_id: row.match_id ?? null,
    date: row.trainings?.date ?? row.matches?.date ?? row.training_id ?? row.match_id,
    auto_evaluation: row.auto_evaluation ?? null,
    rpe: row.rpe ?? null,
    physical_form: row.physical_form ?? null,
    pleasure: row.pleasure ?? null
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
  return ((data || []) as any[]).map((row) => ({
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

// ─── Classement des votes MVP d'un match (staff) ──────────────────────────────

export interface MatchMvpRanking {
  ranking: { player_id: string; player_name: string; votes: number }[];
  totalVoters: number;
  votedCount: number;
  isComplete: boolean;
  mvpPlayerIds: string[];
}

/**
 * Classement des votes MVP pour un match, staff uniquement. `isComplete` reflète
 * si tous les joueurs convoqués ont répondu au questionnaire (le MVP officiel,
 * matches.mvp_player_ids, n'est calculé côté RPC qu'à ce moment-là).
 */
export async function getMatchMvpVotes(matchId: string): Promise<MatchMvpRanking> {
  const { data, error } = await supabase.rpc('get_match_mvp_votes', { p_match_id: matchId });
  if (error) throw error;
  const r = data as {
    ranking?: { player_id: string; player_name: string; votes: number }[];
    total_voters?: number;
    voted_count?: number;
    is_complete?: boolean;
    mvp_player_ids?: string[];
    error?: string;
  } | null;
  if (!r || r.error) throw new Error(r?.error || 'Erreur');
  return {
    ranking: r.ranking ?? [],
    totalVoters: r.total_voters ?? 0,
    votedCount: r.voted_count ?? 0,
    isComplete: !!r.is_complete,
    mvpPlayerIds: r.mvp_player_ids ?? [],
  };
}
