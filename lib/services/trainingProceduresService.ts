import { supabase } from '../supabaseClient';

export type TrainingProcedureTheme = 'Offensif' | 'Defensif' | 'Transition' | 'CPA';
export type TrainingProcedureType = 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu';

export interface TrainingProcedureRecord {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  objectives: string;
  instructions: string;
  variants: string | null;
  corrections: string | null;
  theme: TrainingProcedureTheme;
  type: TrainingProcedureType;
  min_players: number | null;
  field_dimensions: string | null;
  duration_minutes: number | null;
  image_url: string | null;
  schematic_id: string | null;
  bloc: string | null;
  principe: string | null;
  phase: string | null;
  rapport_numerique: string | null;
  share_code: string | null;
  archived_at: string | null;
  club_id: string;
  created_by: string | null;
  is_public: boolean;
}

export const trainingProceduresService = {
  /**
   * Récupère les fiches procédures actives du club (lecture seule — la
   * création/édition de fiches reste hors scope de l'assembleur de séance,
   * cf. SPEC_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md §6).
   */
  async getProceduresByClub(clubId: string): Promise<TrainingProcedureRecord[]> {
    const { data, error } = await supabase
      .from('training_procedures')
      .select('*')
      .eq('club_id', clubId)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },
};
