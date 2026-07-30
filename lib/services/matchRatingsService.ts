import { supabase } from '../supabaseClient';
import type {
  CoachEvaluation,
  MatchPlayerRating,
  MatchPlayerRatingRow,
  RatingWeights,
  RatingWeightsResult,
} from '@/types';

/**
 * Système d'évaluation de match.
 * Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md
 *
 * Volet A — évaluation coach : lecture/écriture de la colonne matches.coach_evaluation.
 * Volet B — note data joueur : lecture seule via la RPC get_match_player_ratings
 *           (calcul en base à partir de match_events, jamais figé).
 */
export const matchRatingsService = {
  /** Volet B : notes /10 des joueurs de champ d'un match (triées par note décroissante). */
  async getPlayerRatings(matchId: string): Promise<MatchPlayerRating[]> {
    const { data, error } = await supabase.rpc('get_match_player_ratings', {
      p_match_id: matchId,
    });

    if (error) throw error;
    return (data ?? []) as MatchPlayerRating[];
  },

  /**
   * Volet B (set-based) : notes par (match, joueur) sur un lot de matchs, en un seul appel.
   * À agréger côté client : moyenne par joueur (analytics), série par date (courbe page joueur).
   */
  async getRatingsForMatches(matchIds: string[]): Promise<MatchPlayerRatingRow[]> {
    if (matchIds.length === 0) return [];
    const { data, error } = await supabase.rpc('get_match_player_ratings_bulk', {
      p_match_ids: matchIds,
    });

    if (error) throw error;
    return (data ?? []) as MatchPlayerRatingRow[];
  },

  /** Volet A : enregistre (ou efface avec null) l'évaluation qualitative coach d'un match. */
  async setCoachEvaluation(
    matchId: string,
    evaluation: CoachEvaluation | null
  ): Promise<void> {
    const { error } = await supabase
      .from('matches')
      .update({ coach_evaluation: evaluation })
      .eq('id', matchId);

    if (error) throw error;
  },

  /** Échelle de notation du club de l'utilisateur (défauts si non personnalisée). */
  async getRatingWeights(): Promise<RatingWeightsResult> {
    const { data, error } = await supabase.rpc('get_rating_weights');
    if (error) throw error;
    return (Array.isArray(data) ? data[0] : data) as RatingWeightsResult;
  },

  /** Enregistre l'échelle de notation personnalisée du club de l'utilisateur. */
  async setRatingWeights(w: RatingWeights): Promise<void> {
    const { error } = await supabase.rpc('set_rating_weights', {
      p_w_goal: w.w_goal,
      p_w_assist: w.w_assist,
      p_w_recovery: w.w_recovery,
      p_w_shot_on_target: w.w_shot_on_target,
      p_w_shot: w.w_shot,
      p_w_ball_loss: w.w_ball_loss,
      p_w_yellow_card: w.w_yellow_card,
      p_w_red_card: w.w_red_card,
      p_cw_goal: w.cw_goal,
      p_cw_shot: w.cw_shot,
      p_cw_opponent_shot: w.cw_opponent_shot,
      p_cw_opponent_goal: w.cw_opponent_goal,
    });
    if (error) throw error;
  },

  /** Réinitialise l'échelle du club (retour aux défauts). */
  async resetRatingWeights(): Promise<void> {
    const { error } = await supabase.rpc('reset_rating_weights');
    if (error) throw error;
  },
};
