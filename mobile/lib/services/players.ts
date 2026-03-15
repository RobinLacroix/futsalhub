import { supabase } from '../supabase';
import type { Player, PlayerStatus, Team } from '../../types';

export interface PlayerWithTeams {
  player: Player;
  teamIds: string[];
  teamNames: string[];
}

/** Tous les joueurs du club avec leurs équipes (pour convocations cross-équipes). */
export async function getPlayersByClubWithTeams(clubId: string): Promise<PlayerWithTeams[]> {
  const { data: teamsData, error: teamsError } = await supabase
    .from('teams')
    .select('id, name')
    .eq('club_id', clubId);
  if (teamsError) throw teamsError;
  const teamIds = (teamsData ?? []).map((t: { id: string }) => t.id);
  const teamNamesById = new Map((teamsData ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  if (teamIds.length === 0) return [];

  const { data: ptData, error: ptError } = await supabase
    .from('player_teams')
    .select(
      'player_id, team_id, players (id, first_name, last_name, age, position, strong_foot, status, number)'
    )
    .in('team_id', teamIds);
  if (ptError) throw ptError;

  const byPlayer = new Map<string, { player: Player; teamIds: Set<string> }>();
  for (const row of ptData ?? []) {
    const r = row as { players: Player | null; player_id: string; team_id: string };
    if (!r.players) continue;
    const playerId = r.player_id;
    const teamId = r.team_id;
    if (!byPlayer.has(playerId)) {
      byPlayer.set(playerId, { player: r.players as Player, teamIds: new Set() });
    }
    byPlayer.get(playerId)!.teamIds.add(teamId);
  }
  return Array.from(byPlayer.entries())
    .map(([, { player, teamIds: ids }]) => ({
      player,
      teamIds: Array.from(ids),
      teamNames: Array.from(ids).map((id) => teamNamesById.get(id) ?? '').filter(Boolean),
    }))
    .sort((a, b) => (a.player.last_name || '').localeCompare(b.player.last_name || '', 'fr'));
}

export async function getPlayersByTeam(teamId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('player_teams')
    .select('player_id, players (*)')
    .eq('team_id', teamId);

  if (error) throw error;

  const players = (data ?? [])
    .map((item: { players: Player | null }) => item.players)
    .filter(Boolean) as Player[];

  return players.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
}

export interface CreatePlayerInput {
  first_name: string;
  last_name: string;
  age: number;
  position: string;
  strong_foot: string;
  number?: number;
}

export async function createPlayer(teamId: string, input: CreatePlayerInput): Promise<Player> {
  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      age: input.age,
      position: input.position,
      strong_foot: input.strong_foot,
      status: 'active',
      number: input.number ?? null,
      sequence_time_limit: 180,
    })
    .select()
    .single();
  if (playerError) throw playerError;

  const { error: relationError } = await supabase
    .from('player_teams')
    .insert({ player_id: player.id, team_id: teamId });
  if (relationError) throw relationError;

  return player;
}

export async function deletePlayer(playerId: string): Promise<void> {
  const { error } = await supabase.from('players').delete().eq('id', playerId);
  if (error) throw error;
}

export async function getPlayerById(playerId: string): Promise<Player | null> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single();
  if (error) return null;
  return data;
}

/** Équipes auxquelles le joueur est assigné (relation player_teams). */
export async function getPlayerTeams(playerId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from('player_teams')
    .select('team_id, teams(id, name, category, level, color)')
    .eq('player_id', playerId);
  if (error) throw error;
  const teams = (data ?? [])
    .map((row: { teams: Team | null }) => row.teams)
    .filter(Boolean) as Team[];
  return teams.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/** Assigne le joueur à une équipe (ajout dans player_teams). */
export async function addPlayerToTeam(playerId: string, teamId: string): Promise<void> {
  const { error } = await supabase
    .from('player_teams')
    .insert({ player_id: playerId, team_id: teamId });
  if (error) throw error;
}

/** Retire le joueur d’une équipe. */
export async function removePlayerFromTeam(playerId: string, teamId: string): Promise<void> {
  const { error } = await supabase
    .from('player_teams')
    .delete()
    .eq('player_id', playerId)
    .eq('team_id', teamId);
  if (error) throw error;
}

export async function getPlayerByUserId(userId: string): Promise<Player | null> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function getPlayerStats(
  playerId: string,
  teamId: string
): Promise<{
  matches_played: number;
  goals: number;
  training_attendance: number;
  attendance_percentage: number;
  victories: number;
  draws: number;
  defeats: number;
}> {
  const { data: matchesData, error: matchesError } = await supabase
    .from('matches')
    .select('players, score_team, score_opponent')
    .eq('team_id', teamId);
  if (matchesError) throw matchesError;

  const { data: trainingsData, error: trainingsError } = await supabase
    .from('trainings')
    .select('attendance')
    .eq('team_id', teamId);
  if (trainingsError) throw trainingsError;

  const matches = matchesData ?? [];
  const trainings = trainingsData ?? [];

  const matchesPlayed = matches.filter((m) => {
    if (!m.players) return false;
    try {
      const arr = Array.isArray(m.players) ? m.players : JSON.parse(m.players as string);
      return arr.some((p: { id: string }) => p.id === playerId);
    } catch {
      return false;
    }
  }).length;

  const goals = matches.reduce((sum, m) => {
    if (!m.players) return sum;
    try {
      const arr = Array.isArray(m.players) ? m.players : JSON.parse(m.players as string);
      const p = arr.find((x: { id: string; goals?: number }) => x.id === playerId);
      return sum + (p?.goals ?? 0);
    } catch {
      return sum;
    }
  }, 0);

  const trainingAttendance = trainings.filter((t) => {
    const att = t.attendance as Record<string, PlayerStatus> | null;
    if (!att) return false;
    const s = att[playerId];
    return s === 'present' || s === 'late';
  }).length;

  const totalRecordedTrainings = trainings.filter((t) => {
    const att = t.attendance as Record<string, PlayerStatus> | null;
    if (!att) return false;
    const s = att[playerId];
    return s === 'present' || s === 'late' || s === 'absent' || s === 'injured';
  }).length;

  const attendance_percentage =
    totalRecordedTrainings > 0 ? Math.round((trainingAttendance / totalRecordedTrainings) * 100) : 0;

  let victories = 0;
  let draws = 0;
  let defeats = 0;
  matches.forEach((m) => {
    if (!m.players) return;
    try {
      const arr = Array.isArray(m.players) ? m.players : JSON.parse(m.players as string);
      const p = arr.find((x: { id: string }) => x.id === playerId);
      if (p) {
        const st = Number(m.score_team) || 0;
        const so = Number(m.score_opponent) || 0;
        if (st > so) victories++;
        else if (st < so) defeats++;
        else draws++;
      }
    } catch {
      // ignore
    }
  });

  return {
    matches_played: matchesPlayed,
    goals,
    training_attendance: trainingAttendance,
    attendance_percentage,
    victories,
    draws,
    defeats,
  };
}
