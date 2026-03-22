import { supabase } from '../supabaseClient';
import type { Player, PlayerFormData, PlayerStatus } from '@/types';

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

    const players = playerTeamsData?.map((item: any) => item.players).filter(Boolean) || [];
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
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        first_name: playerData.first_name,
        last_name: playerData.last_name,
        age: parseInt(playerData.age),
        position: playerData.position,
        strong_foot: playerData.strong_foot,
        status: playerData.status,
        number: playerData.number ? parseInt(playerData.number) : null,
        sequence_time_limit: playerData.sequence_time_limit 
          ? parseInt(playerData.sequence_time_limit) 
          : 180
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
    if (playerData.age) updateData.age = parseInt(playerData.age);
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
   * Supprime un joueur
   */
  async deletePlayer(playerId: string): Promise<void> {
    const { error } = await supabase
      .from('players')
      .delete()
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
   * Récupère les statistiques d'un joueur.
   * Optionnellement, on peut filtrer par type de compétition (Championnat, Coupe, Amical).
   */
  async getPlayerStats(
    playerId: string,
    teamId: string,
    matchTypeFilter: 'all' | 'Championnat' | 'Coupe' | 'Amical' = 'all'
  ): Promise<{
    matches_played: number;
    goals: number;
    training_attendance: number;
    attendance_percentage: number;
    victories: number;
    draws: number;
    defeats: number;
  }> {
    // Récupérer les matchs de l'équipe
    const { data: matchesData, error: matchesError } = await supabase
      .from('matches')
      .select('competition, players, score_team, score_opponent')
      .eq('team_id', teamId);

    if (matchesError) throw matchesError;

    // Récupérer les entraînements de l'équipe
    const { data: trainingsData, error: trainingsError } = await supabase
      .from('trainings')
      .select('attendance')
      .eq('team_id', teamId);

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

    return {
      matches_played: matchesPlayed,
      goals,
      training_attendance: trainingAttendance,
      attendance_percentage,
      victories,
      draws,
      defeats
    };
  }
};




