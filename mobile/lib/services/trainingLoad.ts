import { supabase } from '../supabase';
import type { TrainingLoadRow } from '../trainingLoad';

/**
 * Charge d'entraînement — couche service mobile.
 *
 * Jumeau web : `lib/services/trainingLoadService.ts`.
 *
 * La RPC renvoie une ligne par SÉANCE, pas des semaines. Les roulements
 * hebdomadaires, la monotonie et la détection de pic sont calculés dans
 * `lib/trainingLoad.ts`, dupliqué web/mobile : la monotonie de Foster porte sur
 * les sept jours de la semaine, jours de repos inclus, ce qui se lit et se
 * vérifie mieux en TypeScript qu'en SQL.
 */
export async function getTrainingLoad(
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
}

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
