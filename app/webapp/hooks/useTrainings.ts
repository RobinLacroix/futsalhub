import { useState, useEffect } from 'react';
import { trainingsService } from '@/lib/services';
import type { Training, TrainingStats, PlayerAttendanceStats } from '@/types';

interface UseTrainingsOptions {
  teamId?: string;
  autoFetch?: boolean;
}

export function useTrainings(options: UseTrainingsOptions = {}) {
  const { teamId, autoFetch = true } = options;
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [trainingStats, setTrainingStats] = useState<TrainingStats[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<PlayerAttendanceStats[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrainings = async () => {
    if (!teamId) {
      setTrainings([]);
      setTrainingStats([]);
      setAttendanceStats([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [trainingsData, statsData, count] = await Promise.all([
        trainingsService.getTrainingsByTeam(teamId),
        trainingsService.getTrainingStats(teamId),
        trainingsService.getTotalTrainingsCount(teamId)
      ]);
      
      setTrainings(trainingsData);
      setTrainingStats(statsData);
      setTotalCount(count);
      
      // Calculer les stats de présence détaillées
      const attendanceStatsData = trainingsService.calculateAttendanceStats(trainingsData);
      setAttendanceStats(attendanceStatsData);
    } catch (err) {
      console.error('Erreur lors du chargement des entraînements:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      setTrainings([]);
      setTrainingStats([]);
      setAttendanceStats([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetch && teamId) {
      fetchTrainings();
    }
  }, [teamId, autoFetch]);

  return {
    trainings,
    trainingStats,
    attendanceStats,
    totalCount,
    loading,
    error,
    refetch: fetchTrainings
  };
}




