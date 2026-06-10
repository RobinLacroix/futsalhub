import { supabase } from '../supabase';
import type { SharedContent, SharedContentType, SharedFolder } from '../../types';

export type { SharedContent, SharedContentType, SharedFolder };

/** Extrait l'ID d'une URL YouTube (watch?v= ou youtu.be/) */
export function extractYoutubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url);
}

export function youtubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export async function getSharedContent(teamId: string): Promise<SharedContent[]> {
  const { data, error } = await supabase
    .from('shared_content')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Pour un joueur : récupère le contenu via RPC SECURITY DEFINER (bypass RLS player_teams). */
export async function getSharedContentForPlayer(_playerId: string): Promise<SharedContent[]> {
  const { data, error } = await supabase.rpc('get_my_shared_content');
  if (error) throw error;
  return (data ?? []) as SharedContent[];
}

export interface CreateSharedContentInput {
  teamId: string;
  title: string;
  description?: string;
  url: string;
  folderId?: string | null;
}

export async function createSharedContent(input: CreateSharedContentInput): Promise<SharedContent> {
  const contentType: SharedContentType = isYoutubeUrl(input.url) ? 'youtube' : 'link';
  const { data, error } = await supabase
    .from('shared_content')
    .insert({
      team_id: input.teamId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      content_type: contentType,
      url: input.url.trim(),
      folder_id: input.folderId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSharedContent(id: string): Promise<void> {
  const { error } = await supabase.from('shared_content').delete().eq('id', id);
  if (error) throw error;
}

// ─── Folders ──────────────────────────────────────────────────────────────────

export async function getSharedFolders(teamId: string): Promise<SharedFolder[]> {
  const { data, error } = await supabase
    .from('shared_content_folders')
    .select('*')
    .eq('team_id', teamId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getSharedFoldersForPlayer(_playerId: string): Promise<SharedFolder[]> {
  const { data, error } = await supabase.rpc('get_my_shared_folders');
  if (error) throw error;
  return (data ?? []) as SharedFolder[];
}

export async function createSharedFolder(teamId: string, name: string, parentId: string | null): Promise<SharedFolder> {
  const { data, error } = await supabase
    .from('shared_content_folders')
    .insert({ team_id: teamId, name: name.trim(), parent_id: parentId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameSharedFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('shared_content_folders')
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSharedFolder(id: string): Promise<void> {
  const { error } = await supabase.from('shared_content_folders').delete().eq('id', id);
  if (error) throw error;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

/** Enregistre l'ouverture d'un contenu par le joueur connecté (fire & forget). */
export async function logSharedContentView(contentId: string): Promise<void> {
  try {
    await supabase.rpc('log_shared_content_view', { p_content_id: contentId });
  } catch { /* non-critique */ }
}

export interface ContentAnalyticsRow {
  content_id:    string;
  content_title: string;
  content_type:  string;
  folder_name:   string | null;
  player_id:     string | null;
  player_name:   string | null;
  viewed_at:     string | null;
}

/** Récupère les analytiques d'ouverture pour une équipe (coach). */
export async function getSharedContentAnalytics(teamId: string): Promise<ContentAnalyticsRow[]> {
  const { data, error } = await supabase.rpc('get_shared_content_analytics', { p_team_id: teamId });
  if (error) throw error;
  return (data ?? []) as ContentAnalyticsRow[];
}
