import { supabase } from '../supabase';

/**
 * Miroir mobile de lib/services/sessionsService.ts (web) — même table
 * training_sessions, même modèle à 6 blocs (trame futsal-coach : Échauffement
 * ludique / Problématisation / Situation isolée [cœur] / Analytique optionnel /
 * Jeu orienté / Match libre), portée club (pas équipe).
 */

export type SessionBlockType =
  | 'Echauffement'
  | 'Problematisation'
  | 'Situation'
  | 'Analytique'
  | 'JeuOriente'
  | 'MatchLibre';

export type LearningPhase = 'Phase 1' | 'Phase 2' | 'Mix';

export interface SessionBlock {
  id: string;
  type: SessionBlockType;
  duration: number;
  procedureId: string | null;
  intentionPedagogique: string;
}

export interface SessionMeta {
  principe: string;
  moyen?: string;
  theme?: string;
  phase?: LearningPhase;
  effectif?: string;
  dureeTotaleMin: number;
}

export interface TrainingSessionRecord {
  id: string;
  club_id: string;
  created_by: string | null;
  name: string;
  meta: SessionMeta;
  blocks: SessionBlock[];
  created_at: string;
  updated_at: string;
}

/** Mappe les anciens types de bloc (tranche 1, avant le rework 2026-09-22) vers la nouvelle trame — mêmes règles que le web. */
const LEGACY_TYPE_MAP: Record<string, SessionBlockType> = {
  Echauffement: 'Echauffement',
  Exercice: 'Analytique',
  Situation: 'Situation',
  Jeu: 'JeuOriente',
};

const VALID_TYPES = new Set<SessionBlockType>([
  'Echauffement', 'Problematisation', 'Situation', 'Analytique', 'JeuOriente', 'MatchLibre',
]);

export function normalizeSessionBlocks(raw: unknown): SessionBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b, i) => {
    const block = b as Partial<SessionBlock> & { type?: string };
    const rawType = block.type || 'Situation';
    const type: SessionBlockType = VALID_TYPES.has(rawType as SessionBlockType)
      ? (rawType as SessionBlockType)
      : LEGACY_TYPE_MAP[rawType] || 'Situation';
    return {
      id: block.id || `b${Date.now()}${i}`,
      type,
      duration: typeof block.duration === 'number' ? block.duration : 0,
      procedureId: block.procedureId ?? null,
      intentionPedagogique: block.intentionPedagogique || '',
    };
  });
}

/** Migre l'ancien SessionMeta (theme/objectif/phaseCible/intensite/philosophyTags) vers le nouveau — les anciennes séances gardent leur `objectif` comme principe de secours. */
function normalizeSessionMeta(raw: unknown): SessionMeta {
  const m = (raw ?? {}) as Record<string, unknown>;
  const dureeTotaleMin = typeof m.dureeTotaleMin === 'number' ? m.dureeTotaleMin : 0;
  if (typeof m.principe === 'string') {
    return {
      principe: m.principe,
      moyen: typeof m.moyen === 'string' ? m.moyen : undefined,
      theme: typeof m.theme === 'string' ? m.theme : undefined,
      phase: m.phase as LearningPhase | undefined,
      effectif: typeof m.effectif === 'string' ? m.effectif : undefined,
      dureeTotaleMin,
    };
  }
  return {
    principe: typeof m.objectif === 'string' ? m.objectif : '',
    theme: typeof m.theme === 'string' ? m.theme : undefined,
    effectif: typeof m.effectif === 'string' ? m.effectif : undefined,
    dureeTotaleMin,
  };
}

export async function getSessionsByClub(clubId: string): Promise<TrainingSessionRecord[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('club_id', clubId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, meta: normalizeSessionMeta(r.meta), blocks: normalizeSessionBlocks(r.blocks) }));
}

export async function getSessionById(id: string): Promise<TrainingSessionRecord | null> {
  const { data, error } = await supabase.from('training_sessions').select('*').eq('id', id).single();
  if (error) throw error;
  if (!data) return null;
  return { ...data, meta: normalizeSessionMeta(data.meta), blocks: normalizeSessionBlocks(data.blocks) };
}

export async function saveSession(payload: {
  id?: string | null;
  clubId: string;
  name: string;
  meta: SessionMeta;
  blocks: SessionBlock[];
}): Promise<TrainingSessionRecord> {
  if (payload.id) {
    const { data, error } = await supabase
      .from('training_sessions')
      .update({ name: payload.name, meta: payload.meta, blocks: payload.blocks, updated_at: new Date().toISOString() })
      .eq('id', payload.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('training_sessions')
    .insert({ club_id: payload.clubId, name: payload.name, meta: payload.meta, blocks: payload.blocks })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('training_sessions').delete().eq('id', id);
  if (error) throw error;
}
