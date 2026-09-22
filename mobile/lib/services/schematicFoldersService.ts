import { supabase } from '../supabase';

/** Miroir mobile de lib/services/schematicFoldersService.ts (web) — meme table schematic_folders, scope equipe. */

export interface SchematicFolderRecord {
  id: string;
  team_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export async function getFoldersByTeam(teamId: string): Promise<SchematicFolderRecord[]> {
  const { data, error } = await supabase.from('schematic_folders').select('*').eq('team_id', teamId).order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createFolder(teamId: string, name: string): Promise<SchematicFolderRecord> {
  const { data, error } = await supabase.from('schematic_folders').insert({ team_id: teamId, name }).select().single();
  if (error) throw error;
  return data;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('schematic_folders').update({ name }).eq('id', id);
  if (error) throw error;
}

/** Supprime le dossier. Les schemas qu'il contenait repassent a folder_id = null (ON DELETE SET NULL en base) — ils ne sont jamais supprimes. */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('schematic_folders').delete().eq('id', id);
  if (error) throw error;
}
