import { supabase } from '../supabaseClient';

export interface SchematicFolderRecord {
  id: string;
  team_id: string;
  club_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export const schematicFoldersService = {
  async getFoldersByTeam(teamId: string): Promise<SchematicFolderRecord[]> {
    const { data, error } = await supabase
      .from('schematic_folders')
      .select('*')
      .eq('team_id', teamId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /** Dossiers du club entier — même bascule club-wide que les schémas (cf schematicsService.getSchematicsByClub). */
  async getFoldersByClub(clubId: string): Promise<SchematicFolderRecord[]> {
    const { data, error } = await supabase
      .from('schematic_folders')
      .select('*')
      .eq('club_id', clubId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createFolder(teamId: string, name: string): Promise<SchematicFolderRecord> {
    const { data, error } = await supabase
      .from('schematic_folders')
      .insert({ team_id: teamId, name })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async renameFolder(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from('schematic_folders')
      .update({ name })
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Supprime le dossier. Les schémas qu'il contenait repassent à
   * folder_id = null (ON DELETE SET NULL en base, cf migration) — ils ne
   * sont jamais supprimés.
   */
  async deleteFolder(id: string): Promise<void> {
    const { error } = await supabase
      .from('schematic_folders')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};
