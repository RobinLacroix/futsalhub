import { supabase } from '../supabase';
import type { Drill } from '../tactics/types';

/**
 * Miroir mobile minimal de `lib/services/schematicsService.ts` (web) — même
 * table `schematics`, mêmes policies RLS (has_team_access/has_team_write_access,
 * vérifiées Phase 0 web), aucune migration nécessaire. Périmètre tranche 1
 * seulement (cf PLAN_TACTIQUE_NATIF_MOBILE_TRANCHE1_2026-09.md) : pas de
 * dossiers, pas de duplication, pas de liste — juste charger/créer/sauver un
 * schéma par id.
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

export async function createSchematic(teamId: string, data: Drill, name = 'Sans titre'): Promise<SchematicRecord> {
  const { data: row, error } = await supabase
    .from('schematics')
    .insert({ team_id: teamId, name, data })
    .select()
    .single();
  if (error) throw error;
  return row;
}

export async function updateSchematic(id: string, data: Drill, name?: string): Promise<void> {
  const patch: { data: Drill; updated_at: string; name?: string } = { data, updated_at: new Date().toISOString() };
  if (name != null) patch.name = name;
  const { error } = await supabase.from('schematics').update(patch).eq('id', id);
  if (error) throw error;
}
