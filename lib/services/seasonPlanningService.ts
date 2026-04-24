import { supabase } from '../supabaseClient';

export interface RecruitData {
  id: string;
  name: string;
  position: string;
  notes: string;
}

export interface TeamPlanningState {
  hierarchyCount: number;
  slots: { [hierarchy: number]: string[] };
  hierarchyNames?: { [hierarchy: number]: string };
}

export interface PlanningData {
  teams: { [teamId: string]: TeamPlanningState };
  departures: string[];
  unassigned: string[];
  recruits: { [recruitId: string]: RecruitData };
}

export const seasonPlanningService = {
  async load(clubId: string, season: string): Promise<PlanningData | null> {
    const { data, error } = await supabase
      .from('season_planning')
      .select('data')
      .eq('club_id', clubId)
      .eq('season', season)
      .maybeSingle();
    if (error) throw error;
    return data ? (data.data as PlanningData) : null;
  },

  async save(clubId: string, season: string, planningData: PlanningData): Promise<void> {
    const { error } = await supabase
      .from('season_planning')
      .upsert(
        { club_id: clubId, season, data: planningData, updated_at: new Date().toISOString() },
        { onConflict: 'club_id,season' }
      );
    if (error) throw error;
  },

  async listSeasons(clubId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('season_planning')
      .select('season')
      .eq('club_id', clubId)
      .order('season', { ascending: false });
    if (error) throw error;
    return (data || []).map((r: { season: string }) => r.season);
  },
};
