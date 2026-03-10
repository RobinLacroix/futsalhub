import { supabase } from '../supabase';

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
      return { clubId, teamId: team.id };
    }
  }
  return { clubId };
}
