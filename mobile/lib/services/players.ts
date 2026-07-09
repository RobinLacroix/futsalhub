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
      'player_id, team_id, players (id, first_name, last_name, birth_date, position, strong_foot, status, number)'
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
    .filter((p): p is Player => p != null && p.status !== 'left');

  return players.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
}

export interface CreatePlayerInput {
  first_name: string;
  last_name: string;
  birth_date?: string;
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
      birth_date: input.birth_date || null,
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

/** Soft delete : marque le joueur comme "left" au lieu de supprimer.
 * Le joueur reste en base pour préserver les stats des matchs (Analytics).
 * Il est masqué de l'Effectif et du Dashboard. */
export async function deletePlayer(playerId: string): Promise<void> {
  const { error } = await supabase.from('players').update({ status: 'left' }).eq('id', playerId);
  if (error) throw error;
}

export async function updatePlayer(
  playerId: string,
  data: Partial<Omit<Player, 'id' | 'created_at' | 'updated_at'>>,
): Promise<Player> {
  const { data: updated, error } = await supabase
    .from('players')
    .update(data)
    .eq('id', playerId)
    .select()
    .single();
  if (error) throw error;
  return updated as Player;
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

export type MatchTypeFilter = 'all' | 'Championnat' | 'Coupe' | 'Amical';

export async function getPlayerStats(
  playerId: string,
  teamId: string,
  matchTypeFilter: MatchTypeFilter = 'all',
  season?: string
): Promise<{
  matches_played: number;
  goals: number;
  training_attendance: number;
  attendance_percentage: number;
  victories: number;
  draws: number;
  defeats: number;
}> {
  let matchesQ = supabase
    .from('matches')
    .select('competition, players, score_team, score_opponent')
    .eq('team_id', teamId);
  if (season) matchesQ = matchesQ.eq('season', season);
  const { data: matchesData, error: matchesError } = await matchesQ;
  if (matchesError) throw matchesError;

  let trainingsQ = supabase
    .from('trainings')
    .select('attendance')
    .eq('team_id', teamId);
  if (season) trainingsQ = trainingsQ.eq('season', season);
  const { data: trainingsData, error: trainingsError } = await trainingsQ;
  if (trainingsError) throw trainingsError;

  const allMatches = matchesData ?? [];
  const matches =
    matchTypeFilter === 'all'
      ? allMatches
      : allMatches.filter((m) => {
          const comp = (m.competition ?? '').toString().trim();
          return comp.toLowerCase() === matchTypeFilter.toLowerCase();
        });
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

export interface PlayerSquadStat {
  matches: number;
  goals: number;
  seances: number; // séances présent ou en retard
}

/**
 * Calcule les stats (matchs, buts, séances) pour tous les joueurs d'une équipe
 * en un seul aller-retour base de données.
 */
export async function getSquadBulkStats(
  teamId: string,
  filter: MatchTypeFilter = 'all',
  season?: string,
): Promise<Record<string, PlayerSquadStat>> {
  let matchesQ = supabase
    .from('matches')
    .select('competition, players, score_team, score_opponent')
    .eq('team_id', teamId);
  if (season) matchesQ = matchesQ.eq('season', season);
  let trainingsQ = supabase
    .from('trainings')
    .select('attendance')
    .eq('team_id', teamId);
  if (season) trainingsQ = trainingsQ.eq('season', season);
  const [{ data: matchesData }, { data: trainingsData }] = await Promise.all([
    matchesQ,
    trainingsQ,
  ]);

  const allMatches = matchesData ?? [];
  const matches =
    filter === 'all'
      ? allMatches
      : allMatches.filter(
          (m) => (m.competition ?? '').toString().trim().toLowerCase() === filter.toLowerCase(),
        );
  const trainings = trainingsData ?? [];

  const stats: Record<string, PlayerSquadStat> = {};

  const ensurePlayer = (id: string) => {
    if (!stats[id]) stats[id] = { matches: 0, goals: 0, seances: 0 };
  };

  for (const m of matches) {
    if (!m.players) continue;
    try {
      const arr: { id: string; goals?: number }[] = Array.isArray(m.players)
        ? m.players
        : JSON.parse(m.players as string);
      for (const p of arr) {
        if (!p.id) continue;
        ensurePlayer(p.id);
        stats[p.id].matches += 1;
        stats[p.id].goals += p.goals ?? 0;
      }
    } catch {
      // JSONB malformé — ignorer ce match
    }
  }

  for (const t of trainings) {
    if (!t.attendance) continue;
    try {
      const att: Record<string, string> = typeof t.attendance === 'string'
        ? JSON.parse(t.attendance)
        : t.attendance;
      for (const [playerId, status] of Object.entries(att)) {
        if (status === 'present' || status === 'late') {
          ensurePlayer(playerId);
          stats[playerId].seances += 1;
        }
      }
    } catch {
      // ignore
    }
  }

  return stats;
}

// ─── Radar de performance ──────────────────────────────────────────────────

/** Stats par match (+ +/- en total saison) — clés communes à raw / squadMax / squadAvg */
export interface RadarPerMatchStats {
  avgPlaytimeSec: number;        // temps de jeu moyen par match (en secondes)
  goalsPerMatch: number;
  shotsOnTargetPerMatch: number;
  totalShotsPerMatch: number;
  assistsPerMatch: number;
  recoveriesPerMatch: number;
  ballLossPerMatch: number;
  plusMinus: number;             // total saison
  savesPerMatch: number;         // arrêts par match (tirs cadrés adverses stoppés, gardien)
  savePercentage: number;        // % arrêts sur la saison (0-100), échelle absolue
  goalsConcededPerMatch: number; // buts adverses quand le gardien était sur le terrain / match
}

export interface PlayerRadarRaw extends RadarPerMatchStats {
  matchCount: number;            // matchs joués (dénominateur)
  matchesWithTime: number;       // matchs avec time_played > 0
}

export interface PlayerRadarResult {
  raw: PlayerRadarRaw;
  normalized: {                  // 0-100 relatif au max de l'effectif
    avgPlaytime: number;
    goalsPerMatch: number;
    shotsOnTargetPerMatch: number;
    totalShotsPerMatch: number;
    assistsPerMatch: number;
    recoveriesPerMatch: number;
    ballLossPerMatch: number;
    plusMinus: number;
    savesPerMatch: number;
    goalsConcededPerMatch: number;
    savePercentage: number;      // échelle absolue : 0-100 (pas normalisé par le max)
  };
  squadMax: RadarPerMatchStats;  // meilleur joueur de l'effectif pour chaque stat
  squadAvg: RadarPerMatchStats;  // moyenne de l'effectif (joueurs avec matchCount > 0)
}

/**
 * Calcule les stats radar pour un joueur, en per-match (sauf +/- total saison).
 * Normalise (0-100) selon le max de l'effectif.
 * Retourne aussi les max et moyennes de l'effectif pour l'affichage du tooltip.
 */
export async function getPlayerRadarStats(
  playerId: string,
  teamId: string,
  filter: MatchTypeFilter = 'all',
  season?: string,
): Promise<PlayerRadarResult> {
  // 1. Matchs de l'équipe
  let matchesQ = supabase
    .from('matches')
    .select('id, players, competition')
    .eq('team_id', teamId);
  if (season) matchesQ = matchesQ.eq('season', season);
  const { data: matchesData, error: matchesError } = await matchesQ;
  if (matchesError) throw matchesError;

  const allMatches = matchesData ?? [];
  const matches =
    filter === 'all'
      ? allMatches
      : allMatches.filter(
          (m) => (m.competition ?? '').toString().trim().toLowerCase() === filter.toLowerCase(),
        );
  const matchIds = matches.map((m) => m.id as string);

  // 2. Événements de match
  type EventRow = { player_id: string | null; event_type: string; players_on_field: string[] | null };
  let events: EventRow[] = [];
  if (matchIds.length > 0) {
    const { data: eventsData, error: eventsError } = await supabase
      .from('match_events')
      .select('player_id, event_type, players_on_field')
      .in('match_id', matchIds);
    if (eventsError) throw eventsError;
    events = (eventsData ?? []) as EventRow[];
  }

  // 3. Agrégation par joueur
  type Acc = {
    matchCount: number; matchesWithTime: number; totalTimeSec: number;
    goals: number; shotsOnTarget: number; totalShots: number;
    assists: number; recoveries: number; ballLoss: number; plusMinus: number;
    saves: number;               // arrêts gardien : opponent_shot_on_target quand sur le terrain
    goalsConcededOnField: number; // buts adverses quand le gardien est sur le terrain
  };
  const initAcc = (): Acc => ({
    matchCount: 0, matchesWithTime: 0, totalTimeSec: 0,
    goals: 0, shotsOnTarget: 0, totalShots: 0,
    assists: 0, recoveries: 0, ballLoss: 0, plusMinus: 0,
    saves: 0, goalsConcededOnField: 0,
  });
  const per = new Map<string, Acc>();
  const ensure = (id: string) => { if (!per.has(id)) per.set(id, initAcc()); return per.get(id)!; };

  // Depuis matches.players JSON → temps de jeu + nb matchs joués
  for (const m of matches) {
    if (!m.players) continue;
    let arr: Array<{ id: string; time_played?: number }>;
    try { arr = Array.isArray(m.players) ? m.players : JSON.parse(m.players as string); }
    catch { continue; }
    for (const p of arr) {
      const acc = ensure(p.id);
      acc.matchCount++;
      const sec = Number(p.time_played) || 0;
      if (sec > 0) { acc.totalTimeSec += sec; acc.matchesWithTime++; }
    }
  }

  // Depuis match_events → stats individuelles
  for (const ev of events) {
    const pid = ev.player_id;
    if (pid) {
      const acc = ensure(pid);
      switch (ev.event_type) {
        case 'goal':           acc.goals++; acc.shotsOnTarget++; acc.totalShots++; break;
        case 'shot_on_target': acc.shotsOnTarget++; acc.totalShots++; break;
        case 'shot':           acc.totalShots++; break;
        case 'assist':         acc.assists++; break;
        case 'recovery':
        case 'ball_recovery':  acc.recoveries++; break;
        case 'ball_loss':      acc.ballLoss++; break;
      }
    }
    // +/- et arrêts via players_on_field
    if (ev.event_type === 'goal' || ev.event_type === 'opponent_goal' || ev.event_type === 'opponent_shot_on_target') {
      const onField = (ev.players_on_field as string[]) ?? [];
      for (const p2 of onField) {
        if (ev.event_type === 'goal')                         ensure(p2).plusMinus++;
        else if (ev.event_type === 'opponent_goal')         { ensure(p2).plusMinus--; ensure(p2).goalsConcededOnField++; }
        else if (ev.event_type === 'opponent_shot_on_target') ensure(p2).saves++;
      }
    }
  }

  // 4. Calcule les ratios par match pour un joueur donné
  const toRatios = (acc: Acc): RadarPerMatchStats => {
    const mc = acc.matchCount || 1;
    return {
      avgPlaytimeSec:           acc.matchesWithTime > 0 ? acc.totalTimeSec / acc.matchesWithTime : 0,
      goalsPerMatch:            acc.goals / mc,
      shotsOnTargetPerMatch:    acc.shotsOnTarget / mc,
      totalShotsPerMatch:       acc.totalShots / mc,
      assistsPerMatch:         acc.assists / mc,
      recoveriesPerMatch:       acc.recoveries / mc,
      ballLossPerMatch:         acc.ballLoss / mc,
      plusMinus:                acc.plusMinus,
      savesPerMatch:            acc.saves / mc,
      goalsConcededPerMatch:    acc.goalsConcededOnField / mc,
      savePercentage:           acc.saves + acc.goalsConcededOnField > 0
                                  ? (acc.saves / (acc.saves + acc.goalsConcededOnField)) * 100
                                  : 0,
    };
  };

  // 5. Squad max & avg (uniquement les joueurs ayant au moins 1 match)
  const squadRatios = Array.from(per.values())
    .filter(acc => acc.matchCount > 0)
    .map(toRatios);

  const squadMax: RadarPerMatchStats = {
    avgPlaytimeSec:        Math.max(0, ...squadRatios.map(r => r.avgPlaytimeSec)),
    goalsPerMatch:         Math.max(0, ...squadRatios.map(r => r.goalsPerMatch)),
    shotsOnTargetPerMatch: Math.max(0, ...squadRatios.map(r => r.shotsOnTargetPerMatch)),
    totalShotsPerMatch:    Math.max(0, ...squadRatios.map(r => r.totalShotsPerMatch)),
    assistsPerMatch:      Math.max(0, ...squadRatios.map(r => r.assistsPerMatch)),
    recoveriesPerMatch:    Math.max(0, ...squadRatios.map(r => r.recoveriesPerMatch)),
    ballLossPerMatch:      Math.max(0, ...squadRatios.map(r => r.ballLossPerMatch)),
    plusMinus:             Math.max(0, ...squadRatios.map(r => r.plusMinus)),
    savesPerMatch:            Math.max(0, ...squadRatios.map(r => r.savesPerMatch)),
    goalsConcededPerMatch:    Math.max(0, ...squadRatios.map(r => r.goalsConcededPerMatch)),
    savePercentage:           Math.max(0, ...squadRatios.map(r => r.savePercentage)),
  };

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const squadAvg: RadarPerMatchStats = {
    avgPlaytimeSec:        avg(squadRatios.map(r => r.avgPlaytimeSec)),
    goalsPerMatch:         avg(squadRatios.map(r => r.goalsPerMatch)),
    shotsOnTargetPerMatch: avg(squadRatios.map(r => r.shotsOnTargetPerMatch)),
    totalShotsPerMatch:    avg(squadRatios.map(r => r.totalShotsPerMatch)),
    assistsPerMatch:      avg(squadRatios.map(r => r.assistsPerMatch)),
    recoveriesPerMatch:    avg(squadRatios.map(r => r.recoveriesPerMatch)),
    ballLossPerMatch:      avg(squadRatios.map(r => r.ballLossPerMatch)),
    plusMinus:             avg(squadRatios.map(r => r.plusMinus)),
    savesPerMatch:            avg(squadRatios.map(r => r.savesPerMatch)),
    goalsConcededPerMatch:    avg(squadRatios.map(r => r.goalsConcededPerMatch)),
    savePercentage:           avg(squadRatios.map(r => r.savePercentage)),
  };

  // 6. Stats du joueur cible
  const playerAcc = per.get(playerId) ?? initAcc();
  const playerRatios = toRatios(playerAcc);

  const raw: PlayerRadarRaw = {
    ...playerRatios,
    matchCount:       playerAcc.matchCount,
    matchesWithTime:  playerAcc.matchesWithTime,
  };

  // 7. Normalise 0-100 selon le max de l'effectif
  const norm = (val: number, max: number) => max > 0 ? Math.round(Math.max(0, val / max) * 100) : 0;

  return {
    raw,
    normalized: {
      avgPlaytime:           norm(playerRatios.avgPlaytimeSec,        squadMax.avgPlaytimeSec),
      goalsPerMatch:         norm(playerRatios.goalsPerMatch,         squadMax.goalsPerMatch),
      shotsOnTargetPerMatch: norm(playerRatios.shotsOnTargetPerMatch, squadMax.shotsOnTargetPerMatch),
      totalShotsPerMatch:    norm(playerRatios.totalShotsPerMatch,    squadMax.totalShotsPerMatch),
      assistsPerMatch:      norm(playerRatios.assistsPerMatch,      squadMax.assistsPerMatch),
      recoveriesPerMatch:    norm(playerRatios.recoveriesPerMatch,    squadMax.recoveriesPerMatch),
      ballLossPerMatch:      norm(playerRatios.ballLossPerMatch,      squadMax.ballLossPerMatch),
      plusMinus:             norm(Math.max(0, playerRatios.plusMinus), squadMax.plusMinus),
      savesPerMatch:         norm(playerRatios.savesPerMatch, squadMax.savesPerMatch),
      goalsConcededPerMatch: norm(playerRatios.goalsConcededPerMatch, squadMax.goalsConcededPerMatch),
      savePercentage:        Math.round(Math.max(0, Math.min(100, playerRatios.savePercentage))),
    },
    squadMax,
    squadAvg,
  };
}
