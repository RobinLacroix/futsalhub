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
  club_id: string;
  name: string;
  data: SchematicData;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Schéma + nom de l'équipe qui l'a créé — pour l'affichage/le filtre "créé par" (cf getSchematicsByClub). */
export interface SchematicWithTeamName extends SchematicRecord {
  team_name: string | null;
}

export const schematicsService = {
  /**
   * Récupère tous les schémas (accessibles à toutes les équipes)
   * Le team_id est conservé pour référence mais ne filtre plus les résultats
   */
  async getSchematicsByTeam(teamId?: string): Promise<SchematicRecord[]> {
    const { data, error } = await supabase
      .from('schematics')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupère tous les schémas (méthode alternative sans paramètre)
   */
  async getAllSchematics(): Promise<SchematicRecord[]> {
    const { data, error } = await supabase
      .from('schematics')
      .select('*')
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

  /**
   * Récupère les schémas d'UNE équipe précise (filtré, contrairement à
   * getSchematicsByTeam ci-dessus qui ignore volontairement team_id pour
   * d'autres usages).
   */
  async getSchematicsByTeamId(teamId: string): Promise<SchematicRecord[]> {
    const { data, error } = await supabase
      .from('schematics')
      .select('*')
      .eq('team_id', teamId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Bibliothèque club-wide : tous les schémas du club, quelle que soit
   * l'équipe qui les a créés (cf migration 20260922100000_schematics_club_wide,
   * demande de Robin — un schéma appartient au club, team_id reste une
   * étiquette "créée par" affichable/filtrable, plus une portée d'accès).
   * Utilisé par la bibliothèque embarquée de l'éditeur (#libOverlay).
   */
  async getSchematicsByClub(clubId: string): Promise<SchematicWithTeamName[]> {
    const { data, error } = await supabase
      .from('schematics')
      .select('*, team:teams(name)')
      .eq('club_id', clubId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row: any) => {
      const { team, ...rest } = row;
      return { ...rest, team_name: team?.name ?? null } as SchematicWithTeamName;
    });
  },

  /**
   * Range (ou dérange, folderId = null) un schéma dans un dossier.
   */
  async setSchematicFolder(id: string, folderId: string | null): Promise<void> {
    const { error } = await supabase
      .from('schematics')
      .update({ folder_id: folderId })
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Duplique un schéma (même équipe, même dossier, titre suffixé) — copie
   * indépendante, pas une référence.
   */
  async duplicateSchematic(id: string): Promise<SchematicRecord> {
    const { data: source, error: fetchError } = await supabase
      .from('schematics')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    // source.data est en réalité au format "drill" natif (Phase 1), pas
    // SchematicData (ancien format circuits/sequences) — le service ne
    // valide pas la forme du jsonb, cf schematics/page.tsx.
    const copyData: unknown = JSON.parse(JSON.stringify(source.data));
    const { data, error } = await supabase
      .from('schematics')
      .insert({
        team_id: source.team_id,
        name: (source.name || 'Sans titre') + ' (copie)',
        data: copyData,
        folder_id: source.folder_id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
