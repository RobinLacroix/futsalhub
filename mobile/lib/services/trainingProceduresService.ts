import { supabase } from '../supabase';
import { getSchematicsByClub, type SchematicRecord } from './schematicsService';

/**
 * Miroir mobile de lib/services/trainingProceduresService.ts (web) — même
 * table `training_procedures`. Les CHAMPS d'une fiche (texte, taxonomie,
 * listes structurées) sont éditables côté mobile depuis le 2026-09-22, à la
 * demande explicite de Robin ; seul le DESSIN du schéma reste une tâche web
 * (cf schematicsService, toujours lecture seule côté mobile — aucune écriture
 * dans `schematics` ici).
 */

/** "Phase de jeu" à l'affichage — colonne toujours `theme` en base. */
export type TrainingProcedureTheme = 'Offensif' | 'Defensif' | 'Transition' | 'CPA' | 'Powerplay';
/** "Format" à l'affichage — colonne toujours `type` en base. */
export type TrainingProcedureType = 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu' | 'Rondo/Toro';
export type TrainingProcedureIntensite = 'Légère' | 'Modérée' | 'Haute';

/** Une entrée de `mecanismes` : une règle et ce qu'elle induit comme comportement. */
export interface MecanismeInducteur {
  regle: string;
  induit: string;
}

export interface TrainingProcedureRecord {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  objectives: string;
  /** Texte libre d'introduction — champ "Description" côté web. */
  instructions: string;
  /** @deprecated remplacé par variables_plus/variables_moins */
  variants: string | null;
  /** @deprecated remplacé par comportements */
  corrections: string | null;
  theme: TrainingProcedureTheme;
  type: TrainingProcedureType;
  min_players: number | null;
  field_dimensions: string | null;
  duration_minutes: number | null;
  image_url: string | null;
  schematic_id: string | null;
  bloc: string | null;
  folder_id: string | null;
  /** @deprecated remplacé par principes (tags) */
  principe: string | null;
  principes: string[];
  /** @deprecated ancienne "phase d'apprentissage" (1/2/Mix), sortie des formulaires */
  phase: string | null;
  rapport_numerique: string | null;
  intensite: TrainingProcedureIntensite | null;
  scoring: string[];
  comportements: string[];
  mecanismes: MecanismeInducteur[];
  variables_plus: string[];
  variables_moins: string[];
  share_code: string | null;
  archived_at: string | null;
  club_id: string;
  created_by: string | null;
  is_public: boolean;
}

export async function getProceduresByClub(clubId: string): Promise<TrainingProcedureRecord[]> {
  const { data, error } = await supabase
    .from('training_procedures')
    .select('*')
    .eq('club_id', clubId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getProcedureById(id: string): Promise<TrainingProcedureRecord | null> {
  const { data, error } = await supabase.from('training_procedures').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Champs modifiables depuis la fiche mobile — jamais `schematic_id` (lier/délier un schéma reste une action web, cf DrillPlayer en lecture seule). */
export type ProcedureUpdateInput = Partial<
  Omit<TrainingProcedureRecord, 'id' | 'created_at' | 'updated_at' | 'archived_at' | 'created_by' | 'is_public' | 'share_code' | 'club_id' | 'schematic_id'>
>;

/** Met à jour les champs d'une fiche existante — jamais de création depuis mobile (une fiche sans schéma se crée toujours depuis le web, cf "+ Nouveau procédé"). */
export async function updateProcedure(id: string, patch: ProcedureUpdateInput): Promise<TrainingProcedureRecord> {
  const { data, error } = await supabase.from('training_procedures').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** Un procédé de la bibliothèque, avec son schéma s'il en a un. */
export interface ProcedureLibraryItem extends TrainingProcedureRecord {
  schematic: SchematicRecord | null;
}

/**
 * Une carte de la bibliothèque — soit un procédé (avec ou sans schéma), soit
 * un schéma qui n'a pas (encore) de fiche liée. Miroir exact de LibraryCard
 * côté web (lib/services/trainingProceduresService.ts) : les deux cas
 * existent, masquer les schémas orphelins les ferait disparaître de la
 * bibliothèque mobile alors qu'ils sont bien là côté web.
 */
export interface LibraryCard {
  key: string;
  kind: 'procedure' | 'schematic';
  title: string;
  bloc: string | null;
  theme: TrainingProcedureTheme | null;
  folder_id: string | null;
  updated_at: string;
  schematic: SchematicRecord | null;
  procedure: ProcedureLibraryItem | null;
}

/** Procédés actifs du club, chacun avec son schéma joint s'il en a un. */
export async function getLibraryByClub(clubId: string): Promise<ProcedureLibraryItem[]> {
  const { data, error } = await supabase
    .from('training_procedures')
    .select('*, schematic:schematics(*)')
    .eq('club_id', clubId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProcedureLibraryItem[];
}

/**
 * LA bibliothèque, complète : procédés (avec schéma joint) UNION schémas sans
 * fiche liée. Même union que getFullLibraryByClub côté web — sans elle, un
 * schéma jamais rattaché à une fiche disparaîtrait de la bibliothèque mobile.
 */
export async function getFullLibraryByClub(clubId: string): Promise<LibraryCard[]> {
  const [procedures, schematics] = await Promise.all([getLibraryByClub(clubId), getSchematicsByClub(clubId)]);

  const linkedSchematicIds = new Set(
    procedures.map((p) => p.schematic_id).filter((id): id is string => !!id),
  );
  const orphanSchematics = schematics.filter((s) => !linkedSchematicIds.has(s.id));

  const procCards: LibraryCard[] = procedures.map((p) => ({
    key: `p:${p.id}`,
    kind: 'procedure',
    title: p.title,
    bloc: p.bloc,
    theme: p.theme,
    folder_id: p.folder_id,
    updated_at: p.updated_at,
    schematic: p.schematic,
    procedure: p,
  }));
  const schemaCards: LibraryCard[] = orphanSchematics.map((s) => ({
    key: `s:${s.id}`,
    kind: 'schematic',
    title: s.name,
    bloc: null,
    theme: null,
    folder_id: s.folder_id,
    updated_at: s.updated_at,
    schematic: s,
    procedure: null,
  }));

  return [...procCards, ...schemaCards].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}
