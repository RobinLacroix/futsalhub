import { supabase } from '../supabase';
import type { Training, Match, Team } from '../../types';

export interface CoachCalendarData {
  teams: Team[];
  trainings: Training[];
  matches: Match[];
}

/**
 * Un seul appel pour équipes + entraînements + matchs. Réduit la latence (1 round-trip au lieu de 3).
 * @param season saison à charger ("YYYY-YYYY"). Si omis, la RPC filtre sur la saison active du club.
 */
export async function getCoachCalendarData(
  teamId: string | null,
  season?: string
): Promise<CoachCalendarData> {
  const { data, error } = await supabase.rpc('get_coach_calendar_data', {
    p_team_id: teamId,
    ...(season ? { p_season: season } : {}),
  });
  if (error) throw error;
  const raw = (data as { teams?: unknown[]; trainings?: unknown[]; matches?: unknown[] }) ?? {};
  return {
    teams: (raw.teams ?? []) as Team[],
    trainings: (raw.trainings ?? []) as Training[],
    matches: (raw.matches ?? []) as Match[],
  };
}
