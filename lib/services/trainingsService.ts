import { supabase } from '../supabaseClient';
import type { Training, TrainingFormData, TrainingStats, PlayerAttendanceStats, PlayerStatus } from '@/types';
import { format } from 'date-fns';

export const trainingsService = {
  /**
   * Récupère tous les entraînements d'une équipe
   */
  async getTrainingsByTeam(teamId: string): Promise<Training[]> {
    const { data, error } = await supabase
      .from('trainings')
      .select('*')
      .eq('team_id', teamId)
      .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Récupère un entraînement par son ID
   */
  async getTrainingById(trainingId: string): Promise<Training | null> {
    const { data, error } = await supabase
      .from('trainings')
      .select('*')
      .eq('id', trainingId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Crée un nouvel entraînement (convoked_players = joueurs avec un statut = ceux qui voient la séance)
   */
  async createTraining(trainingData: TrainingFormData, teamId: string): Promise<Training> {
    const attendance: Record<string, PlayerStatus> = {};
    const convoked_players: { id: string }[] = [];
    Object.values(trainingData.players).forEach(player => {
      if (player?.status) {
        attendance[player.id] = player.status;
        convoked_players.push({ id: player.id });
      }
    });

    const { data, error } = await supabase
      .from('trainings')
      .insert({
        date: trainingData.date.toISOString(),
        location: trainingData.location,
        theme: trainingData.theme,
        key_principle: trainingData.key_principle,
        attendance,
        convoked_players: convoked_players.length ? convoked_players : [],
        team_id: teamId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Met à jour un entraînement
   */
  async updateTraining(trainingId: string, trainingData: Partial<TrainingFormData>): Promise<Training> {
    const updateData: any = {};

    if (trainingData.date) updateData.date = trainingData.date.toISOString();
    if (trainingData.location) updateData.location = trainingData.location;
    if (trainingData.theme) updateData.theme = trainingData.theme;
    if (trainingData.key_principle) updateData.key_principle = trainingData.key_principle;

    if (trainingData.players) {
      const attendance: Record<string, PlayerStatus> = {};
      Object.values(trainingData.players).forEach(player => {
        if (player.status) {
          attendance[player.id] = player.status;
        }
      });
      updateData.attendance = attendance;
    }

    const { data, error } = await supabase
      .from('trainings')
      .update(updateData)
      .eq('id', trainingId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Supprime un entraînement
   */
  async deleteTraining(trainingId: string): Promise<void> {
    const { error } = await supabase
      .from('trainings')
      .delete()
      .eq('id', trainingId);

    if (error) throw error;
  },

  /**
   * Récupère le nombre total d'entraînements d'une équipe
   */
  async getTotalTrainingsCount(teamId: string): Promise<number> {
    const { count, error } = await supabase
      .from('trainings')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);

    if (error) throw error;
    return count || 0;
  },

  /**
   * Récupère les statistiques d'entraînement formatées
   */
  async getTrainingStats(teamId: string): Promise<TrainingStats[]> {
    const trainings = await this.getTrainingsByTeam(teamId);

    return trainings.map(training => {
      const attendance = training.attendance || {};
      const presentCount = Object.values(attendance).filter(status => status === 'present' || status === 'late').length;
      const absentCount = Object.values(attendance).filter(status => status === 'absent').length;
      const injuredCount = Object.values(attendance).filter(status => status === 'injured').length;

      return {
        date: format(new Date(training.date), 'dd/MM/yyyy'),
        attendance: Object.keys(attendance).length,
        present: presentCount,
        absent: absentCount,
        injured: injuredCount,
        theme: training.theme || 'Non spécifié'
      };
    });
  },

  /**
   * Calcule les statistiques détaillées de présence aux entraînements
   */
  calculateAttendanceStats(trainingsData: Training[]): PlayerAttendanceStats[] {
    if (!trainingsData || trainingsData.length === 0) return [];

    const playerStats: Record<string, PlayerAttendanceStats> = {};

    trainingsData.forEach(training => {
      if (training.attendance && typeof training.attendance === 'object') {
        Object.entries(training.attendance).forEach(([playerId, status]) => {
          if (!playerStats[playerId]) {
            playerStats[playerId] = {
              player_id: playerId,
              total_sessions: 0,
              present_count: 0,
              late_count: 0,
              absent_count: 0,
              injured_count: 0,
              attendance_rate: 0,
              present_percentage: 0,
              absent_percentage: 0,
              injured_percentage: 0,
              absent_cumulative: 0,
              injured_cumulative: 0
            };
          }
          
          playerStats[playerId].total_sessions++;
          
          switch (status as PlayerStatus) {
            case 'present':
              playerStats[playerId].present_count++;
              break;
            case 'late':
              playerStats[playerId].late_count++;
              break;
            case 'absent':
              playerStats[playerId].absent_count++;
              break;
            case 'injured':
              playerStats[playerId].injured_count++;
              break;
          }
        });
      }
    });

    // Calculer les pourcentages pour chaque joueur
    Object.values(playerStats).forEach(stats => {
      if (stats.total_sessions > 0) {
        const presentOrLate = stats.present_count + stats.late_count;
        stats.attendance_rate = Math.round((presentOrLate / stats.total_sessions) * 100);
        stats.present_percentage = Math.round((presentOrLate / stats.total_sessions) * 100);
        stats.absent_percentage = Math.round((stats.absent_count / stats.total_sessions) * 100);
        stats.injured_percentage = Math.round((stats.injured_count / stats.total_sessions) * 100);
        
        stats.absent_cumulative = stats.present_percentage + stats.absent_percentage;
        stats.injured_cumulative = stats.present_percentage + stats.absent_percentage + stats.injured_percentage;
      } else {
        stats.attendance_rate = 0;
        stats.present_percentage = 0;
        stats.absent_percentage = 0;
        stats.injured_percentage = 0;
        stats.absent_cumulative = 0;
        stats.injured_cumulative = 0;
      }
    });

    return Object.values(playerStats);
  },

  /**
   * Compte le nombre de fois qu'un procédé a été utilisé dans les entraînements
   */
  async getProcedureUsageCount(procedureId: string): Promise<number> {
    // Récupérer tous les entraînements qui ont des session_parts
    const { data, error } = await supabase
      .from('trainings')
      .select('session_parts')
      .not('session_parts', 'is', null);

    if (error) throw error;

    if (!data || data.length === 0) return 0;

    // Compter les occurrences du procedureId dans tous les session_parts
    let count = 0;
    data.forEach(training => {
      if (training.session_parts && Array.isArray(training.session_parts)) {
        training.session_parts.forEach((part: any) => {
          if (part.procedureId === procedureId) {
            count++;
          }
        });
      }
    });

    return count;
  }
};




