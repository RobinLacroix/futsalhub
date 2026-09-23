import { supabase } from '../supabase';
import type { Drill } from '../tactics/types';

/**
 * Miroir mobile de `lib/services/schematicsService.ts` (web) — même table
 * `schematics`. Lecture seule côté mobile : l'édition/dessin de schémas reste
 * une tâche web (cf SPEC_TACTIQUE_NATIF_MOBILE_2026-09.md §5, éditeur
 * interactif abandonné sur mobile) — pas de create/update ici, contrairement
 * au web.
 *
 * Bibliothèque club-wide depuis la migration 20260922100000_schematics_club_wide
 * (demande de Robin : un schéma créé par une équipe doit être visible par
 * tout le club) — team_id reste une étiquette "créée par", plus une portée
 * d'accès ; RLS scope désormais sur club_id (has_club_access).
 */
export interface SchematicRecord {
  id: string;
  team_id: string;
  club_id: string;
  name: string;
  data: Drill;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Schéma + nom de l'équipe qui l'a créé — pour l'afficher/le filtrer (cf getSchematicsByClub). */
export interface SchematicWithTeamName extends SchematicRecord {
  team_name: string | null;
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

/** Bibliothèque du club entier — utilisée par l'écran Bibliothèque (cf app/(tabs)/library). */
export async function getSchematicsByClub(clubId: string): Promise<SchematicWithTeamName[]> {
  const { data, error } = await supabase
    .from('schematics')
    .select('*, team:teams(name)')
    .eq('club_id', clubId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const { team, ...rest } = row;
    return { ...rest, team_name: team?.name ?? null } as SchematicWithTeamName;
  });
}

/** Suppression définitive d'un schéma sans fiche liée (orphelin) — irréversible, contrairement à archiveProcedure. */
export async function deleteSchematic(id: string): Promise<void> {
  const { error } = await supabase.from('schematics').delete().eq('id', id);
  if (error) throw error;
}
