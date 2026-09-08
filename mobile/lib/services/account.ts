import { supabase } from '../supabase';

export type DeleteOwnAccountResult =
  | { ok: true }
  | { ok: false; error: 'sole_club_admin'; clubName: string }
  | { ok: false; error: string };

export async function deleteOwnAccount(): Promise<DeleteOwnAccountResult> {
  const { data, error } = await supabase.rpc('delete_own_account');
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string; club_name?: string } | null;
  if (result?.ok) return { ok: true };
  if (result?.error === 'sole_club_admin') {
    return { ok: false, error: 'sole_club_admin', clubName: result.club_name ?? 'ce club' };
  }
  return { ok: false, error: result?.error ?? 'unknown' };
}
