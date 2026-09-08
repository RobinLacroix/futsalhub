import { supabase } from '../supabase';
import type {
  CoachEvaluation,
  MatchPlayerCoachNote,
  MatchPlayerRating,
  MatchPlayerRatingRow,
  RatingWeights,
  RatingWeightsResult,
} from '../../types';

/**
 * Système d'évaluation de match (mobile).
 * Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md
 *
 * Volet A — évaluation coach : lecture/écriture de matches.coach_evaluation.
 * Volet B — note data joueur : lecture seule via la RPC get_match_player_ratings
 *           (calcul en base à partir de match_events, jamais figé).
 * Volet C — note staff : lecture/écriture directe de la table match_player_coach_notes,
 *           strictement staff-only (RLS sans policy joueur, voir la migration).
 */

/** Volet B : notes /10 des joueurs de champ d'un match (triées par note décroissante). */
export async function getMatchPlayerRatings(matchId: string): Promise<MatchPlayerRating[]> {
  const { data, error } = await supabase.rpc('get_match_player_ratings', {
    p_match_id: matchId,
  });

  if (error) throw error;
  return (data ?? []) as MatchPlayerRating[];
}

/**
 * Volet B (set-based) : notes par (match, joueur) sur un lot de matchs, en un seul appel.
 * À agréger côté client : moyenne par joueur (analytics), série par date (courbe page joueur).
 */
export async function getMatchPlayerRatingsBulk(
  matchIds: string[]
): Promise<MatchPlayerRatingRow[]> {
  if (matchIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_match_player_ratings_bulk', {
    p_match_ids: matchIds,
  });

  if (error) throw error;
  return (data ?? []) as MatchPlayerRatingRow[];
}

/** Volet A : enregistre (ou efface avec null) l'évaluation qualitative coach d'un match. */
export async function setMatchCoachEvaluation(
  matchId: string,
  evaluation: CoachEvaluation | null
): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({ coach_evaluation: evaluation })
    .eq('id', matchId);

  if (error) throw error;
}

/** Échelle de notation du club de l'utilisateur (défauts si non personnalisée). */
export async function getRatingWeights(): Promise<RatingWeightsResult> {
  const { data, error } = await supabase.rpc('get_rating_weights');
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as RatingWeightsResult;
}

/** Enregistre l'échelle de notation personnalisée du club de l'utilisateur. */
export async function setRatingWeights(w: RatingWeights): Promise<void> {
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
}

/** Réinitialise l'échelle du club (retour aux défauts). */
export async function resetRatingWeights(): Promise<void> {
  const { error } = await supabase.rpc('reset_rating_weights');
  if (error) throw error;
}

/** Volet C : notes staff d'un match, clé = player_id. Staff-only (RLS). */
export async function getCoachNotes(matchId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('match_player_coach_notes')
    .select('player_id, note')
    .eq('match_id', matchId);

  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.player_id] = row.note;
  return map;
}

/** Volet C : enregistre (note non nulle) ou efface (note = null) la note staff d'un joueur. */
export async function setCoachNote(
  matchId: string,
  playerId: string,
  note: number | null
): Promise<void> {
  if (note === null) {
    const { error } = await supabase
      .from('match_player_coach_notes')
      .delete()
      .eq('match_id', matchId)
      .eq('player_id', playerId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('match_player_coach_notes')
    .upsert(
      { match_id: matchId, player_id: playerId, note, updated_at: new Date().toISOString() },
      { onConflict: 'match_id,player_id' }
    );
  if (error) throw error;
}

/**
 * Volet C (set-based) : notes staff par (match, joueur) sur un lot de matchs, pour la
 * courbe page joueur. À joindre côté client avec les dates des matchs déjà chargés.
 */
export async function getCoachNotesForMatches(matchIds: string[]): Promise<MatchPlayerCoachNote[]> {
  if (matchIds.length === 0) return [];
  const { data, error } = await supabase
    .from('match_player_coach_notes')
    .select('match_id, player_id, note')
    .in('match_id', matchIds);

  if (error) throw error;
  return (data ?? []) as MatchPlayerCoachNote[];
}
