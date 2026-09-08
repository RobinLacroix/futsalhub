import { supabase } from '../supabaseClient';
import type { SharedContent, SharedContentType, SharedFolder } from '@/types';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const BUCKET = 'shared-content';

export interface CreateSharedLinkInput {
  clubId: string;
  /** null = partage à toutes les équipes du club (réservé aux admins) */
  teamId: string | null;
  title: string;
  description?: string;
  url: string;
  folderId?: string | null;
}

export interface CreateSharedFileInput {
  clubId: string;
  /** null = partage à toutes les équipes du club (réservé aux admins) */
  teamId: string | null;
  title: string;
  description?: string;
  file: File;
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

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

/** Types acceptés par le sélecteur de fichier ("accept" du input). */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

/**
 * Certains navigateurs (Windows en particulier) mal-détectent le mime type
 * de fichiers vidéo/image valides (ex: .mp4 rapporté comme "text/plain"),
 * ce que Supabase Storage rejette. On préfère l'extension du fichier quand
 * elle correspond à un type accepté par le formulaire.
 */
function resolveContentType(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext && EXTENSION_MIME_TYPES[ext]) return EXTENSION_MIME_TYPES[ext];
  return file.type || 'application/octet-stream';
}

async function uploadSharedContentFile(
  clubId: string,
  teamId: string | null,
  file: File
): Promise<{ path: string; size: number; mimeType: string }> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Fichier trop volumineux (50 Mo maximum).');
  }
  const scope = teamId ?? 'club';
  const path = `${clubId}/${scope}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const contentType = resolveContentType(file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType,
  });
  if (error) throw error;
  return { path, size: file.size, mimeType: contentType };
}

/**
 * Contenu partagé coach → joueurs (ressources + dossiers), team-scopé ou
 * club-wide (team_id null, réservé aux admins de club).
 * Miroir web du service mobile `sharedContent.ts`.
 */
export const sharedContentService = {
  // ─── Lecture (RPC : team-scopé + club-wide de l'équipe) ───────────────────────

  async getSharedContent(teamId: string): Promise<SharedContent[]> {
    const { data, error } = await supabase.rpc('get_team_shared_content', { p_team_id: teamId });
    if (error) throw error;
    return (data ?? []) as SharedContent[];
  },

  async getSharedFolders(teamId: string): Promise<SharedFolder[]> {
    const { data, error } = await supabase.rpc('get_team_shared_folders', { p_team_id: teamId });
    if (error) throw error;
    return (data ?? []) as SharedFolder[];
  },

  // ─── Création : lien / vidéo ────────────────────────────────────────────────

  async createSharedContent(input: CreateSharedLinkInput): Promise<SharedContent> {
    const contentType: SharedContentType = isYoutubeUrl(input.url) ? 'youtube' : 'link';
    const { data, error } = await supabase
      .from('shared_content')
      .insert({
        club_id: input.clubId,
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

  // ─── Création : fichier (upload storage puis insertion de la ligne) ──────────

  async createSharedFile(input: CreateSharedFileInput): Promise<SharedContent> {
    const { path, size, mimeType } = await uploadSharedContentFile(input.clubId, input.teamId, input.file);
    const { data, error } = await supabase
      .from('shared_content')
      .insert({
        club_id: input.clubId,
        team_id: input.teamId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        content_type: 'file',
        file_path: path,
        file_size_bytes: size,
        file_mime_type: mimeType,
        folder_id: input.folderId ?? null,
      })
      .select()
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      throw error;
    }
    return data;
  },

  /** URL signée temporaire (1h) pour consulter/télécharger un fichier partagé. */
  async getSharedFileUrl(filePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  },

  async updateSharedContent(id: string, updates: { title: string; description?: string }): Promise<SharedContent> {
    const { data, error } = await supabase
      .from('shared_content')
      .update({
        title: updates.title.trim(),
        description: updates.description?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteSharedContent(content: Pick<SharedContent, 'id' | 'content_type' | 'file_path'>): Promise<void> {
    const { error } = await supabase.from('shared_content').delete().eq('id', content.id);
    if (error) throw error;
    if (content.content_type === 'file' && content.file_path) {
      await supabase.storage.from(BUCKET).remove([content.file_path]).catch(() => {});
    }
  },

  // ─── Dossiers ──────────────────────────────────────────────────────────────────

  /** @param teamId null = dossier au niveau du club (réservé aux admins) */
  async createSharedFolder(
    clubId: string,
    teamId: string | null,
    name: string,
    parentId: string | null
  ): Promise<SharedFolder> {
    const { data, error } = await supabase
      .from('shared_content_folders')
      .insert({ club_id: clubId, team_id: teamId, name: name.trim(), parent_id: parentId })
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
