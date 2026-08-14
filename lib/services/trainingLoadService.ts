import { supabase } from '../supabaseClient';
import type { TrainingLoadRow, MatrixRow } from '../trainingLoad';

/**
 * Charge d'entraînement — couche service web.
 *
 * Jumeau mobile : `mobile/lib/services/trainingLoad.ts`.
 *
 * La RPC renvoie une ligne par SÉANCE, pas des semaines. Les roulements
 * hebdomadaires, la monotonie et la détection de pic sont calculés dans
 * `lib/trainingLoad.ts`, dupliqué web/mobile : la monotonie de Foster porte sur
 * les sept jours de la semaine, jours de repos inclus, ce qui se lit et se
 * vérifie mieux en TypeScript qu'en SQL.
 */
export const trainingLoadService = {
  async getTrainingLoad(
    clubId: string,
    options: { teamId?: string | null; from?: string | null; to?: string | null } = {},
  ): Promise<TrainingLoadRow[]> {
    const { data, error } = await supabase.rpc('get_training_load', {
      p_club_id: clubId,
      p_team_id: options.teamId ?? null,
      p_from: options.from ?? null,
      p_to: options.to ?? null,
    });
    if (error) throw error;
    return (data || []) as TrainingLoadRow[];
  },

  /** Jumeau individuel : même forme de ligne, une valeur au lieu d'une moyenne d'équipe. */
  async getPlayerTrainingLoad(
    playerId: string,
    options: { from?: string | null; to?: string | null } = {},
  ): Promise<TrainingLoadRow[]> {
    const { data, error } = await supabase.rpc('get_player_training_load', {
      p_player_id: playerId,
      p_from: options.from ?? null,
      p_to: options.to ?? null,
    });
    if (error) throw error;
    return (data || []) as TrainingLoadRow[];
  },

  /** Matrice joueurs × dernières séances, pour la vue « effectif » de la charge. */
  async getTeamTrainingLoadMatrix(
    clubId: string,
    teamId: string,
    limit = 5,
  ): Promise<MatrixRow[]> {
    const { data, error } = await supabase.rpc('get_team_training_load_matrix', {
      p_club_id: clubId,
      p_team_id: teamId,
      p_limit: limit,
    });
    if (error) throw error;
    return (data || []) as MatrixRow[];
  },
};

/**
 * Bornes par défaut : les 12 dernières semaines, assez pour voir une tendance.
 *
 * Formatage sur les composantes LOCALES, pas `toISOString` : en été à Paris,
 * minuit local vaut 22 h UTC la veille, et la borne partait un jour trop tôt.
 */
export function defaultLoadWindow(weeks = 12): { from: string; to: string } {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - weeks * 7);
  return { from: iso(from), to: iso(to) };
}
