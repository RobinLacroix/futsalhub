import { supabase } from '../supabaseClient';
import type { Team } from '@/types';

export const teamsService = {
  /**
   * Récupère toutes les équipes
   */
  async getAllTeams(): Promise<Team[]> {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('name');

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupère une équipe par son ID
   */
  async getTeamById(teamId: string): Promise<Team | null> {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Crée une nouvelle équipe
   */
  async createTeam(teamData: Omit<Team, 'id' | 'created_at' | 'updated_at'>): Promise<Team> {
    const { data, error } = await supabase
      .from('teams')
      .insert(teamData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Met à jour une équipe
   */
  async updateTeam(teamId: string, teamData: Partial<Omit<Team, 'id' | 'created_at' | 'updated_at'>>): Promise<Team> {
    const { data, error } = await supabase
      .from('teams')
      .update(teamData)
      .eq('id', teamId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Supprime une équipe
   */
  async deleteTeam(teamId: string): Promise<void> {
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (error) throw error;
  }
};




