/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { RefreshCw } from 'lucide-react';
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { format } from 'date-fns';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  age: number;
  position: string;
  strong_foot: string;
  status: string;
  matches_played?: number;
  goals?: number;
  training_attendance?: number;
  attendance_percentage?: number;
  victories?: number;
  draws?: number;
  defeats?: number;
}

interface ChartData {
  name: string;
  value: number;
}

interface FilterState {
  position: string;
  strongFoot: string;
  status: string;
  selectedPlayers: string[]; // IDs des joueurs sélectionnés
}

interface PerformanceFilterState {
  matchLocationFilter: 'Tous' | 'Domicile' | 'Exterieur';
  selectedMatches: string[]; // IDs des matchs sélectionnés pour l'analyse des performances
}

interface TrainingStats {
  date: string;
  attendance: number;
  theme: string;
}

interface MatchStats {
  id: string;
  title: string;
  date: string;
  goals_scored: number;
  goals_conceded: number;
  result: 'Victoire' | 'Nul' | 'Défaite';
  location: 'Domicile' | 'Exterieur';
  goals_by_type: {
    offensive: number;
    transition: number;
    cpa: number;
    superiority: number;
  };
  conceded_by_type: {
    offensive: number;
    transition: number;
    cpa: number;
    superiority: number;
  };
}

const initialFilters: FilterState = {
  position: '',
  strongFoot: '',
  status: '',
  selectedPlayers: []
};

const initialPerformanceFilters: PerformanceFilterState = {
  matchLocationFilter: 'Tous',
  selectedMatches: []
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

// Fonctions utilitaires pour les agrégations
const aggregateByField = (data: Player[], field: keyof Player): ChartData[] => {
  const counts = data.reduce((acc: { [key: string]: number }, item) => {
    const value = item[field];
    if (value) {
      acc[value.toString()] = (acc[value.toString()] || 0) + 1;
    }
    return acc;
  }, {});

  return Object.entries(counts).map(([name, value]) => ({ name, value }));
};

const calculateAverageByField = (
  data: Player[],
  groupField: keyof Player,
  valueField: keyof Player
): ChartData[] => {
  const groups = data.reduce((acc: { [key: string]: number[] }, item) => {
    const groupValue = item[groupField];
    const value = item[valueField];
    
    if (groupValue && typeof value === 'number') {
      if (!acc[groupValue.toString()]) {
        acc[groupValue.toString()] = [];
      }
      acc[groupValue.toString()].push(value);
    }
    return acc;
  }, {});

  return Object.entries(groups).map(([name, values]) => ({
    name,
    value: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
  }));
};

export default function DashboardPage() {
  const { activeTeam } = useActiveTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [totalTrainings, setTotalTrainings] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    position: '',
    strongFoot: '',
    status: '',
    selectedPlayers: []
  });

  const [performanceFilters, setPerformanceFilters] = useState<PerformanceFilterState>({
    matchLocationFilter: 'Tous',
    selectedMatches: []
  });

  const [trainingStats, setTrainingStats] = useState<TrainingStats[]>([]);
  const [rawTrainingsData, setRawTrainingsData] = useState<any[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStats[]>([]);
  const [detailedAttendanceStats, setDetailedAttendanceStats] = useState<any[]>([]);

  // Récupération des données initiales
  useEffect(() => {
    if (activeTeam) {
      const loadData = async () => {
        try {
          console.log('🏆 Dashboard - Chargement des données pour l\'équipe:', activeTeam.name);
          await fetchTotalTrainings();
          await fetchPlayers();
          await fetchTrainingStats();
          await fetchMatchStats();
          console.log('🏆 Dashboard - Chargement des données terminé');
        } catch (err) {
          console.error('🏆 Dashboard - Erreur lors du chargement des données:', err);
        }
      };

      loadData();
    }
  }, [activeTeam]);

  const handleFilterChange = (field: keyof FilterState, value: string | string[]) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handlePerformanceFilterChange = (field: keyof PerformanceFilterState, value: string | string[]) => {
    setPerformanceFilters(prev => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  const resetPerformanceFilters = () => {
    setPerformanceFilters(initialPerformanceFilters);
  };

  const togglePlayerSelection = (playerId: string, isPerformanceFilter: boolean = false) => {
    if (isPerformanceFilter) {
      setPerformanceFilters(prev => ({
        ...prev,
        selectedMatches: prev.selectedMatches.includes(playerId)
          ? prev.selectedMatches.filter(id => id !== playerId)
          : [...prev.selectedMatches, playerId]
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        selectedPlayers: prev.selectedPlayers.includes(playerId)
          ? prev.selectedPlayers.filter(id => id !== playerId)
          : [...prev.selectedPlayers, playerId]
      }));
    }
  };

  const toggleMatchSelection = (matchId: string) => {
    setPerformanceFilters(prev => ({
      ...prev,
      selectedMatches: prev.selectedMatches.includes(matchId)
        ? prev.selectedMatches.filter(id => id !== matchId)
        : [...prev.selectedMatches, matchId]
    }));
  };

  const selectAllPlayers = (isPerformanceFilter: boolean = false) => {
    const allPlayerIds = players.map(p => p.id);
    if (isPerformanceFilter) {
      const allMatchIds = matchStats.map(m => m.id); // Utiliser l'ID du match
      setPerformanceFilters(prev => ({ ...prev, selectedMatches: allMatchIds }));
    } else {
      setFilters(prev => ({ ...prev, selectedPlayers: allPlayerIds }));
    }
  };

  const selectAllMatches = () => {
    const allMatchIds = matchStats.map(m => m.id); // Utiliser l'ID du match
    setPerformanceFilters(prev => ({ ...prev, selectedMatches: allMatchIds }));
  };

  const clearPlayerSelection = (isPerformanceFilter: boolean = false) => {
    if (isPerformanceFilter) {
      setPerformanceFilters(prev => ({ ...prev, selectedMatches: [] }));
    } else {
      setFilters(prev => ({ ...prev, selectedPlayers: [] }));
    }
  };

  const clearMatchSelection = () => {
    setPerformanceFilters(prev => ({ ...prev, selectedMatches: [] }));
  };

  const fetchTotalTrainings = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Dashboard - Aucune équipe active, chargement des entraînements impossible');
        setTotalTrainings(0);
        return;
      }

      console.log('🏆 Dashboard - Récupération du nombre total d\'entraînements pour l\'équipe:', activeTeam.name);
      const { count, error } = await supabase
        .from('trainings')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', activeTeam.id);

      if (error) throw error;
      console.log('🏆 Dashboard - Nombre total d\'entraînements:', count);
      setTotalTrainings(count || 0);
    } catch (err) {
      console.error('🏆 Dashboard - Erreur lors de la récupération du nombre total d\'entraînements:', err);
      setTotalTrainings(0);
    }
  };

  const fetchTrainingStats = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Dashboard - Aucune équipe active, chargement des stats d\'entraînement impossible');
        setTrainingStats([]);
        return;
      }

      console.log('🏆 Dashboard - Chargement des stats d\'entraînement pour l\'équipe:', activeTeam.name);
      
      const { data, error } = await supabase
        .from('trainings')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('date', { ascending: true });

      if (error) throw error;

      console.log('🏆 Dashboard - Stats d\'entraînement récupérées:', data?.length || 0);

      if (!data || data.length === 0) {
        console.log('Aucune donnée d&apos;entraînement trouvée');
        setTrainingStats([]);
        return;
      }

      const stats = data.map(training => {
        const attendance = training.attendance || {};
        const presentCount = Object.values(attendance).filter(status => status === 'present').length;
        const absentCount = Object.values(attendance).filter(status => status === 'absent').length;
        const injuredCount = Object.values(attendance).filter(status => status === 'injured').length;
        
        return {
          date: format(new Date(training.date), 'dd/MM/yyyy'),
          attendance: Object.keys(attendance).length, // Total des joueurs
          present: presentCount,
          absent: absentCount,
          injured: injuredCount,
          theme: training.theme || 'Non spécifié'
        };
      });

      console.log('Stats des entraînements formatées:', stats);
      setTrainingStats(stats);
      
      // Sauvegarder aussi les données brutes pour le radar chart
      setRawTrainingsData(data);
    } catch (err) {
      console.error('Erreur lors du chargement des stats d&apos;entraînement:', err);
      setTrainingStats([]);
    }
  };

  // Fonction pour calculer les statistiques détaillées de présence aux entraînements
  const calculateTrainingAttendanceStats = (trainingsData: any[]) => {
    if (!trainingsData || trainingsData.length === 0) return [];

    const playerStats: Record<string, {
      player_id: string;
      total_sessions: number;
      present_count: number;
      absent_count: number;
      injured_count: number;
      attendance_rate: number;
      present_percentage: number;
      absent_percentage: number;
      injured_percentage: number;
      absent_cumulative: number;
      injured_cumulative: number;
    }> = {};

    // Initialiser les stats pour tous les joueurs
    trainingsData.forEach(training => {
      if (training.attendance && typeof training.attendance === 'object') {
        Object.entries(training.attendance).forEach(([playerId, status]) => {
          if (!playerStats[playerId]) {
            playerStats[playerId] = {
              player_id: playerId,
              total_sessions: 0,
              present_count: 0,
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
          
          switch (status) {
            case 'present':
              playerStats[playerId].present_count++;
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
        stats.attendance_rate = Math.round((stats.present_count / stats.total_sessions) * 100);
        stats.present_percentage = Math.round((stats.present_count / stats.total_sessions) * 100);
        stats.absent_percentage = Math.round((stats.absent_count / stats.total_sessions) * 100);
        stats.injured_percentage = Math.round((stats.injured_count / stats.total_sessions) * 100);
        
        // Calcul correct pour l'empilement radar
        // Chaque courbe doit être cumulative pour créer l'effet d'escalier
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
  };

  const fetchMatchStats = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Dashboard - Aucune équipe active, chargement des stats de match impossible');
        setMatchStats([]);
        return;
      }

      console.log('🏆 Dashboard - Chargement des stats de match pour l\'équipe:', activeTeam.name);
      
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('date', { ascending: true });

      if (error) throw error;

      console.log('🏆 Dashboard - Stats de match récupérées:', data?.length || 0);

      if (!data || data.length === 0) {
        console.log('Aucune donnée de match trouvée');
        setMatchStats([]);
        return;
      }

      const stats = data.map(match => {
        // Déterminer le lieu en analysant le titre du match
        const title = match.title || '';
        let location: 'Domicile' | 'Exterieur' = 'Domicile'; // Par défaut
        
        // Logique pour déterminer le lieu basée sur le titre
        if (title.toLowerCase().includes('domicile') || 
            title.toLowerCase().includes('chez nous') ||
            title.toLowerCase().includes('à la maison')) {
          location = 'Domicile';
        } else if (title.toLowerCase().includes('exterieur') || 
                   title.toLowerCase().includes('dehors') ||
                   title.toLowerCase().includes('chez eux') ||
                   title.toLowerCase().includes('extérieur')) {
          location = 'Exterieur';
        }
        // Si le titre ne contient pas d'indication claire, on peut analyser d'autres patterns
        // Par exemple, si le titre contient "vs" ou "contre", on peut déterminer le lieu

        return {
          id: match.id, // Ajouter l'ID du match pour l'identification unique
          title: title, // Ajouter le titre du match
          date: format(new Date(match.date), 'dd/MM/yyyy'),
          goals_scored: Number(match.score_team) || 0,
          goals_conceded: Number(match.score_opponent) || 0,
          result: (match.score_team > match.score_opponent ? 'Victoire' : 
                  match.score_team < match.score_opponent ? 'Défaite' : 'Nul') as 'Victoire' | 'Nul' | 'Défaite',
          location: location,
          goals_by_type: match.goals_by_type || {
            offensive: 0,
            transition: 0,
            cpa: 0,
            superiority: 0
          },
          conceded_by_type: match.conceded_by_type || {
            offensive: 0,
            transition: 0,
            cpa: 0,
            superiority: 0
          }
        };
      });

      console.log('Stats des matchs formatées:', stats);
      setMatchStats(stats);
    } catch (err) {
      console.error('Erreur lors du chargement des stats de match:', err);
      setMatchStats([]);
    }
  };

  const fetchPlayers = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Dashboard - Aucune équipe active, chargement des joueurs impossible');
        setPlayers([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      
      console.log('🏆 Dashboard - Récupération des joueurs pour l\'équipe:', activeTeam.name);
      // Récupération des joueurs via la table de liaison
      const { data: playerTeamsData, error } = await supabase
        .from('player_teams')
        .select(`
          player_id,
          players (*)
        `)
        .eq('team_id', activeTeam.id);
      
      if (error) throw error;
      
      // Transformer les données pour extraire les joueurs
      const data = playerTeamsData?.map((item: any) => item.players).filter(Boolean) || [];
      
      // Trier par nom de famille
      data.sort((a: any, b: any) => (a.last_name || '').localeCompare(b.last_name || ''));

      if (error) throw error;
      console.log('Joueurs récupérés:', data?.length);

      // Récupération des matchs avec leurs résultats (filtrés par équipe)
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('players, score_team, score_opponent')
        .eq('team_id', activeTeam.id);
      if (matchesError) throw matchesError;

      // Récupération des entraînements avec le champ attendance (filtrés par équipe)
      const { data: trainingsData, error: trainingsError } = await supabase
        .from('trainings')
        .select('attendance')
        .eq('team_id', activeTeam.id);
      if (trainingsError) throw trainingsError;

      // Calculer les stats détaillées de présence
      const detailedAttendanceStats = calculateTrainingAttendanceStats(trainingsData || []);
      
      // Stocker les stats détaillées dans l'état
      setDetailedAttendanceStats(detailedAttendanceStats);

      // Calcul dynamique des stats pour chaque joueur
      const playersWithStats = (data || []).map(player => {
        // Nombre de matchs joués
        const matchesPlayed = (matchesData || []).filter(match => {
          if (!match.players) return false;
          try {
            const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
            return arr.some((p: Player) => p.id === player.id);
          } catch {
            return false;
          }
        }).length;

        // Nombre de buts marqués
        const goals = (matchesData || []).reduce((sum, match) => {
          if (!match.players) return sum;
          try {
            const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
            const playerInMatch = arr.find((p: { id: string; goals?: number; yellow_cards?: number; red_cards?: number }) => p.id === player.id);
            return sum + (playerInMatch && typeof playerInMatch.goals === 'number' ? playerInMatch.goals : 0);
          } catch {
            return sum;
          }
        }, 0);

        // Nombre de présences à l'entraînement (utilise le nouveau champ attendance JSONB)
        const trainingAttendance = (trainingsData || []).filter(training => {
          if (!training.attendance) return false;
          try {
            // Vérifier si le joueur est présent dans le champ attendance
            return training.attendance[player.id] === 'present';
          } catch {
            return false;
          }
        }).length;

        // Calcul des victoires, nuls et défaites
        let victories = 0;
        let draws = 0;
        let defeats = 0;

        (matchesData || []).forEach(match => {
          if (!match.players) return;
          try {
            const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
            const playerInMatch = arr.find((p: Player) => p.id === player.id);
            
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
          ...player,
          matches_played: matchesPlayed,
          goals,
          training_attendance: trainingAttendance,
          attendance_percentage: totalTrainings > 0 ? Math.round((trainingAttendance / totalTrainings) * 100) : 0,
          victories,
          draws,
          defeats
        };
      });

      setPlayers(playersWithStats);

    } catch (err) {
      console.error('Erreur lors du chargement des joueurs:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  // Filtrage des joueurs en fonction des filtres actifs
  const filteredPlayers = useMemo(() => {
    let filtered = players.filter(player => {
      if (filters.position && player.position !== filters.position) return false;
      if (filters.strongFoot && player.strong_foot !== filters.strongFoot) return false;
      if (filters.status && player.status !== filters.status) return false;
      return true;
    });

    // Filtrer par joueurs sélectionnés si des joueurs sont sélectionnés
    if (filters.selectedPlayers.length > 0) {
      filtered = filtered.filter(player => filters.selectedPlayers.includes(player.id));
    }

    return filtered;
  }, [players, filters]);

  // Filtrage des matchs pour l'analyse des performances
  const performanceFilteredMatches = useMemo(() => {
    if (performanceFilters.selectedMatches.length === 0) {
      return matchStats; // Si aucun match sélectionné, prendre tous les matchs
    }
    return matchStats.filter(match => performanceFilters.selectedMatches.includes(match.id));
  }, [matchStats, performanceFilters.selectedMatches]);

  // Filtrer les statistiques de présence détaillées pour ne garder que les joueurs existants dans la table players
  const filteredDetailedAttendanceStats = useMemo(() => {
    // Créer un Set des IDs des joueurs existants pour une recherche rapide
    const existingPlayerIds = new Set(players.map(p => p.id));
    
    // Filtrer pour ne garder que les joueurs qui existent encore dans la table players
    return detailedAttendanceStats.filter(stats => 
      existingPlayerIds.has(stats.player_id)
    );
  }, [detailedAttendanceStats, players]);

  // Calcul des données pour les graphiques à partir des joueurs filtrés
  const chartData = useMemo(() => {
    // Calculer les stats de présence pour le radar chart en utilisant les données brutes des entraînements
    const allDetailedAttendanceStats = calculateTrainingAttendanceStats(rawTrainingsData || []);
    
    // Filtrer pour ne garder que les joueurs qui existent encore dans filteredPlayers
    const filteredAttendanceStats = allDetailedAttendanceStats.filter(stats => 
      filteredPlayers.some(player => player.id === stats.player_id)
    );
    
    return {
      statusDistribution: aggregateByField(filteredPlayers, 'status'),
      footDistribution: aggregateByField(filteredPlayers, 'strong_foot'),
      matchesByStatus: calculateAverageByField(filteredPlayers, 'status', 'matches_played'),
      goalsByStatus: calculateAverageByField(filteredPlayers, 'status', 'goals'),
      attendanceRadar: filteredAttendanceStats.map(stats => {
        // Trouver le nom du joueur (devrait toujours exister car filtré)
        const player = filteredPlayers.find(p => p.id === stats.player_id);
        const playerName = player ? `${player.first_name} ${player.last_name}` : `Joueur ${stats.player_id}`;
        
        return {
          joueur: playerName,
          'Présence (%)': stats.attendance_rate || 0
        };
      }),
      matchesByPlayer: filteredPlayers.map(player => ({
        joueur: `${player.first_name} ${player.last_name}`,
        'Victoires': player.victories || 0,
        'Nuls': player.draws || 0,
        'Défaites': player.defeats || 0,
        'Total': player.matches_played || 0
      }))
    };
  }, [filteredPlayers, rawTrainingsData]);

  // Calcul des données pour les graphiques de performance
  const getTrainingThemeDistribution = () => {
    console.log('Calcul de la distribution des thèmes avec les données:', trainingStats);
    
    if (!trainingStats || trainingStats.length === 0) {
      console.log('Aucune donnée d&apos;entraînement disponible pour le calcul de la distribution');
      return [];
    }

    // Préparation des données pour le bar chart
    const themeCount = trainingStats.reduce((acc, training) => {
      const theme = training.theme || 'Non spécifié';
      acc[theme] = (acc[theme] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Formatage des données pour le bar chart
    const distribution = Object.entries(themeCount)
      .filter(([, value]) => value > 0) // Filtrer les valeurs nulles ou zéro
      .map(([name, value]) => ({
        name,
        value: Number(value) // S'assurer que la valeur est un nombre
      }))
      .sort((a, b) => b.value - a.value); // Trier par nombre de séances décroissant

    console.log('Distribution des thèmes calculée:', distribution);
    return distribution;
  };

  const getMatchResultDistribution = () => {
    console.log('Calcul de la distribution des résultats avec les données:', matchStats);
    
    if (!matchStats || matchStats.length === 0) {
      console.log('Aucune donnée de match disponible pour le calcul de la distribution');
      return [];
    }

    // Utiliser les matchs filtrés par sélection
    let filteredStats = performanceFilteredMatches;
    
    // Appliquer le filtre par lieu si nécessaire
    if (performanceFilters.matchLocationFilter !== 'Tous') {
      filteredStats = filteredStats.filter(match => match.location === performanceFilters.matchLocationFilter);
    }

    console.log('Stats filtrées par lieu et sélection:', filteredStats);

    if (filteredStats.length === 0) {
      console.log('Aucune donnée de match disponible après filtrage');
      return [];
    }

    // Préparation des données pour le pie chart
    const resultCount = filteredStats.reduce((acc, match) => {
      const result = match.result || 'Non spécifié';
      acc[result] = (acc[result] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Formatage des données pour le pie chart
    const distribution = Object.entries(resultCount)
      .filter(([, value]) => value > 0) // Filtrer les valeurs nulles ou zéro
      .map(([name, value]) => ({
        name,
        value: Number(value) // S'assurer que la valeur est un nombre
      }));

    console.log('Distribution des résultats calculée:', distribution);
    return distribution;
  };

  const getGoalsDistribution = () => {
    console.log('Calcul de la distribution des buts avec les données:', matchStats);
    
    if (!matchStats || matchStats.length === 0) {
      console.log('Aucune donnée de match disponible pour le calcul de la distribution');
      return { scored: [], conceded: [] };
    }

    // Utiliser les matchs filtrés par sélection
    let filteredStats = performanceFilteredMatches;
    
    // Appliquer le filtre par lieu si nécessaire
    if (performanceFilters.matchLocationFilter !== 'Tous') {
      filteredStats = filteredStats.filter(match => match.location === performanceFilters.matchLocationFilter);
    }

    console.log('Stats filtrées par lieu et sélection:', filteredStats);

    if (filteredStats.length === 0) {
      console.log('Aucune donnée de match disponible après filtrage');
      return { scored: [], conceded: [] };
    }

    // Formater les données pour les graphiques
    const scoredData = filteredStats.map(match => ({


      name: match.title,
      'Phase Offensive': match.goals_by_type.offensive,
      'Transition': match.goals_by_type.transition,
      'CPA': match.goals_by_type.cpa,
      'Supériorité': match.goals_by_type.superiority
    }));

    const concededData = filteredStats.map(match => ({
      name: match.title,
      'Phase Offensive': match.conceded_by_type.offensive,
      'Transition': match.conceded_by_type.transition,
      'CPA': match.conceded_by_type.cpa,
      'Supériorité': match.conceded_by_type.superiority
    }));

    console.log('Distribution des buts calculée:', { scored: scoredData, conceded: concededData });
    return { scored: scoredData, conceded: concededData };
  };

  const getFilteredMatchStats = () => {
    if (!matchStats || matchStats.length === 0) {
      return [];
    }

    // Utiliser les matchs filtrés par sélection
    let filteredStats = performanceFilteredMatches;
    
    // Appliquer le filtre par lieu si nécessaire
    if (performanceFilters.matchLocationFilter !== 'Tous') {
      filteredStats = filteredStats.filter(match => match.location === performanceFilters.matchLocationFilter);
    }

    return filteredStats;
  };

  const getMatchSummary = () => {
    if (!matchStats || matchStats.length === 0) {
      return {
        victories: 0,
        draws: 0,
        defeats: 0,
        goalsScored: 0,
        goalsConceded: 0
      };
    }

    // Utiliser les matchs filtrés par sélection
    let filteredStats = performanceFilteredMatches;
    
    // Appliquer le filtre par lieu si nécessaire
    if (performanceFilters.matchLocationFilter !== 'Tous') {
      filteredStats = filteredStats.filter(match => match.location === performanceFilters.matchLocationFilter);
    }

    return {
      victories: filteredStats.filter(match => match.result === 'Victoire').length,
      draws: filteredStats.filter(match => match.result === 'Nul').length,
      defeats: filteredStats.filter(match => match.result === 'Défaite').length,
      goalsScored: filteredStats.reduce((sum, match) => sum + match.goals_scored, 0),
      goalsConceded: filteredStats.reduce((sum, match) => sum + match.goals_conceded, 0)
    };
  };

  const getGoalsByTypeDistribution = () => {
    if (!matchStats || matchStats.length === 0) {
      return [];
    }

    // Utiliser les matchs filtrés par sélection
    let filteredStats = performanceFilteredMatches;
    
    // Appliquer le filtre par lieu si nécessaire
    if (performanceFilters.matchLocationFilter !== 'Tous') {
      filteredStats = filteredStats.filter(match => match.location === performanceFilters.matchLocationFilter);
    }

    if (filteredStats.length === 0) {
      return [];
    }

    // Calculer les totaux par type pour les buts marqués et encaissés
    const totals = filteredStats.reduce((acc, match) => {
      // Buts marqués
      acc.offensive_scored += match.goals_by_type.offensive;
      acc.transition_scored += match.goals_by_type.transition;
      acc.cpa_scored += match.goals_by_type.cpa;
      acc.superiority_scored += match.goals_by_type.superiority;

      // Buts encaissés
      acc.offensive_conceded += match.conceded_by_type.offensive;
      acc.transition_conceded += match.conceded_by_type.transition;
      acc.cpa_conceded += match.conceded_by_type.cpa;
      acc.superiority_conceded += match.conceded_by_type.superiority;

      return acc;
    }, {
      offensive_scored: 0,
      transition_scored: 0,
      cpa_scored: 0,
      superiority_scored: 0,
      offensive_conceded: 0,
      transition_conceded: 0,
      cpa_conceded: 0,
      superiority_conceded: 0
    });

    // Formater les données pour le graphique
    return [
      {
        name: 'Phase Offensive',
        buts_marqués: totals.offensive_scored,
        buts_encaissés: totals.offensive_conceded
      },
      {
        name: 'Transition',
        buts_marqués: totals.transition_scored,
        buts_encaissés: totals.transition_conceded
      },
      {
        name: 'CPA',
        buts_marqués: totals.cpa_scored,
        buts_encaissés: totals.cpa_conceded
      },
      {
        name: 'Supériorité',
        buts_marqués: totals.superiority_scored,
        buts_encaissés: totals.superiority_conceded
      }
    ];
  };

  // Logs pour debug PieChart
  const pieThemeData = useMemo(() => getTrainingThemeDistribution(), [trainingStats]);
  const pieResultData = useMemo(() => getMatchResultDistribution(), [matchStats, performanceFilters.matchLocationFilter]);
  console.log('DATA PIE THEME:', pieThemeData);
  console.log('DATA PIE RESULT:', pieResultData);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!activeTeam) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Aucune équipe sélectionnée</h1>
          <p className="text-gray-600 mb-6">
            Veuillez sélectionner une équipe dans la sidebar pour afficher le dashboard.
          </p>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-blue-800 text-sm">
              Utilisez le sélecteur d'équipe dans la sidebar gauche pour commencer.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {activeTeam && (
            <div className="flex items-center gap-2 mt-2">
              <div 
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: activeTeam.color }}
              ></div>
              <span className="text-sm text-gray-600">
                Équipe active : <strong>{activeTeam.name}</strong> ({activeTeam.category} - Niveau {activeTeam.level})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Section Analyse de l'effectif */}
      <div className="mt-12">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Analyse de l'effectif</h2>
          <div className="flex items-center gap-4">
            <div className="flex gap-4">
              <select
                value={filters.position}
                onChange={(e) => handleFilterChange('position', e.target.value)}
                className="rounded-md border-gray-300 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
              >
                <option value="">Tous les postes</option>
                <option value="Meneur">Meneur</option>
                <option value="Ailier">Ailier</option>
                <option value="Pivot">Pivot</option>
              </select>

              <select
                value={filters.strongFoot}
                onChange={(e) => handleFilterChange('strongFoot', e.target.value)}
                className="rounded-md border-gray-300 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
              >
                <option value="">Tous les pieds</option>
                <option value="Droit">Droit</option>
                <option value="Gauche">Gauche</option>
                <option value="Ambidextre">Ambidextre</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="rounded-md border-gray-300 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
              >
                <option value="">Tous les statuts</option>
                <option value="Non-muté">Non-muté</option>
                <option value="Muté">Muté</option>
                <option value="Muté HP">Muté HP</option>
              </select>
            </div>

            <button
              onClick={resetFilters}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Réinitialiser
            </button>
          </div>
        </div>

        {/* Sélecteur de joueurs pour l'analyse de l'effectif */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Sélection des joueurs</h3>
            <div className="flex gap-2">
              <button
                onClick={() => selectAllPlayers(false)}
                className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
              >
                Tout sélectionner
              </button>
              <button
                onClick={() => clearPlayerSelection(false)}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Tout désélectionner
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2">
            {players.map(player => (
              <button
                key={player.id}
                onClick={() => togglePlayerSelection(player.id, false)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filters.selectedPlayers.includes(player.id)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {player.first_name} {player.last_name}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-gray-500">
              {filters.selectedPlayers.length === 0 
                ? 'Tous les joueurs sont sélectionnés' 
                : `${filters.selectedPlayers.length} joueur(s) sélectionné(s)`
              }
            </p>
            
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Répartition par statut */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Répartition par statut</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.statusDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {chartData.statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Répartition par pied fort */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Répartition par pied fort</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.footDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {chartData.footDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Moyenne de matchs par statut */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Moyenne de matchs par statut</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.matchesByStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Buts par statut */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Buts marqués par statut</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.goalsByStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>



          {/* Graphique - Nombre de matchs par joueur */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Résultats des matchs par joueur</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.matchesByPlayer}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="joueur" 
                    angle={-45} 
                    textAnchor="end" 
                    height={80}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip 
                    contentStyle={{ fontSize: 12, color: '#374151', fontWeight: 'bold' }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="Victoires" stackId="a" fill="#4CAF50" />
                  <Bar dataKey="Nuls" stackId="a" fill="#FFC107" />
                  <Bar dataKey="Défaites" stackId="a" fill="#F44336" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Section Analyse de l'entraînement */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Analyse de l'entraînement</h2>
        
        {/* Graphiques d'analyse de l'entraînement */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Statistiques de présence détaillées */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Statistiques de présence détaillées</h3>
            <div className="h-80">
              {filteredDetailedAttendanceStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredDetailedAttendanceStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="player_id" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(label) => {
                        const player = players.find(p => p.id === label);
                        return player ? `${player.first_name} ${player.last_name}` : label;
                      }}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        value, 
                        name === 'present_count' ? 'Présences' : 
                        name === 'absent_count' ? 'Absences' : 
                        name === 'injured_count' ? 'Blessés' : name
                      ]}
                      labelFormatter={(label) => {
                        const player = players.find(p => p.id === label);
                        return player ? `${player.first_name} ${player.last_name}` : label;
                      }}
                    />
                    <Legend 
                      formatter={(value) => {
                        switch(value) {
                          case 'present_count': return 'Présences';
                          case 'absent_count': return 'Absences';
                          case 'injured_count': return 'Blessés';
                          default: return value;
                        }
                      }}
                    />
                    <Bar dataKey="present_count" stackId="a" fill="#4CAF50" name="Présences" />
                    <Bar dataKey="absent_count" stackId="a" fill="#F44336" name="Absences" />
                    <Bar dataKey="injured_count" stackId="a" fill="#FF9800" name="Blessés" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Aucune donnée de présence disponible
                </div>
              )}
            </div>
          </div>

          {/* Présence en séance par joueur (Radar Chart) */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Présence en séance par joueur</h3>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={chartData.attendanceRadar}>
                  <PolarGrid />
                  <PolarAngleAxis 
                    dataKey="joueur" 
                    tick={{ fontSize: 10 }}
                  />
                  <PolarRadiusAxis 
                    angle={90} 
                    domain={[0, 100]} 
                    tick={{ fontSize: 10 }}
                  />
                  <Radar
                    name="Présence (%)"
                    dataKey="Présence (%)"
                    stroke="#8B5CF6"
                    fill="#8B5CF6"
                    fillOpacity={0.6}
                  />
                  <Tooltip 
                    contentStyle={{ fontSize: 12, color: '#374151', fontWeight: 'bold' }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: 12, fontWeight: 'bold' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Deuxième ligne : Nombre de joueurs présents et thèmes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Nombre de joueurs présents par séance d'entraînement */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Nombre de joueurs présents par séance d'entraînement</h3>
            <div className="h-80">
              {trainingStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trainingStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80}
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      axisLine={{ stroke: '#d1d5db' }}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      axisLine={{ stroke: '#d1d5db' }}
                      domain={[0, 'dataMax + 2']}
                    />
                    <Tooltip 
                      formatter={(value: number, name: string) => {
                        if (name === 'present') {
                          return [`${value} joueurs présents`, 'Joueurs présents'];
                        }
                        return [value, name];
                      }}
                      labelFormatter={(label) => `Séance du ${label}`}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: 12, fontWeight: 'bold' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="present" 
                      stroke="#10B981" 
                      strokeWidth={3}
                      dot={{ 
                        fill: '#10B981', 
                        strokeWidth: 2, 
                        r: 4,
                        stroke: '#fff'
                      }}
                      activeDot={{ 
                        r: 6, 
                        stroke: '#10B981', 
                        strokeWidth: 2, 
                        fill: '#fff' 
                      }}
                      name="Nombre de joueurs présents" 
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Aucune donnée d'entraînement disponible
                </div>
              )}
            </div>
          </div>

          {/* Répartition des thèmes d'entraînement */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Répartition des thèmes d'entraînement</h3>
            <div className="h-80">
              {pieThemeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pieThemeData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" fill="#8884d8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Aucune donnée disponible
                </div>
              )}
            </div>
          </div>
        </div>


      </div>

      {/* Section d'analyse des performances */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Analyse des performances</h2>

        {/* Filtres pour les matchs */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Filtres des performances</h3>
            <button
              onClick={resetPerformanceFilters}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Réinitialiser
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Filtre par lieu */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filtrer les matchs par lieu</label>
              <select
                value={performanceFilters.matchLocationFilter}
                onChange={(e) => handlePerformanceFilterChange('matchLocationFilter', e.target.value as 'Tous' | 'Domicile' | 'Exterieur')}
                className="rounded-md border-gray-300 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="Tous">Tous les matchs</option>
                <option value="Domicile">Domicile</option>
                <option value="Exterieur">Extérieur</option>
              </select>
            </div>

            {/* Sélecteur de matchs pour les performances */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Sélection des matchs</label>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllMatches}
                    className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    Tout
                  </button>
                  <button
                    onClick={clearMatchSelection}
                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                  >
                    Aucun
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto border rounded-md p-2">
                {matchStats.map(match => (
                  <label key={match.id} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={performanceFilters.selectedMatches.includes(match.id)}
                      onChange={() => toggleMatchSelection(match.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-700 truncate">
                      {match.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section de résumé */}
        <div className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Victoires */}
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-green-600 mb-1">
                {getMatchSummary().victories}
              </div>
              <div className="text-sm text-gray-600">Victoires</div>
            </div>

            {/* Nuls */}
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-yellow-600 mb-1">
                {getMatchSummary().draws}
              </div>
              <div className="text-sm text-gray-600">Nuls</div>
            </div>

            {/* Défaites */}
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-red-600 mb-1">
                {getMatchSummary().defeats}
              </div>
              <div className="text-sm text-gray-600">Défaites</div>
            </div>

            {/* Buts marqués */}
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">
                {getMatchSummary().goalsScored}
              </div>
              <div className="text-sm text-gray-600">Buts marqués</div>
            </div>

            {/* Buts encaissés */}
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-orange-600 mb-1">
                {getMatchSummary().goalsConceded}
              </div>
              <div className="text-sm text-gray-600">Buts encaissés</div>
            </div>
          </div>
        </div>

        {/* Graphique de comparaison des buts par typologie */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Répartition des buts par typologie</h3>
            <div className="h-80">
              {getFilteredMatchStats().length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data ={getGoalsByTypeDistribution()}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [`${value} buts`, 'Nombre de buts']}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        padding: '8px',
                        color: '#1f2937',
                        fontWeight: 'bold'
                      }}
                      wrapperStyle={{
                        color: '#374151',
                        fontWeight: 'bold'
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="buts_marqués" 
                      name="Buts marqués" 
                      fill="#4CAF50" 
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey="buts_encaissés" 
                      name="Buts encaissés" 
                      fill="#F44336" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Aucune donnée disponible
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Graphique des buts marqués */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Buts marqués par match et par type</h3>
            <div className="h-80">
              {getFilteredMatchStats().length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={getGoalsDistribution().scored}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Phase Offensive" name="Phase Offensive" fill="#8884d8" stackId="scored" />
                    <Bar dataKey="Transition" name="Transition" fill="#82ca9d" stackId="scored" />
                    <Bar dataKey="CPA" name="CPA" fill="#ffc658" stackId="scored" />
                    <Bar dataKey="Supériorité" name="Supériorité" fill="#ff8042" stackId="scored" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Aucune donnée de match disponible
                </div>
              )}
            </div>
          </div>

          {/* Graphique des buts encaissés */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Buts encaissés par match et par type</h3>
            <div className="h-80">
              {getFilteredMatchStats().length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={getGoalsDistribution().conceded}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Phase Offensive" name="Phase Offensive" fill="#8884d8" stackId="conceded" />
                    <Bar dataKey="Transition" name="Transition" fill="#82ca9d" stackId="conceded" />
                    <Bar dataKey="CPA" name="CPA" fill="#ffc658" stackId="conceded" />
                    <Bar dataKey="Supériorité" name="Supériorité" fill="#ff8042" stackId="conceded" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Aucune donnée de match disponible
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
