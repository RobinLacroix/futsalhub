import { supabase } from '../supabase';

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

function mapTrainingRow(row: Record<string, unknown>): MyConvolutionRow {
  return {
    training_id: String(row.training_id ?? ''),
    training_date: row.training_date != null ? String(row.training_date) : '',
    location: (row.location as string) ?? null,
    theme: (row.theme as string) ?? null,
    team_name: (row.team_name as string) ?? null,
    my_status: (row.my_status as string) ?? null,
    feedback_token: (row.feedback_token as string) ?? null,
    feedback_url: (row.feedback_url as string) ?? null,
  };
}

export async function getMyConvocations(): Promise<MyConvolutionRow[]> {
  const { data, error } = await supabase.rpc('get_my_convocations');
  if (error) throw error;
  const list = Array.isArray(data) ? data : [];
  return list.map((row: Record<string, unknown>) => mapTrainingRow(row));
}

/** Une seule RPC : entraînements + matchs en JSON. Plus fiable que deux RPC TABLE. */
export async function getMyCalendarEvents(): Promise<{
  trainings: MyConvolutionRow[];
  matches: MyUpcomingMatchRow[];
}> {
  const { data, error } = await supabase.rpc('get_my_calendar_events');
  if (error) throw error;
  const obj = (data ?? {}) as Record<string, unknown>;
  const trainingsRaw = Array.isArray(obj.trainings) ? obj.trainings : [];
  const matchesRaw = Array.isArray(obj.matches) ? obj.matches : [];
  return {
    trainings: trainingsRaw.map((row: Record<string, unknown>) => mapTrainingRow(row)),
    matches: matchesRaw.map((row: Record<string, unknown>) => ({
      match_id: String(row.match_id ?? ''),
      match_date: row.match_date != null ? String(row.match_date) : '',
      title: (row.title as string) ?? null,
      location: (row.location as string) ?? null,
      competition: (row.competition as string) ?? null,
      opponent_team: (row.opponent_team as string) ?? null,
      team_name: (row.team_name as string) ?? null,
    })),
  };
}

export async function setMyTrainingAttendance(
  trainingId: string,
  status: 'present' | 'absent' | 'late'
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('set_my_training_attendance', {
    p_training_id: trainingId,
    p_status: status,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string } | null;
  if (result?.ok) return { ok: true };
  return { ok: false, error: (result?.error as string) || 'Erreur inconnue' };
}

/** Lie le compte au joueur via le code partagé par le coach (écran Rejoindre le club). */
export async function claimPlayerLinkCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('claim_player_link_code', { p_code: code.trim().toUpperCase() });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string } | null;
  if (result?.ok) return { ok: true };
  const msg = result?.error as string | undefined;
  if (msg === 'code_not_found') return { ok: false, error: 'Code invalide.' };
  if (msg === 'code_expired') return { ok: false, error: 'Ce code a expiré. Demandez un nouveau code à votre coach.' };
  if (msg === 'already_linked_other') return { ok: false, error: 'Ce compte est déjà lié à un autre joueur.' };
  return { ok: false, error: msg ?? 'Erreur inconnue' };
}

export async function getMyPendingFeedbackTokens(): Promise<MyPendingFeedbackRow[]> {
  const { data, error } = await supabase.rpc('get_my_pending_feedback_tokens');
  if (error) throw error;
  const baseUrl = process.env.EXPO_PUBLIC_SITE_URL || '';
  return (data ?? []).map((row: Record<string, unknown>) => ({
    training_id: row.training_id as string,
    training_date: row.training_date as string,
    theme: (row.theme as string) ?? null,
    token: row.token as string,
    url: baseUrl ? baseUrl + (row.url as string) : ((row.url as string) || ''),
  }));
}

/** Équipes du joueur connecté (pour Ma fiche / stats). */
export async function getMyPlayerTeamIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_my_player_team_ids');
  if (error) return [];
  return (data ?? []) as string[];
}

/** Pourquoi la liste de convocations est vide (pour message dans l’app). */
export interface MyConvocationsStatus {
  has_player: boolean;
  team_count: number;
  upcoming_count: number;
  hint: 'no_player' | 'no_team' | 'no_upcoming' | 'ok';
}

export async function getMyConvocationsStatus(): Promise<MyConvocationsStatus | null> {
  const { data, error } = await supabase.rpc('get_my_convocations_status');
  if (error) return null;
  const raw = data as Record<string, unknown> | null;
  if (!raw) return null;
  return {
    has_player: Boolean(raw.has_player),
    team_count: Number(raw.team_count) || 0,
    upcoming_count: Number(raw.upcoming_count) || 0,
    hint: (raw.hint as MyConvocationsStatus['hint']) || 'ok',
  };
}

/** Matchs à venir pour les équipes du joueur. */
export interface MyUpcomingMatchRow {
  match_id: string;
  match_date: string;
  title: string | null;
  location: string | null;
  competition: string | null;
  opponent_team: string | null;
  team_name: string | null;
}

/** Diagnostic : pourquoi les convocations sont vides (à appeler quand liste vide). */
export async function getMyConvocationsDebug(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc('get_my_convocations_debug');
  if (error) return null;
  return data as Record<string, unknown> | null;
}

export async function getMyUpcomingMatches(): Promise<MyUpcomingMatchRow[]> {
  const { data, error } = await supabase.rpc('get_my_upcoming_matches');
  if (error) return [];
  const list = Array.isArray(data) ? data : [];
  return list.map((row: Record<string, unknown>) => ({
    match_id: String(row.match_id ?? ''),
    match_date: row.match_date != null ? String(row.match_date) : '',
    title: (row.title as string) ?? null,
    location: (row.location as string) ?? null,
    competition: (row.competition as string) ?? null,
    opponent_team: (row.opponent_team as string) ?? null,
    team_name: (row.team_name as string) ?? null,
  }));
}
