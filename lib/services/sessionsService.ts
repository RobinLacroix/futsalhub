import { supabase } from '../supabaseClient';

export type SessionBlockType =
  | 'Echauffement'      // Bloc 1 — échauffement ludique
  | 'Problematisation'  // Bloc 2
  | 'Situation'         // Bloc 3 — cœur de séance
  | 'Analytique'        // Bloc 4 — optionnel
  | 'JeuOriente'        // Bloc 5
  | 'MatchLibre';        // Bloc 6

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

/**
 * Mappe les anciens types de bloc (Phase 2, 2026-09-21 → 22) vers la nouvelle
 * trame à 6 blocs — cf. spec §Migration des données existantes. Les séances
 * déjà en prod n'ont jamais de bloc Problematisation/MatchLibre tant qu'elles
 * ne sont pas rouvertes et complétées : pas une régression, la timeline ne
 * reflète que les blocs présents.
 */
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

export const sessionsService = {
  /**
   * Récupère les séances du club (bibliothèque partagée — portée club, pas équipe).
   */
  async getSessionsByClub(clubId: string): Promise<TrainingSessionRecord[]> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('club_id', clubId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((r) => ({ ...r, blocks: normalizeSessionBlocks(r.blocks) }));
  },

  /**
   * Récupère une séance par son ID.
   */
  async getSessionById(id: string): Promise<TrainingSessionRecord | null> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;
    return { ...data, blocks: normalizeSessionBlocks(data.blocks) };
  },

  /**
   * Crée ou met à jour une séance.
   */
  async saveSession(payload: {
    id?: string | null;
    clubId: string;
    name: string;
    meta: SessionMeta;
    blocks: SessionBlock[];
  }): Promise<TrainingSessionRecord> {
    if (payload.id) {
      const { data, error } = await supabase
        .from('training_sessions')
        .update({
          name: payload.name,
          meta: payload.meta,
          blocks: payload.blocks,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('training_sessions')
        .insert({
          club_id: payload.clubId,
          name: payload.name,
          meta: payload.meta,
          blocks: payload.blocks,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  /**
   * Supprime une séance.
   */
  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase
      .from('training_sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};
