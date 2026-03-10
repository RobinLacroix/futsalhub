import { supabase } from '../supabase';
import type { Team } from '../../types';

export async function getTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}
