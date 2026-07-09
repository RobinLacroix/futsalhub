import { supabase } from '../supabaseClient';
import type { Player, PlayerFormData, PlayerStatus } from '@/types';

/**
 * Stats de base d'un joueur affichées dans la liste Effectif.
 */
export interface PlayerBasicStats {
  matches_played: number;
  goals: number;
  training_attendance: number;
  attendance_percentage: number;
}

/**
 * Agrège les stats de base d'un joueur à partir de matchs et entraînements
 * déjà chargés (aucune requête). Source unique de la logique d'agrégation,
 * autrefois copiée-collée dans l'écran Effectif.
 */
function computePlayerBasicStats(
  playerId: string,
  matchesData: Array<{ players: unknown }>,
  trainingsData: Array<{ attendance: unknown }>
): PlayerBasicStats {
  const matchesPlayed = matchesData.filter(match => {
    if (!match.players) return false;
    try {
      const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players as string);
      return arr.some((p: { id: string }) => p.id === playerId);
    } catch {
      return false;
    }
  }).length;

  const goals = matchesData.reduce((sum, match) => {
    if (!match.players) return sum;
    try {
      const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players as string);
      const pm = arr.find((p: { id: string; goals?: number }) => p.id === playerId);
      return sum + (pm && typeof pm.goals === 'number' ? pm.goals : 0);
    } catch {
      return sum;
    }
  }, 0);

  const trainingAttendance = trainingsData.filter(training => {
    const att = training.attendance;
    if (!att || typeof att !== 'object') return false;
    const s = (att as Record<string, string>)[playerId];
    return s === 'present' || s === 'late';
  }).length;

  // Dénominateur = séances où le joueur a effectivement été convoqué (a un statut)
  const trainingConvoked = trainingsData.filter(training => {
    const att = training.attendance;
    if (!att || typeof att !== 'object') return false;
    const s = (att as Record<string, string>)[playerId];
    return s === 'present' || s === 'late' || s === 'absent' || s === 'injured';
  }).length;

  return {
    matches_played: matchesPlayed,
    goals,
    training_attendance: trainingAttendance,
    attendance_percentage: trainingConvoked > 0
      ? Math.round((trainingAttendance / trainingConvoked) * 100)
      : 0,
  };
}

export const playersService = {
  /**
   * Récupère tous les joueurs du club avec leurs équipes (pour convocations cross-équipes).
   * Retourne chaque joueur avec les ids et noms des équipes auxquelles il appartient.
   */
  async getPlayersByClubWithTeams(clubId: string): Promise<{ player: Player; teamIds: string[]; teamNames: string[] }[]> {
    const { data: teamsData, error: teamsError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('club_id', clubId);
    if (teamsError) throw teamsError;
    const teamIds = (teamsData || []).map((t: { id: string }) => t.id);
    const teamNamesById = new Map((teamsData || []).map((t: { id: string; name: string }) => [t.id, t.name]));
    if (teamIds.length === 0) return [];

    const { data: ptData, error: ptError } = await supabase
      .from('player_teams')
      .select(`
        player_id,
        team_id,
        players (id, first_name, last_name, age, position, strong_foot, status, number)
      `)
      .in('team_id', teamIds);
    if (ptError) throw ptError;

    const byPlayer = new Map<string, { player: Player; teamIds: Set<string> }>();
    for (const row of ptData || []) {
      const p = (row as any).players;
      if (!p) continue;
      const playerId = (row as any).player_id;
      const teamId = (row as any).team_id;
      if (!byPlayer.has(playerId)) {
        byPlayer.set(playerId, { player: p as Player, teamIds: new Set() });
      }
      byPlayer.get(playerId)!.teamIds.add(teamId);
    }
    return Array.from(byPlayer.values()).map(({ player, teamIds: ids }) => ({
      player,
      teamIds: Array.from(ids),
      teamNames: Array.from(ids).map((id) => teamNamesById.get(id) || '').filter(Boolean)
    })).sort((a, b) => (a.player.last_name || '').localeCompare(b.player.last_name || ''));
  },

  /**
   * Récupère tous les joueurs d'une équipe
   */
  async getPlayersByTeam(teamId: string): Promise<Player[]> {
    const { data: playerTeamsData, error } = await supabase
      .from('player_teams')
      .select(`
        player_id,
        players (*)
      `)
      .eq('team_id', teamId);

    if (error) throw error;

    const players = (playerTeamsData?.map((item: any) => item.players).filter(Boolean) || [])
      .filter((p: Player) => p.status !== 'left');
    return players.sort((a: Player, b: Player) =>
      (a.last_name || '').localeCompare(b.last_name || '')
    );
  },

  /**
   * Récupère un joueur par son ID
   */
  async getPlayerById(playerId: string): Promise<Player | null> {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Récupère le joueur lié au compte utilisateur (pour l'espace joueur)
   */
  async getPlayerByUserId(userId: string): Promise<Player | null> {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Crée un nouveau joueur
   */
  async createPlayer(playerData: PlayerFormData): Promise<Player> {
    // Créer le joueur
    const primaryTeamId =
      playerData.selectedTeams.length > 0 ? playerData.selectedTeams[0] : null;
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        first_name: playerData.first_name,
        last_name: playerData.last_name,
        birth_date: playerData.birth_date || null,
        position: playerData.position,
        strong_foot: playerData.strong_foot,
        status: playerData.status,
        number: playerData.number ? parseInt(playerData.number) : null,
        sequence_time_limit: playerData.sequence_time_limit
          ? parseInt(playerData.sequence_time_limit)
          : 180,
        team_id: primaryTeamId,
      })
      .select()
      .single();

    if (playerError) throw playerError;

    // Associer le joueur aux équipes sélectionnées
    if (playerData.selectedTeams.length > 0) {
      const playerTeamRelations = playerData.selectedTeams.map(teamId => ({
        player_id: player.id,
        team_id: teamId
      }));

      const { error: relationError } = await supabase
        .from('player_teams')
        .insert(playerTeamRelations);

      if (relationError) throw relationError;
    }

    return player;
  },

  /**
   * Met à jour un joueur
   */
  async updatePlayer(playerId: string, playerData: Partial<PlayerFormData>): Promise<Player> {
    const updateData: any = {};

    if (playerData.first_name) updateData.first_name = playerData.first_name;
    if (playerData.last_name) updateData.last_name = playerData.last_name;
    if (playerData.birth_date !== undefined) updateData.birth_date = playerData.birth_date || null;
    if (playerData.position) updateData.position = playerData.position;
    if (playerData.strong_foot) updateData.strong_foot = playerData.strong_foot;
    if (playerData.status) updateData.status = playerData.status;
    if (playerData.number !== undefined) {
      updateData.number = playerData.number ? parseInt(playerData.number) : null;
    }
    if (playerData.sequence_time_limit) {
      updateData.sequence_time_limit = parseInt(playerData.sequence_time_limit);
    }

    const { data, error } = await supabase
      .from('players')
      .update(updateData)
      .eq('id', playerId)
      .select()
      .single();

    if (error) throw error;

    // Mettre à jour les relations avec les équipes
    if (playerData.selectedTeams !== undefined) {
      // Supprimer les anciennes relations
      await supabase
        .from('player_teams')
        .delete()
        .eq('player_id', playerId);

      // Créer les nouvelles relations
      if (playerData.selectedTeams.length > 0) {
        const playerTeamRelations = playerData.selectedTeams.map(teamId => ({
          player_id: playerId,
          team_id: teamId
        }));

        const { error: relationError } = await supabase
          .from('player_teams')
          .insert(playerTeamRelations);

        if (relationError) throw relationError;
      }
    }

    return data;
  },

  /**
   * Soft delete : marque le joueur comme "left" au lieu de supprimer.
   * Le joueur reste en base pour préserver les stats des matchs.
   * Il est masqué de l'Effectif et du Dashboard.
   */
  async deletePlayer(playerId: string): Promise<void> {
    const { error } = await supabase
      .from('players')
      .update({ status: 'left' })
      .eq('id', playerId);

    if (error) throw error;
  },

  /**
   * Liste des équipes auxquelles le joueur est associé (ids)
   */
  async getPlayerTeamIds(playerId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('player_teams')
      .select('team_id')
      .eq('player_id', playerId);
    if (error) throw error;
    return (data || []).map((r: { team_id: string }) => r.team_id);
  },

  /**
   * Associe un joueur à une équipe
   */
  async addPlayerToTeam(playerId: string, teamId: string): Promise<void> {
    const { error } = await supabase
      .from('player_teams')
      .insert({ player_id: playerId, team_id: teamId });
    if (error) throw error;
  },

  /**
   * Dissocie un joueur d'une équipe
   */
  async removePlayerFromTeam(playerId: string, teamId: string): Promise<void> {
    const { error } = await supabase
      .from('player_teams')
      .delete()
      .eq('player_id', playerId)
      .eq('team_id', teamId);
    if (error) throw error;
  },

  /**
   * Stats de base (matchs joués, buts, présence entraînements) pour l'effectif
   * d'une équipe. Une seule paire de requêtes team-scopées, agrégation en mémoire
   * pour tous les joueurs demandés. Source unique partagée par l'écran Effectif
   * (chargement initial + recalcul), pour garantir un périmètre équipe cohérent.
   */
  async getSquadBasicStats(
    teamId: string,
    playerIds: string[],
    season?: string
  ): Promise<Map<string, PlayerBasicStats>> {
    let matchesQuery = supabase
      .from('matches')
      .select('players')
      .eq('team_id', teamId);
    if (season) matchesQuery = matchesQuery.eq('season', season);
    const { data: matchesData, error: matchesError } = await matchesQuery;
    if (matchesError) throw matchesError;

    let trainingsQuery = supabase
      .from('trainings')
      .select('attendance')
      .eq('team_id', teamId);
    if (season) trainingsQuery = trainingsQuery.eq('season', season);
    const { data: trainingsData, error: trainingsError } = await trainingsQuery;
    if (trainingsError) throw trainingsError;

    const result = new Map<string, PlayerBasicStats>();
    for (const playerId of playerIds) {
      result.set(playerId, computePlayerBasicStats(playerId, matchesData || [], trainingsData || []));
    }
    return result;
  },

  /**
   * Récupère les statistiques d'un joueur.
   * Optionnellement, on peut filtrer par type de compétition (Championnat, Coupe, Amical).
   */
  async getPlayerStats(
    playerId: string,
    teamId: string,
    matchTypeFilter: 'all' | 'Championnat' | 'Coupe' | 'Amical' = 'all',
    season?: string
  ): Promise<{
    matches_played: number;
    goals: number;
    shots: number;
    shot_efficiency: number | null;
    training_attendance: number;
    attendance_percentage: number;
    victories: number;
    draws: number;
    defeats: number;
  }> {
    // Récupérer les matchs de l'équipe
    let matchesQuery = supabase
      .from('matches')
      .select('id, competition, players, score_team, score_opponent')
      .eq('team_id', teamId);
    if (season) matchesQuery = matchesQuery.eq('season', season);
    const { data: matchesData, error: matchesError } = await matchesQuery;

    if (matchesError) throw matchesError;

    // Récupérer les entraînements de l'équipe
    let trainingsQuery = supabase
      .from('trainings')
      .select('attendance')
      .eq('team_id', teamId);
    if (season) trainingsQuery = trainingsQuery.eq('season', season);
    const { data: trainingsData, error: trainingsError } = await trainingsQuery;

    if (trainingsError) throw trainingsError;

    // Filtrer par type de compétition (Championnat, Coupe, Amical)
    const filteredMatches = (matchesData || []).filter(match => {
      if (matchTypeFilter === 'all') return true;
      const comp = ((match as any).competition ?? '').toString().trim();
      return comp.toLowerCase() === matchTypeFilter.toLowerCase();
    });

    // Calculer les stats
    const matchesPlayed = filteredMatches.filter(match => {
      if (!match.players) return false;
      try {
        const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
        return arr.some((p: { id: string }) => p.id === playerId);
      } catch {
        return false;
      }
    }).length;

    const goals = filteredMatches.reduce((sum, match) => {
      if (!match.players) return sum;
      try {
        const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
        const playerInMatch = arr.find((p: { id: string; goals?: number }) => p.id === playerId);
        return sum + (playerInMatch?.goals || 0);
      } catch {
        return sum;
      }
    }, 0);

    const trainingAttendance = (trainingsData || []).filter(training => {
      if (!training.attendance) return false;
      try {
        const status = training.attendance[playerId] as PlayerStatus | undefined;
        return status === 'present' || status === 'late';
      } catch {
        return false;
      }
    }).length;

    // Dénominateur = séances "réalisables" (où le joueur a répondu) — aligné avec l'app mobile
    // Si arrivé en cours d'année, seules comptent les séances où il a pu/do répondre
    const totalRecordedTrainings = (trainingsData || []).filter(training => {
      if (!training.attendance) return false;
      try {
        const status = training.attendance[playerId] as PlayerStatus | undefined;
        return status === 'present' || status === 'late' || status === 'absent' || status === 'injured';
      } catch {
        return false;
      }
    }).length;

    const attendance_percentage = totalRecordedTrainings > 0
      ? Math.round((trainingAttendance / totalRecordedTrainings) * 100)
      : 0;

    let victories = 0;
    let draws = 0;
    let defeats = 0;

    filteredMatches.forEach(match => {
      if (!match.players) return;
      try {
        const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
        const playerInMatch = arr.find((p: { id: string }) => p.id === playerId);
        
        if (playerInMatch) {
          const scoreTeam = Number(match.score_team) || 0;
          const scoreOpponent = Number(match.score_opponent) || 0;
          
          if (scoreTeam > scoreOpponent) {
            victories++;
          } else if (scoreTeam < scoreOpponent) {
            defeats++;
          } else {
            draws++;
          }
        }
      } catch {
        // Ignorer les matchs avec des données invalides
      }
    });

    // Récupérer les tirs du joueur depuis match_events (sur les matchs filtrés)
    const filteredMatchIds = filteredMatches
      .filter(m => {
        if (!m.players) return false;
        try {
          const arr = Array.isArray(m.players) ? m.players : JSON.parse(m.players as string);
          return arr.some((p: { id: string }) => p.id === playerId);
        } catch { return false; }
      })
      .map(m => (m as any).id as string)
      .filter(Boolean);

    let shots = 0;
    if (filteredMatchIds.length > 0) {
      const { data: evData } = await supabase
        .from('match_events')
        .select('event_type')
        .in('match_id', filteredMatchIds)
        .eq('player_id', playerId)
        .in('event_type', ['goal', 'shot_on_target', 'shot']);
      shots = (evData ?? []).length;
    }
    const shot_efficiency = shots > 0 ? Math.round((goals / shots) * 100) : null;

    return {
      matches_played: matchesPlayed,
      goals,
      shots,
      shot_efficiency,
      training_attendance: trainingAttendance,
      attendance_percentage,
      victories,
      draws,
      defeats
    };
  },

  // ─── Radar de performance ───────────────────────────────────────────────────

  /**
   * Calcule les stats radar pour un joueur, en per-match (sauf +/- total saison).
   * Normalise (0-100) selon le max de l'effectif.
   * Retourne aussi les max et moyennes de l'effectif pour l'affichage du tooltip.
   */
  async getPlayerRadarStats(
    playerId: string,
    teamId: string,
    filter: 'all' | 'Championnat' | 'Coupe' | 'Amical' = 'all',
    season?: string
  ): Promise<PlayerRadarResult> {
    // 1. Matchs de l'équipe
    let matchesQuery = supabase
      .from('matches')
      .select('id, players, competition')
      .eq('team_id', teamId);
    if (season) matchesQuery = matchesQuery.eq('season', season);
    const { data: matchesData, error: matchesError } = await matchesQuery;
    if (matchesError) throw matchesError;

    const allMatches = matchesData ?? [];
    const matches =
      filter === 'all'
        ? allMatches
        : allMatches.filter(
            (m: { competition?: string | null }) =>
              (m.competition ?? '').toString().trim().toLowerCase() === filter.toLowerCase()
          );
    const matchIds = matches.map((m: { id: string }) => m.id);

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
      saves: number; goalsConcededOnField: number;
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
          if (ev.event_type === 'goal')                          ensure(p2).plusMinus++;
          else if (ev.event_type === 'opponent_goal')          { ensure(p2).plusMinus--; ensure(p2).goalsConcededOnField++; }
          else if (ev.event_type === 'opponent_shot_on_target')  ensure(p2).saves++;
        }
      }
    }

    // 4. Ratios par match
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

    // 5. Squad max & avg
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
      savesPerMatch:         Math.max(0, ...squadRatios.map(r => r.savesPerMatch)),
      goalsConcededPerMatch: Math.max(0, ...squadRatios.map(r => r.goalsConcededPerMatch)),
      savePercentage:        Math.max(0, ...squadRatios.map(r => r.savePercentage)),
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
      savesPerMatch:         avg(squadRatios.map(r => r.savesPerMatch)),
      goalsConcededPerMatch: avg(squadRatios.map(r => r.goalsConcededPerMatch)),
      savePercentage:        avg(squadRatios.map(r => r.savePercentage)),
    };

    // 6. Stats du joueur cible
    const playerAcc = per.get(playerId) ?? initAcc();
    const playerRatios = toRatios(playerAcc);

    const raw: PlayerRadarRaw = {
      ...playerRatios,
      matchCount:      playerAcc.matchCount,
      matchesWithTime: playerAcc.matchesWithTime,
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
        savesPerMatch:         norm(playerRatios.savesPerMatch,         squadMax.savesPerMatch),
        goalsConcededPerMatch: norm(playerRatios.goalsConcededPerMatch, squadMax.goalsConcededPerMatch),
        savePercentage:        Math.round(Math.max(0, Math.min(100, playerRatios.savePercentage))),
      },
      squadMax,
      squadAvg,
    };
  }
};

// ─── Radar types (exported for use in UI) ──────────────────────────────────

export interface RadarPerMatchStats {
  avgPlaytimeSec: number;
  goalsPerMatch: number;
  shotsOnTargetPerMatch: number;
  totalShotsPerMatch: number;
  assistsPerMatch: number;
  recoveriesPerMatch: number;
  ballLossPerMatch: number;
  plusMinus: number;
  savesPerMatch: number;
  savePercentage: number;
  goalsConcededPerMatch: number;
}

export interface PlayerRadarRaw extends RadarPerMatchStats {
  matchCount: number;
  matchesWithTime: number;
}

export interface PlayerRadarResult {
  raw: PlayerRadarRaw;
  normalized: {
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
    savePercentage: number;
  };
  squadMax: RadarPerMatchStats;
  squadAvg: RadarPerMatchStats;
}




