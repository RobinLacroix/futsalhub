import { supabase } from '../supabaseClient';
import type { PainReportGroup } from '@/types';
import type { PainZonePayload } from '../painMap';

type SubmitResult = { success: boolean; error?: string };

/** Joueur authentifié : signale une douleur (spontané, ou lié à une séance). */
export async function reportMyPain(
  zones: PainZonePayload[],
  note?: string | null,
  onset?: 'aigu' | 'chronique' | null,
  trainingId?: string | null,
): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('report_my_pain', {
    p_zones: zones,
    p_note: note ?? null,
    p_onset: onset ?? null,
    p_training_id: trainingId ?? null,
  });
  if (error) return { success: false, error: error.message };
  const r = data as SubmitResult | null;
  return r?.success ? { success: true } : { success: false, error: r?.error || 'Erreur' };
}

/** Via lien de questionnaire (non connecté). */
export async function reportPainByToken(
  token: string,
  zones: PainZonePayload[],
  note?: string | null,
  onset?: 'aigu' | 'chronique' | null,
): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('report_pain_by_token', {
    p_token: token,
    p_zones: zones,
    p_note: note ?? null,
    p_onset: onset ?? null,
  });
  if (error) return { success: false, error: error.message };
  const r = data as SubmitResult | null;
  return r?.success ? { success: true } : { success: false, error: r?.error || 'Erreur' };
}

/** Staff ou joueur propriétaire : historique groupé par soumission. */
export async function getPlayerPainReports(playerId: string): Promise<PainReportGroup[]> {
  const { data, error } = await supabase.rpc('get_player_pain_reports', { p_player_id: playerId });
  if (error) throw error;
  return (data as PainReportGroup[]) ?? [];
}

/** Joueur : supprime une de ses soumissions (report_group). */
export async function deleteMyPainReport(reportGroup: string): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('delete_my_pain_report', { p_report_group: reportGroup });
  if (error) return { success: false, error: error.message };
  const r = data as SubmitResult | null;
  return r?.success ? { success: true } : { success: false, error: r?.error || 'Erreur' };
}
