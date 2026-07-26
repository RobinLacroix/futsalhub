import { supabase } from '../supabaseClient';

export interface ClubInvitationRow {
  id: string;
  email: string;
  role: string;
  team_id: string | null;
  token: string;
  expires_at: string;
  status: string;
}

export interface ClubTeamRow {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
}

/**
 * Administration de club (membres, coachs, invitations).
 * Miroir web du service mobile `clubs.ts` (dédup complète = batch 3).
 * NB : `createUserClub` matche le comportement web (pas de première équipe
 * auto, contrairement au mobile).
 */
export const clubsService = {
  /** Ne throw pas : miroir du comportement inline (ignore l'erreur RPC). */
  async isClubAdmin(clubId: string): Promise<boolean> {
    const { data } = await supabase.rpc('is_club_admin', { p_club_id: clubId });
    return !!data;
  },

  /** Id du club de l'utilisateur connecté (ne throw pas, miroir inline). */
  async getUserClubId(): Promise<string | null> {
    const { data } = await supabase.rpc('get_user_club_id');
    return (data as string | null) ?? null;
  },

  /** Saison active du club (clubs.current_season). Ne throw pas (miroir inline). */
  async getCurrentSeason(clubId: string): Promise<string | null> {
    const { data } = await supabase
      .from('clubs')
      .select('current_season')
      .eq('id', clubId)
      .single();
    return (data?.current_season as string | undefined) ?? null;
  },

  async getClubMembers(clubId: string): Promise<(Record<string, unknown>)[]> {
    const { data, error } = await supabase
      .from('club_members')
      .select('*')
      .eq('club_id', clubId);
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  },

  /** Ne throw pas (miroir inline). */
  async listUserEmails(): Promise<{ id: string; email: string }[]> {
    const { data } = await supabase.from('users').select('id, email');
    return (data ?? []) as { id: string; email: string }[];
  },

  /** Ne throw pas (miroir inline). */
  async getClubTeams(clubId: string): Promise<ClubTeamRow[]> {
    const { data } = await supabase
      .from('teams')
      .select('id, name, category, level, color')
      .eq('club_id', clubId)
      .order('name');
    return (data ?? []) as ClubTeamRow[];
  },

  /** Ne throw pas (miroir inline). */
  async getPendingInvitations(clubId: string): Promise<ClubInvitationRow[]> {
    const { data } = await supabase
      .from('club_invitations')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());
    return (data ?? []) as ClubInvitationRow[];
  },

  /** Met à jour nom/description (+ updated_at). */
  async updateClubInfo(clubId: string, updates: { name: string; description: string }): Promise<void> {
    const { error } = await supabase
      .from('clubs')
      .update({ name: updates.name, description: updates.description, updated_at: new Date().toISOString() })
      .eq('id', clubId);
    if (error) throw error;
  },

  /** Crée le club de l'utilisateur via RPC. Retourne l'id (ou null). */
  async createUserClub(userId: string, userEmail?: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('create_user_club', {
      p_user_id: userId,
      p_user_email: userEmail ?? undefined,
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  /** Applique nom/description sur un club fraîchement créé (sans updated_at, miroir inline). */
  async setClubNameDescription(clubId: string, name: string, description: string): Promise<void> {
    const { error } = await supabase.from('clubs').update({ name, description }).eq('id', clubId);
    if (error) throw error;
  },

  async createInvitation(input: {
    clubId: string;
    email: string;
    role: string;
    teamId: string | null;
    createdBy: string;
  }): Promise<void> {
    const { error } = await supabase.from('club_invitations').insert({
      club_id: input.clubId,
      email: input.email,
      role: input.role,
      team_id: input.teamId,
      created_by: input.createdBy,
    });
    if (error) throw error;
  },

  async updateMember(memberId: string, updates: { role: string; teamId: string | null }): Promise<void> {
    const { error } = await supabase
      .from('club_members')
      .update({ role: updates.role, team_id: updates.teamId })
      .eq('id', memberId);
    if (error) throw error;
  },

  /**
   * Définit l'ensemble des équipes d'un coach (une ligne club_members par équipe).
   * Réconcilie l'existant : supprime les retirées, insère les manquantes.
   */
  async setCoachTeams(clubId: string, userId: string, teamIds: string[]): Promise<void> {
    const { data: existing, error: readErr } = await supabase
      .from('club_members')
      .select('id, team_id')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .eq('role', 'coach');
    if (readErr) throw readErr;

    const rows = (existing ?? []) as { id: string; team_id: string | null }[];
    const existingTeamIds = new Set(rows.map((r) => r.team_id).filter((t): t is string => !!t));
    const target = new Set(teamIds);

    const toDelete = rows.filter((r) => !r.team_id || !target.has(r.team_id)).map((r) => r.id);
    if (toDelete.length > 0) {
      const { error } = await supabase.from('club_members').delete().in('id', toDelete);
      if (error) throw error;
    }

    const toInsert = teamIds
      .filter((tid) => !existingTeamIds.has(tid))
      .map((tid) => ({ club_id: clubId, user_id: userId, role: 'coach', team_id: tid }));
    if (toInsert.length > 0) {
      const { error } = await supabase.from('club_members').insert(toInsert);
      if (error) throw error;
    }
  },

  async removeCoach(clubId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('club_members')
      .delete()
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .eq('role', 'coach');
    if (error) throw error;
  },

  async removeClubMember(memberId: string): Promise<void> {
    const { error } = await supabase.from('club_members').delete().eq('id', memberId);
    if (error) throw error;
  },

  async deleteClub(clubId: string): Promise<void> {
    const { error } = await supabase.from('clubs').delete().eq('id', clubId);
    if (error) throw error;
  },

  async expireInvitation(id: string): Promise<void> {
    const { error } = await supabase.from('club_invitations').update({ status: 'expired' }).eq('id', id);
    if (error) throw error;
  },
};
