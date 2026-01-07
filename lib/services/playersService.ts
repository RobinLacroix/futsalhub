import { supabase } from '../supabaseClient';
import type { Player, PlayerFormData } from '@/types';

export const playersService = {
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
   * Récupère les statistiques d'un joueur
   */
  async getPlayerStats(playerId: string, teamId: string): Promise<{
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
      .select('players, score_team, score_opponent')
      .eq('team_id', teamId);

    if (matchesError) throw matchesError;

    // Récupérer les entraînements de l'équipe
    const { data: trainingsData, error: trainingsError } = await supabase
      .from('trainings')
      .select('attendance')
      .eq('team_id', teamId);

    if (trainingsError) throw trainingsError;

    // Calculer les stats
    const matchesPlayed = (matchesData || []).filter(match => {
      if (!match.players) return false;
      try {
        const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
        return arr.some((p: { id: string }) => p.id === playerId);
      } catch {
        return false;
      }
    }).length;

    const goals = (matchesData || []).reduce((sum, match) => {
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
        return training.attendance[playerId] === 'present';
      } catch {
        return false;
      }
    }).length;

    const totalTrainings = trainingsData?.length || 0;
    const attendance_percentage = totalTrainings > 0 
      ? Math.round((trainingAttendance / totalTrainings) * 100) 
      : 0;

    let victories = 0;
    let draws = 0;
    let defeats = 0;

    (matchesData || []).forEach(match => {
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



