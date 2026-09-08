import { supabase } from '../supabase';
import type { TeamFeedPost, TeamFeedComment } from '../../types';

type Result = { success: boolean; error?: string };

/** Fil paginé d'une équipe, du plus récent au plus ancien. */
export async function getTeamFeed(
  teamId: string,
  before?: string | null,
  limit = 20,
): Promise<TeamFeedPost[]> {
  const { data, error } = await supabase.rpc('get_team_feed', {
    p_team_id: teamId,
    p_limit: limit,
    p_before: before ?? null,
  });
  if (error) throw error;
  return (data as TeamFeedPost[]) ?? [];
}

/** Un seul post (écran de détail). Null si supprimé ou inaccessible. */
export async function getTeamPost(postId: string): Promise<TeamFeedPost | null> {
  const { data, error } = await supabase.rpc('get_team_post', { p_post_id: postId });
  if (error) throw error;
  return (data as TeamFeedPost | null) ?? null;
}

/** Staff uniquement : publie un post, avec joueurs taggés en option. */
export async function createTeamPost(
  teamId: string,
  content: string,
  playerTags: string[] = [],
): Promise<Result & { post_id?: string }> {
  const { data, error } = await supabase.rpc('create_team_post', {
    p_team_id: teamId,
    p_content: content,
    p_player_tags: playerTags,
  });
  if (error) return { success: false, error: error.message };
  return (data as Result & { post_id?: string }) ?? { success: false, error: 'Erreur' };
}

/** Auteur uniquement. */
export async function updateTeamPost(postId: string, content: string): Promise<Result> {
  const { data, error } = await supabase.rpc('update_team_post', {
    p_post_id: postId,
    p_content: content,
  });
  if (error) return { success: false, error: error.message };
  return (data as Result) ?? { success: false, error: 'Erreur' };
}

/** Auteur ou staff (modération) : suppression douce. */
export async function deleteTeamPost(postId: string): Promise<Result> {
  const { data, error } = await supabase.rpc('delete_team_post', { p_post_id: postId });
  if (error) return { success: false, error: error.message };
  return (data as Result) ?? { success: false, error: 'Erreur' };
}

export async function getPostComments(postId: string): Promise<TeamFeedComment[]> {
  const { data, error } = await supabase.rpc('get_post_comments', { p_post_id: postId });
  if (error) throw error;
  return (data as TeamFeedComment[]) ?? [];
}

export async function addPostComment(
  postId: string,
  content: string,
): Promise<Result & { comment_id?: string }> {
  const { data, error } = await supabase.rpc('add_post_comment', {
    p_post_id: postId,
    p_content: content,
  });
  if (error) return { success: false, error: error.message };
  return (data as Result & { comment_id?: string }) ?? { success: false, error: 'Erreur' };
}

export async function updatePostComment(commentId: string, content: string): Promise<Result> {
  const { data, error } = await supabase.rpc('update_post_comment', {
    p_comment_id: commentId,
    p_content: content,
  });
  if (error) return { success: false, error: error.message };
  return (data as Result) ?? { success: false, error: 'Erreur' };
}

export async function deletePostComment(commentId: string): Promise<Result> {
  const { data, error } = await supabase.rpc('delete_post_comment', { p_comment_id: commentId });
  if (error) return { success: false, error: error.message };
  return (data as Result) ?? { success: false, error: 'Erreur' };
}

// ─── V2 : posts système (bouton "Partager dans le fil") ────────────────────────

type ShareResult = Result & { post_id?: string };

/** Staff : partage la convocation d'un entraînement (training XOR match). */
export async function shareConvocationToFeed(params: {
  trainingId?: string;
  matchId?: string;
}): Promise<ShareResult> {
  const { data, error } = await supabase.rpc('share_convocation_to_feed', {
    p_training_id: params.trainingId ?? null,
    p_match_id: params.matchId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return (data as ShareResult) ?? { success: false, error: 'Erreur' };
}

/** Staff : partage le digest des 7 prochains jours pour une équipe. */
export async function shareWeeklyPlanningToFeed(teamId: string): Promise<ShareResult> {
  const { data, error } = await supabase.rpc('share_weekly_planning_to_feed', { p_team_id: teamId });
  if (error) return { success: false, error: error.message };
  return (data as ShareResult) ?? { success: false, error: 'Erreur' };
}

/** Staff : partage un contenu du module Partage (vidéo/lien) dans le fil. */
export async function shareVideoToFeed(sharedContentId: string): Promise<ShareResult> {
  const { data, error } = await supabase.rpc('share_video_to_feed', { p_shared_content_id: sharedContentId });
  if (error) return { success: false, error: error.message };
  return (data as ShareResult) ?? { success: false, error: 'Erreur' };
}
