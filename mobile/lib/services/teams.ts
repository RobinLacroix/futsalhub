import { supabase } from '../supabase';
import { isClubAdmin, setTeamMainCoach } from './clubs';
import type { Team } from '../../types';

export async function getTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Équipes d’un club (pour l’écran Gestion des équipes). */
export async function getTeamsByClubId(clubId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('club_id', clubId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export interface TeamFormData {
  name: string;
  category: string;
  level: string;
  color: string;
}

export async function createTeam(clubId: string, data: TeamFormData): Promise<Team> {
  const { data: team, error } = await supabase
    .from('teams')
    .insert({
      club_id: clubId,
      name: data.name.trim(),
      category: data.category.trim() || 'Senior',
      level: data.level.trim() || 'A',
      color: data.color || '#3b82f6',
    })
    .select()
    .single();
  if (error) throw error;
  return team;
}

export async function updateTeam(teamId: string, data: Partial<TeamFormData>): Promise<Team> {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.category !== undefined) payload.category = data.category.trim();
  if (data.level !== undefined) payload.level = data.level.trim();
  if (data.color !== undefined) payload.color = data.color;
  const { data: team, error } = await supabase
    .from('teams')
    .update(payload)
    .eq('id', teamId)
    .select()
    .single();
  if (error) throw error;
  if (data.mainCoachUserId !== undefined) {
    try {
      await setTeamMainCoach(teamId, data.mainCoachUserId);
    } catch (e) {
      /* RLS may block if not admin */
      throw e;
    }
  }
  return team;
}

export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', teamId);
  if (error) throw error;
}
