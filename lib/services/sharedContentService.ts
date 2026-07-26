import { supabase } from '../supabaseClient';
import type { SharedContent, SharedContentType, SharedFolder } from '@/types';

export interface CreateSharedContentInput {
  teamId: string;
  title: string;
  description?: string;
  url: string;
  folderId?: string | null;
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

function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url);
}

/**
 * Contenu partagé coach → joueurs (ressources + dossiers).
 * Miroir web du service mobile `sharedContent.ts` (dédup complète = batch 3).
 */
export const sharedContentService = {
  async getSharedContent(teamId: string): Promise<SharedContent[]> {
    const { data, error } = await supabase
      .from('shared_content')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async getSharedFolders(teamId: string): Promise<SharedFolder[]> {
    const { data, error } = await supabase
      .from('shared_content_folders')
      .select('*')
      .eq('team_id', teamId)
      .order('name');
    if (error) throw error;
    return data ?? [];
  },

  async createSharedContent(input: CreateSharedContentInput): Promise<SharedContent> {
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
  },

  async deleteSharedContent(id: string): Promise<void> {
    const { error } = await supabase.from('shared_content').delete().eq('id', id);
    if (error) throw error;
  },

  async createSharedFolder(teamId: string, name: string, parentId: string | null): Promise<SharedFolder> {
    const { data, error } = await supabase
      .from('shared_content_folders')
      .insert({ team_id: teamId, name: name.trim(), parent_id: parentId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async renameSharedFolder(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from('shared_content_folders')
      .update({ name: name.trim() })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteSharedFolder(id: string): Promise<void> {
    const { error } = await supabase.from('shared_content_folders').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── Côté joueur (RPC SECURITY DEFINER, bypass RLS player_teams) ──────────────

  async getSharedContentForPlayer(): Promise<SharedContent[]> {
    const { data, error } = await supabase.rpc('get_my_shared_content');
    if (error) throw error;
    return (data ?? []) as SharedContent[];
  },

  async getSharedFoldersForPlayer(): Promise<SharedFolder[]> {
    const { data, error } = await supabase.rpc('get_my_shared_folders');
    if (error) throw error;
    return (data ?? []) as SharedFolder[];
  },

  /** Enregistre l'ouverture d'un contenu par le joueur connecté (fire & forget). */
  async logSharedContentView(contentId: string): Promise<void> {
    try {
      await supabase.rpc('log_shared_content_view', { p_content_id: contentId });
    } catch { /* non-critique */ }
  },

  async getSharedContentAnalytics(teamId: string): Promise<ContentAnalyticsRow[]> {
    const { data, error } = await supabase.rpc('get_shared_content_analytics', { p_team_id: teamId });
    if (error) throw error;
    return (data ?? []) as ContentAnalyticsRow[];
  },
};
