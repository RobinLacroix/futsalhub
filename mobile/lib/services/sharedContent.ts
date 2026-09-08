import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '../supabase';
import type { SharedContent, SharedContentType, SharedFolder } from '../../types';

export type { SharedContent, SharedContentType, SharedFolder };

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const BUCKET = 'shared-content';

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

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

/** Types acceptés par le picker (`expo-document-picker`, cf. écran de partage). */
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
 * `file.mimeType` d'`expo-document-picker` peut être vide selon le picker
 * d'origine (Android `content://` notamment), ce que Supabase Storage
 * rejetait avec « mime type text/plain is not supported » une fois retombé
 * sur un `blob.type` tout aussi peu fiable — même bug que côté web
 * (`lib/services/sharedContentService.ts`, `resolveContentType`), même
 * correctif : préférer l'extension du fichier, connue et non ambiguë pour
 * les types que ce formulaire accepte.
 */
function resolveContentType(file: Pick<PickedFile, 'name' | 'mimeType'>): string {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext && EXTENSION_MIME_TYPES[ext]) return EXTENSION_MIME_TYPES[ext];
  return file.mimeType || 'application/octet-stream';
}

// ─── Lecture (RPC : team-scopé + club-wide de l'équipe) ────────────────────────

export async function getSharedContent(teamId: string): Promise<SharedContent[]> {
  const { data, error } = await supabase.rpc('get_team_shared_content', { p_team_id: teamId });
  if (error) throw error;
  return (data ?? []) as SharedContent[];
}

/** Pour un joueur : récupère le contenu via RPC SECURITY DEFINER (bypass RLS player_teams). */
export async function getSharedContentForPlayer(_playerId: string): Promise<SharedContent[]> {
  const { data, error } = await supabase.rpc('get_my_shared_content');
  if (error) throw error;
  return (data ?? []) as SharedContent[];
}

// ─── Création : lien / vidéo ────────────────────────────────────────────────────

export interface CreateSharedContentInput {
  clubId: string;
  /** null = partage à toutes les équipes du club (réservé aux admins) */
  teamId: string | null;
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
}

// ─── Création : fichier (upload storage puis insertion de la ligne) ────────────

export interface PickedFile {
  /** file:// (ou content://) URI renvoyée par expo-document-picker */
  uri: string;
  name: string;
  mimeType?: string | null;
  /** Taille en octets si connue (expo-document-picker la fournit en général) */
  size?: number | null;
}

export interface CreateSharedFileInput {
  clubId: string;
  /** null = partage à toutes les équipes du club (réservé aux admins) */
  teamId: string | null;
  title: string;
  description?: string;
  file: PickedFile;
  folderId?: string | null;
}

async function uploadSharedContentFile(
  clubId: string,
  teamId: string | null,
  file: PickedFile
): Promise<{ path: string; size: number; mimeType: string }> {
  if (file.size != null && file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Fichier trop volumineux (50 Mo maximum).');
  }

  // `fetch(uri).blob()` casse l'upload Supabase Storage en React Native : le
  // Blob du polyfill fetch RN n'implémente pas tout ce que `storage-js`
  // attend en interne et l'upload échoue avec « undefined is not a function »
  // (en plus de son `.type` déjà peu fiable, cf. `resolveContentType`). Le
  // contournement documenté côté Supabase pour RN est de lire le fichier en
  // base64 (`expo-file-system`, même pattern que la lecture du modèle
  // d'import dans `import-players.tsx`) puis de le décoder en ArrayBuffer.
  const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
  const arrayBuffer = decodeBase64(base64);
  if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error('Fichier trop volumineux (50 Mo maximum).');
  }

  const scope = teamId ?? 'club';
  const path = `${clubId}/${scope}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const mimeType = resolveContentType(file);

  const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, { contentType: mimeType });
  if (error) throw error;

  return { path, size: arrayBuffer.byteLength, mimeType };
}

export async function createSharedFile(input: CreateSharedFileInput): Promise<SharedContent> {
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
}

/** URL signée temporaire (1h) pour consulter/télécharger un fichier partagé. */
export async function getSharedFileUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function updateSharedContent(
  id: string,
  updates: { title: string; description?: string }
): Promise<SharedContent> {
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
}

export async function deleteSharedContent(
  content: Pick<SharedContent, 'id' | 'content_type' | 'file_path'>
): Promise<void> {
  const { error } = await supabase.from('shared_content').delete().eq('id', content.id);
  if (error) throw error;
  if (content.content_type === 'file' && content.file_path) {
    await supabase.storage.from(BUCKET).remove([content.file_path]).catch(() => {});
  }
}

// ─── Folders ──────────────────────────────────────────────────────────────────

export async function getSharedFolders(teamId: string): Promise<SharedFolder[]> {
  const { data, error } = await supabase.rpc('get_team_shared_folders', { p_team_id: teamId });
  if (error) throw error;
  return (data ?? []) as SharedFolder[];
}

export async function getSharedFoldersForPlayer(_playerId: string): Promise<SharedFolder[]> {
  const { data, error } = await supabase.rpc('get_my_shared_folders');
  if (error) throw error;
  return (data ?? []) as SharedFolder[];
}

/** @param teamId null = dossier au niveau du club (réservé aux admins) */
export async function createSharedFolder(
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
