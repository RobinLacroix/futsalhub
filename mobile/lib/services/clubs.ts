import { supabase } from '../supabase';

export async function isClubAdmin(clubId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_club_admin', { p_club_id: clubId });
  if (error) return false;
  return !!data;
}

/** Saison active du club ("YYYY-YYYY"), ou null si non définie. */
export async function getCurrentSeason(clubId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select('current_season')
    .eq('id', clubId)
    .single();
  if (error) throw error;
  return (data?.current_season as string) ?? null;
}

/**
 * Avance la saison active du club (rollover). Réservé admin/coach côté DB.
 * Les nouveaux matchs/entraînements seront alors taggés sur cette saison.
 */
export async function advanceClubSeason(clubId: string, newSeason: string): Promise<string> {
  const { data, error } = await supabase.rpc('advance_club_season', {
    p_club_id: clubId,
    p_new_season: newSeason,
  });
  if (error) throw error;
  return data as string;
}

export interface ClubMemberWithUser {
  id: string;
  user_id: string;
  role: string;
  team_id: string | null;
  email?: string;
  first_name?: string;
  last_name?: string;
}

/** Membres du club avec email/nom pour affichage. */
export async function getClubMembersWithProfiles(clubId: string): Promise<ClubMemberWithUser[]> {
  const { data: members, error: mErr } = await supabase
    .from('club_members')
    .select('id, user_id, role, team_id')
    .eq('club_id', clubId);
  if (mErr) throw mErr;
  if (!members?.length) return [];
  const userIds = [...new Set(members.map((m: { user_id: string }) => m.user_id))];
  const { data: users } = await supabase
    .from('users')
    .select('id, email, first_name, last_name')
    .in('id', userIds);
  const usersMap = new Map(
    (users || []).map((u: { id: string; email?: string; first_name?: string; last_name?: string }) => [
      u.id,
      { email: u.email ?? '', first_name: u.first_name ?? '', last_name: u.last_name ?? '' },
    ])
  );
  return members.map((m: { id: string; user_id: string; role: string; team_id: string | null }) => {
    const u = usersMap.get(m.user_id);
    return {
      ...m,
      email: u?.email,
      first_name: u?.first_name,
      last_name: u?.last_name,
    };
  });
}

/** Entraîneur principal de l'équipe (club_member avec role=coach). */
export async function getTeamMainCoach(teamId: string): Promise<{ user_id: string; email?: string; label?: string } | null> {
  const { data: team } = await supabase.from('teams').select('club_id').eq('id', teamId).single();
  if (!team?.club_id) return null;
  const { data: coachRow } = await supabase
    .from('club_members')
    .select('user_id')
    .eq('club_id', team.club_id)
    .eq('team_id', teamId)
    .eq('role', 'coach')
    .limit(1)
    .maybeSingle();
  if (!coachRow?.user_id) return null;
  const { data: user } = await supabase
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('id', coachRow.user_id)
    .single();
  const label = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || undefined
    : undefined;
  return { user_id: coachRow.user_id, email: user?.email, label };
}

/** Définit l'entraîneur principal de l'équipe. Une seule entrée coach par équipe. */
export async function setTeamMainCoach(teamId: string, userId: string): Promise<void> {
  const { data: team } = await supabase.from('teams').select('club_id').eq('id', teamId).single();
  if (!team?.club_id) throw new Error('Équipe introuvable');
  const clubId = team.club_id;
  await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId)
    .eq('team_id', teamId)
    .eq('role', 'coach');
  const { error } = await supabase.from('club_members').insert({
    user_id: userId,
    club_id: clubId,
    role: 'coach',
    team_id: teamId,
  });
  if (error) throw error;
}

export async function getUserClubId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_user_club_id');
  if (error) throw error;
  const id = Array.isArray(data) ? data?.[0] : data;
  return typeof id === 'string' ? id : null;
}

export interface CreateClubInput {
  name: string;
  description?: string;
  createFirstTeam?: boolean;
}

export async function getClubInfo(clubId: string): Promise<{ id: string; name: string; description: string | null }> {
  const { data, error } = await supabase
    .from('clubs')
    .select('id, name, description')
    .eq('id', clubId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateClubInfo(
  clubId: string,
  updates: { name?: string; description?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('clubs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', clubId);
  if (error) throw error;
}

export async function deleteClub(clubId: string): Promise<void> {
  const { error } = await supabase.from('clubs').delete().eq('id', clubId);
  if (error) throw error;
}

export async function removeClubMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('club_members').delete().eq('id', memberId);
  if (error) throw error;
}

/** Réaffecte un membre (coach) à une équipe. teamId null = aucune équipe. */
export async function updateClubMemberTeam(memberId: string, teamId: string | null): Promise<void> {
  const { error } = await supabase
    .from('club_members')
    .update({ team_id: teamId })
    .eq('id', memberId);
  if (error) throw error;
}

export async function createClubInvitation(
  clubId: string,
  email: string,
  role: 'admin' | 'coach' | 'viewer',
  teamId?: string | null,
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté');
  const { data, error } = await supabase
    .from('club_invitations')
    .insert({ club_id: clubId, email, role, team_id: teamId ?? null, created_by: user.id })
    .select('token')
    .single();
  if (error) throw error;
  return (data as any).token as string;
}

export async function acceptClubInvitation(token: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté');
  const { data, error } = await supabase.rpc('accept_club_invitation', {
    p_token: token,
    p_user_id: user.id,
  });
  if (error) throw error;
  return data as string;
}

export async function createUserClub(input: CreateClubInput): Promise<{ clubId: string; teamId?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté');

  const { data: clubIdRaw, error: rpcError } = await supabase.rpc('create_user_club', {
    p_user_id: user.id,
    p_user_email: user.email ?? undefined,
  });
  if (rpcError) throw rpcError;
  const clubId = Array.isArray(clubIdRaw) ? clubIdRaw[0] : clubIdRaw;
  if (!clubId) throw new Error('Impossible de créer le club');

  const { error: updateError } = await supabase
    .from('clubs')
    .update({
      name: input.name.trim() || 'Mon club',
      description: (input.description?.trim()) || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clubId);
  if (updateError) throw updateError;

  if (input.createFirstTeam !== false) {
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        club_id: clubId,
        name: 'Équipe principale',
        category: 'Senior',
        level: 'A',
        color: '#3b82f6',
      })
      .select('id')
      .single();
    if (!teamError && team) {
      try {
        await setTeamMainCoach(team.id, user.id);
      } catch (_) {
        /* ignore */
      }
      return { clubId, teamId: team.id };
    }
  }
  return { clubId };
}
