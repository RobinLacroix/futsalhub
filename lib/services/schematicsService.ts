import { supabase } from '../supabaseClient';

export interface SchematicData {
  circuits: Array<{
    id: string;
    name: string;
    sequences: any[][];
  }>;
  currentCircuitIndex: number;
}

export interface SchematicRecord {
  id: string;
  team_id: string;
  name: string;
  data: SchematicData;
  created_at: string;
  updated_at: string;
}

export const schematicsService = {
  /**
   * Récupère tous les schémas d'une équipe
   */
  async getSchematicsByTeam(teamId: string): Promise<SchematicRecord[]> {
    const { data, error } = await supabase
      .from('schematics')
      .select('*')
      .eq('team_id', teamId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupère un schéma par son ID
   */
  async getSchematicById(id: string): Promise<SchematicRecord | null> {
    const { data, error } = await supabase
      .from('schematics')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Crée ou met à jour un schéma
   */
  async saveSchematic(payload: {
    id?: string;
    teamId: string;
    name: string;
    data: SchematicData;
  }): Promise<SchematicRecord> {
    if (payload.id) {
      // Mise à jour
      const { data, error } = await supabase
        .from('schematics')
        .update({
          name: payload.name,
          data: payload.data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Création
      const { data, error } = await supabase
        .from('schematics')
        .insert({
          team_id: payload.teamId,
          name: payload.name,
          data: payload.data,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  /**
   * Supprime un schéma
   */
  async deleteSchematic(id: string): Promise<void> {
    const { error } = await supabase
      .from('schematics')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};
