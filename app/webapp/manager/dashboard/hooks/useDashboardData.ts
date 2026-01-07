import { useState, useEffect, useMemo } from 'react';
import { usePlayers } from '../../../hooks/usePlayers';
import { useMatches } from '../../../hooks/useMatches';
import { useTrainings } from '../../../hooks/useTrainings';
import { playersService } from '@/lib/services';
import { aggregateByField, calculateAverageByField } from '@/lib/utils/chartUtils';
import type { Player, PlayerFilterState, PerformanceFilterState, ChartData } from '@/types';

interface UseDashboardDataOptions {
  teamId?: string;
  filters: PlayerFilterState;
  performanceFilters: PerformanceFilterState;
}

export function useDashboardData({ teamId, filters, performanceFilters }: UseDashboardDataOptions) {
  const { players: allPlayers, loading: playersLoading } = usePlayers({ teamId, autoFetch: !!teamId });
  const { matchStats, loading: matchesLoading } = useMatches({ teamId, autoFetch: !!teamId });
  const { 
    trainingStats, 
    attendanceStats, 
    trainings,
    totalCount: totalTrainings,
    loading: trainingsLoading 
  } = useTrainings({ teamId, autoFetch: !!teamId });

  const [playersWithStats, setPlayersWithStats] = useState<Player[]>([]);

  // Calculer les stats des joueurs
  useEffect(() => {
    if (!teamId || !allPlayers.length) {
      setPlayersWithStats(allPlayers);
      return;
    }

    const calculateStats = async () => {
      const playersWithCalculatedStats = await Promise.all(
        allPlayers.map(async (player) => {
          try {
            const stats = await playersService.getPlayerStats(player.id, teamId);
            return {
              ...player,
              ...stats
            };
          } catch (error) {
            console.error(`Erreur lors du calcul des stats pour le joueur ${player.id}:`, error);
            return player;
          }
        })
      );
      setPlayersWithStats(playersWithCalculatedStats);
    };

    calculateStats();
  }, [allPlayers, teamId, totalTrainings]);

  // Filtrer les joueurs
  const filteredPlayers = useMemo(() => {
    let filtered = playersWithStats.filter(player => {
      if (filters.position && player.position !== filters.position) return false;
      if (filters.strongFoot && player.strong_foot !== filters.strongFoot) return false;
      if (filters.status && player.status !== filters.status) return false;
      return true;
    });

    if (filters.selectedPlayers.length > 0) {
      filtered = filtered.filter(player => filters.selectedPlayers.includes(player.id));
    }

    return filtered;
  }, [playersWithStats, filters]);

  // Filtrer les matchs pour les performances
  const performanceFilteredMatches = useMemo(() => {
    if (performanceFilters.selectedMatches.length === 0) {
      return matchStats;
    }
    return matchStats.filter(match => performanceFilters.selectedMatches.includes(match.id));
  }, [matchStats, performanceFilters.selectedMatches]);

  // Filtrer les stats de présence détaillées
  const filteredAttendanceStats = useMemo(() => {
    const existingPlayerIds = new Set(playersWithStats.map(p => p.id));
    return attendanceStats.filter(stats => existingPlayerIds.has(stats.player_id));
  }, [attendanceStats, playersWithStats]);

  // Calculer les données pour les graphiques
  const chartData = useMemo(() => {
    const attendanceRadar = filteredAttendanceStats
      .filter(stats => filteredPlayers.some(player => player.id === stats.player_id))
      .map(stats => {
        const player = filteredPlayers.find(p => p.id === stats.player_id);
        const playerName = player ? `${player.first_name} ${player.last_name}` : `Joueur ${stats.player_id}`;
        
        return {
          joueur: playerName,
          'Présence (%)': stats.attendance_rate || 0
        };
      });

    return {
      statusDistribution: aggregateByField(filteredPlayers, 'status'),
      footDistribution: aggregateByField(filteredPlayers, 'strong_foot'),
      matchesByStatus: calculateAverageByField(filteredPlayers, 'status', 'matches_played'),
      goalsByStatus: calculateAverageByField(filteredPlayers, 'status', 'goals'),
      attendanceRadar,
      matchesByPlayer: filteredPlayers.map(player => ({
        joueur: `${player.first_name} ${player.last_name}`,
        'Victoires': player.victories || 0,
        'Nuls': player.draws || 0,
        'Défaites': player.defeats || 0,
        'Total': player.matches_played || 0
      }))
    };
  }, [filteredPlayers, filteredAttendanceStats]);

  // Calculer les données de performance
  const performanceData = useMemo(() => {
    let filteredStats = performanceFilteredMatches;
    
    if (performanceFilters.matchLocationFilter !== 'Tous') {
      filteredStats = filteredStats.filter(match => match.location === performanceFilters.matchLocationFilter);
    }

    const matchSummary = {
      victories: filteredStats.filter(match => match.result === 'Victoire').length,
      draws: filteredStats.filter(match => match.result === 'Nul').length,
      defeats: filteredStats.filter(match => match.result === 'Défaite').length,
      goalsScored: filteredStats.reduce((sum, match) => sum + match.goals_scored, 0),
      goalsConceded: filteredStats.reduce((sum, match) => sum + match.goals_conceded, 0)
    };

    const goalsByTypeDistribution = filteredStats.length > 0 ? [
      {
        name: 'Phase Offensive',
        buts_marqués: filteredStats.reduce((sum, m) => sum + m.goals_by_type.offensive, 0),
        buts_encaissés: filteredStats.reduce((sum, m) => sum + m.conceded_by_type.offensive, 0)
      },
      {
        name: 'Transition',
        buts_marqués: filteredStats.reduce((sum, m) => sum + m.goals_by_type.transition, 0),
        buts_encaissés: filteredStats.reduce((sum, m) => sum + m.conceded_by_type.transition, 0)
      },
      {
        name: 'CPA',
        buts_marqués: filteredStats.reduce((sum, m) => sum + m.goals_by_type.cpa, 0),
        buts_encaissés: filteredStats.reduce((sum, m) => sum + m.conceded_by_type.cpa, 0)
      },
      {
        name: 'Supériorité',
        buts_marqués: filteredStats.reduce((sum, m) => sum + m.goals_by_type.superiority, 0),
        buts_encaissés: filteredStats.reduce((sum, m) => sum + m.conceded_by_type.superiority, 0)
      }
    ] : [];

    const goalsDistribution = {
      scored: filteredStats.map(match => ({
        name: match.title,
        'Phase Offensive': match.goals_by_type.offensive,
        'Transition': match.goals_by_type.transition,
        'CPA': match.goals_by_type.cpa,
        'Supériorité': match.goals_by_type.superiority
      })),
      conceded: filteredStats.map(match => ({
        name: match.title,
        'Phase Offensive': match.conceded_by_type.offensive,
        'Transition': match.conceded_by_type.transition,
        'CPA': match.conceded_by_type.cpa,
        'Supériorité': match.conceded_by_type.superiority
      }))
    };

    const themeDistribution = trainingStats.reduce((acc, training) => {
      const theme = training.theme || 'Non spécifié';
      acc[theme] = (acc[theme] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    const pieThemeData = Object.entries(themeDistribution)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value);

    const resultDistribution = filteredStats.reduce((acc, match) => {
      const result = match.result || 'Non spécifié';
      acc[result] = (acc[result] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    const pieResultData = Object.entries(resultDistribution)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value: Number(value) }));

    return {
      matchSummary,
      goalsByTypeDistribution,
      goalsDistribution,
      pieThemeData,
      pieResultData,
      filteredMatchStats: filteredStats
    };
  }, [performanceFilteredMatches, performanceFilters.matchLocationFilter, trainingStats]);

  const loading = playersLoading || matchesLoading || trainingsLoading;

  return {
    players: filteredPlayers,
    matchStats,
    trainingStats,
    attendanceStats: filteredAttendanceStats,
    chartData,
    performanceData,
    loading,
    totalTrainings
  };
}

