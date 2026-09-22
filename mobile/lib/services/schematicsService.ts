import { supabase } from '../supabase';
import type { Drill } from '../tactics/types';

/**
 * Miroir mobile de `lib/services/schematicsService.ts` (web) — même table
 * `schematics`, mêmes policies RLS (has_team_access, lecture). Lecture seule
 * côté mobile : l'édition/dessin de schémas reste une tâche web (cf
 * SPEC_TACTIQUE_NATIF_MOBILE_2026-09.md §5, éditeur interactif abandonné sur
 * mobile) — pas de create/update ici, contrairement au web.
 */
export interface SchematicRecord {
  id: string;
  team_id: string;
  name: string;
  data: Drill;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getSchematicById(id: string): Promise<SchematicRecord | null> {
  const { data, error } = await supabase.from('schematics').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getSchematicsByTeamId(teamId: string): Promise<SchematicRecord[]> {
  const { data, error } = await supabase
    .from('schematics')
    .select('*')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
