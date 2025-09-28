/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import {
  BarChart3,
  Clock,
  Target,
  RefreshCw,
  Users,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie
} from 'recharts';

// Import the new TeamRadarChart component
import TeamRadarChart from '@/app/webapp/components/TeamRadarChart';
import ActionsByTypeChart from '@/app/webapp/components/ActionsByTypeChart';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  number: number;
}

interface MatchPlayer {
  id: string;
  goals: number;
  yellow_cards: number;
  red_cards: number;
  time_played: number;  // ← Corriger le nom du champ
}

interface Match {
  id: string;
  title: string;
  date: string;
  competition: string;
  score_team: number;
  score_opponent: number;
  recorded_with_tracker?: boolean;
  players?: MatchPlayer[];
}

interface MatchEvent {
  id: string;
  match_id: string;
  event_type: string;
  match_time_seconds: number;
  half: number;
  player_id: string | null;
  players_on_field: string[];
  created_at: string;
}

interface PlayerStats {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  totalGoals: number;
  totalShots: number;
  totalShotsOnTarget: number;
  totalDribbles: number;
  totalBallLoss: number;
  totalRecoveries: number;
  totalYellowCards: number;
  totalRedCards: number;
  totalTime: number;
  plusMinus: number; // Buts marqués - Buts encaissés quand le joueur est sur le terrain
  shotsPlusMinus: number; // Tirs cadrés - Tirs encaissés quand le joueur est sur le terrain
  averageTimePerMatch: number;
}

interface MatchAction {
  matchId: string;
  matchTitle: string;
  date: string;
  minute: number;
  actionType: string;
  playerId?: string;
  playerName?: string;
  value: number;
}

export default function TrackerDashboardPage() {
  const { activeTeam } = useActiveTeam();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [matchActions, setMatchActions] = useState<MatchAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('plus-minus');
  
  // Filtres par type de compétition
  const [competitionFilters, setCompetitionFilters] = useState<{
    Amical: boolean;
    Coupe: boolean;
    Championnat: boolean;
  }>({
    Amical: true,
    Coupe: true,
    Championnat: true
  });

  // État pour le tri des statistiques des joueurs
  const [playerStatsSortConfig, setPlayerStatsSortConfig] = useState<{
    key: string | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: 'plusMinus', direction: 'desc' }); // Tri par défaut par +/- buts décroissant

  // Charger les données depuis Supabase
  useEffect(() => {
    if (activeTeam) {
      const loadData = async () => {
        try {
          setLoading(true);
          console.log('🏆 Tracker Dashboard - Chargement des données pour l\'équipe:', activeTeam.name);
          
          // Charger tous les matches (filtrés par équipe)
          const { data: matchesData, error: matchesError } = await supabase
            .from('matches')
            .select('id, title, date, competition, score_team, score_opponent, players')
            .eq('team_id', activeTeam.id)
            .order('date', { ascending: false });

        if (matchesError) {
          console.error('Erreur lors du chargement des matches:', matchesError);
          setMatches([]);
        } else {
          console.log('Matches chargés:', matchesData);
          // Debug: vérifier la structure des données players
          if (matchesData && matchesData.length > 0) {
            console.log('Premier match players:', matchesData[0]?.players);
            console.log('Structure des données players:', JSON.stringify(matchesData[0]?.players, null, 2));
          }
          setMatches(matchesData || []);
        }

        // Charger les événements de match
        const { data: eventsData, error: eventsError } = await supabase
          .from('match_events')
          .select('*')
          .order('created_at', { ascending: true });

        if (eventsError) {
          console.error('Erreur lors du chargement des événements:', eventsError);
          setMatchEvents([]);
        } else {
          setMatchEvents(eventsData || []);
        }

        // Filtrer les matches qui ont des événements
        if (eventsData && eventsData.length > 0) {
          const matchIdsWithEvents = new Set(eventsData.map(event => event.match_id));
          const matchesWithEvents = (matchesData || []).filter(match => 
            matchIdsWithEvents.has(match.id)
          );
          setMatches(matchesWithEvents);
        }

        // Charger les joueurs qui ont participé aux matchs de l'équipe active
        // (pas seulement ceux qui appartiennent à l'équipe)
        let playersData: any[] = [];
        if (matchesData && matchesData.length > 0) {
          const matchIds = matchesData.map(m => m.id);
          
          // Récupérer tous les événements de ces matchs pour identifier les joueurs participants
          const { data: eventsForPlayers, error: eventsError } = await supabase
            .from('match_events')
            .select('player_id, players_on_field')
            .in('match_id', matchIds);

          if (eventsError) {
            console.error('🏆 Tracker Dashboard - Erreur lors du chargement des événements pour les joueurs:', eventsError);
          } else {
            // Extraire tous les IDs de joueurs uniques qui ont participé
            const playerIds = new Set<string>();
            eventsForPlayers?.forEach(event => {
              if (event.player_id) playerIds.add(event.player_id);
              if (event.players_on_field) {
                event.players_on_field.forEach((id: string) => playerIds.add(id));
              }
            });

            // Récupérer les informations de tous ces joueurs
            if (playerIds.size > 0) {
              const { data: playersFromEvents, error: playersError } = await supabase
                .from('players')
                .select('id, first_name, last_name, position, number')
                .in('id', Array.from(playerIds))
                .order('last_name');

              if (playersError) {
                console.error('🏆 Tracker Dashboard - Erreur lors du chargement des joueurs:', playersError);
              } else {
                playersData = playersFromEvents || [];
              }
            }
          }
        }

        console.log('🏆 Tracker Dashboard - Joueurs récupérés:', playersData?.length || 0);
        setPlayers(playersData || []);

        // Charger les événements de match (filtrés par équipe via les matches)
        const matchIds = matchesData?.map(m => m.id) || [];
        if (matchIds.length > 0) {
          const { data: eventsData, error: eventsError } = await supabase
            .from('match_events')
            .select('*')
            .in('match_id', matchIds)
            .order('created_at', { ascending: true });

          if (eventsError) {
            console.error('🏆 Tracker Dashboard - Erreur lors du chargement des événements:', eventsError);
            setMatchEvents([]);
          } else {
            console.log('🏆 Tracker Dashboard - Événements récupérés:', eventsData?.length || 0);
            setMatchEvents(eventsData || []);
          }
        }
      } catch (error) {
        console.error('🏆 Tracker Dashboard - Erreur lors du chargement des données:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    }
  }, [activeTeam]);

  // Debug: logger l'onglet actif
  useEffect(() => {
    console.log('Dashboard - Onglet actif:', activeTab);
    if (activeTab === 'radar') {
      console.log('Dashboard - Onglet radar actif, composant TeamRadarChart devrait être rendu');
    }
  }, [activeTab]);

  // Fonction pour gérer les filtres de compétition
  const handleCompetitionFilterChange = (competition: 'Amical' | 'Coupe' | 'Championnat') => {
    setCompetitionFilters(prev => ({
      ...prev,
      [competition]: !prev[competition]
    }));
  };

  // Fonction pour obtenir les matches filtrés par compétition
  const getFilteredMatches = () => {
    const activeFilters = Object.entries(competitionFilters)
      .filter(([_, isActive]) => isActive)
      .map(([competition, _]) => competition);
    
    if (activeFilters.length === 0) {
      return []; // Si aucun filtre n'est actif, ne rien afficher
    }
    
    return matches.filter(match => activeFilters.includes(match.competition));
  };

  // Fonction pour obtenir les événements filtrés par compétition
  const getFilteredEvents = () => {
    const filteredMatches = getFilteredMatches();
    const filteredMatchIds = new Set(filteredMatches.map(match => match.id));
    
    return matchEvents.filter(event => filteredMatchIds.has(event.match_id));
  };

  // Fonction pour gérer le tri des statistiques des joueurs
  const handlePlayerStatsSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    
    if (playerStatsSortConfig.key === key) {
      // Si on clique sur la même colonne, inverser la direction
      if (playerStatsSortConfig.direction === 'desc') {
        direction = 'asc';
      } else if (playerStatsSortConfig.direction === 'asc') {
        direction = 'desc';
      }
    }
    
    setPlayerStatsSortConfig({ key, direction });
  };

  // Fonction pour obtenir l'icône de tri des statistiques des joueurs
  const getPlayerStatsSortIcon = (key: string) => {
    if (playerStatsSortConfig.key !== key) {
      return <ChevronsUpDown className="h-4 w-4 text-gray-400" />;
    }
    
    if (playerStatsSortConfig.direction === 'desc') {
      return <ChevronDown className="h-4 w-4 text-blue-600" />;
    } else {
      return <ChevronUp className="h-4 w-4 text-blue-600" />;
    }
  };

  // Fonction pour trier les statistiques des joueurs
  const getSortedPlayerStats = () => {
    if (!playerStatsSortConfig.key || !playerStatsSortConfig.direction) {
      return playerStats.sort((a, b) => b.plusMinus - a.plusMinus);
    }

    return [...playerStats].sort((a, b) => {
      let aValue, bValue;

      switch (playerStatsSortConfig.key) {
        case 'playerName':
          aValue = a.playerName;
          bValue = b.playerName;
          break;
        case 'matchesPlayed':
          aValue = a.matchesPlayed;
          bValue = b.matchesPlayed;
          break;
        case 'totalGoals':
          aValue = a.totalGoals;
          bValue = b.totalGoals;
          break;
        case 'totalShots':
          aValue = a.totalShots;
          bValue = b.totalShots;
          break;
        case 'totalShotsOnTarget':
          aValue = a.totalShotsOnTarget;
          bValue = b.totalShotsOnTarget;
          break;
        case 'totalDribbles':
          aValue = a.totalDribbles;
          bValue = b.totalDribbles;
          break;
        case 'totalBallLoss':
          aValue = a.totalBallLoss;
          bValue = b.totalBallLoss;
          break;
        case 'totalRecoveries':
          aValue = a.totalRecoveries;
          bValue = b.totalRecoveries;
          break;
        case 'totalTime':
          aValue = a.totalTime;
          bValue = b.totalTime;
          break;
        case 'plusMinus':
          aValue = a.plusMinus;
          bValue = b.plusMinus;
          break;
        case 'shotsPlusMinus':
          aValue = a.shotsPlusMinus;
          bValue = b.shotsPlusMinus;
          break;
        default:
          aValue = a.plusMinus;
          bValue = b.plusMinus;
      }

      // Gestion du tri pour les chaînes de caractères
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (playerStatsSortConfig.direction === 'asc') {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      }

      // Gestion du tri pour les nombres
      if (playerStatsSortConfig.direction === 'asc') {
        return (aValue as number) - (bValue as number);
      } else {
        return (bValue as number) - (aValue as number);
      }
    });
  };

  // Calculer les statistiques des joueurs basées sur les événements
  useEffect(() => {
    if (matches.length > 0 && players.length > 0 && matchEvents.length > 0) {
      // Filtrer les événements selon les matches sélectionnés
      const filteredEvents = selectedMatches.length === 0 
        ? matchEvents 
        : matchEvents.filter(event => selectedMatches.includes(event.match_id));

      const stats: PlayerStats[] = players.map(player => {
        // Trouver tous les événements où ce joueur était sur le terrain (filtrés par match)
        const playerEvents = filteredEvents.filter(event => 
          event.players_on_field.includes(player.id)
        );

        // Trouver tous les événements créés par ce joueur (filtrés par match)
        const playerCreatedEvents = filteredEvents.filter(event => 
          event.player_id === player.id
        );

        // Calculer toutes les statistiques détaillées
        const totalGoals = playerCreatedEvents.filter(event => event.event_type === 'goal').length;
        const totalShotsOnTarget = playerCreatedEvents.filter(event => event.event_type === 'shot_on_target').length;
        const totalShotsOffTarget = playerCreatedEvents.filter(event => event.event_type === 'shot').length;
        const totalDribbles = playerCreatedEvents.filter(event => event.event_type === 'dribble').length;
        const totalBallLoss = playerCreatedEvents.filter(event => event.event_type === 'ball_loss').length;
        const totalRecoveries = playerCreatedEvents.filter(event => event.event_type === 'recovery').length;
        const totalYellowCards = playerCreatedEvents.filter(event => event.event_type === 'yellow_card').length;
        const totalRedCards = playerCreatedEvents.filter(event => event.event_type === 'red_card').length;

        // Calculer les statistiques ajustées selon la logique :
        // - Tirs cadrés = tirs cadrés + buts (les buts sont des tirs cadrés)
        // - Tirs totaux = tirs cadrés + tirs non cadrés
        const adjustedGoals = totalGoals;
        const adjustedShotsOnTarget = totalShotsOnTarget + totalGoals; // Tirs cadrés + buts
        const adjustedShots = adjustedShotsOnTarget + totalShotsOffTarget; // Tirs cadrés + tirs non cadrés

        // Debug pour vérifier les calculs
        if (player.first_name === 'Jordan' || player.last_name === 'Jordan') {
          console.log(`🏀 DEBUG Jordan - Événements:`, {
            goals: totalGoals,
            shotsOnTarget: totalShotsOnTarget,
            shotsOffTarget: totalShotsOffTarget,
            adjustedShotsOnTarget,
            adjustedShots,
            events: playerCreatedEvents.map(e => e.event_type)
          });
        }

        // Calculer le +/- basé sur les événements réels
        let plusMinus = 0;
        let shotsPlusMinus = 0;

        // Pour chaque événement où le joueur était sur le terrain ET a un player_id valide
        // (exclure les événements CSC qui ont player_id = NULL)
        playerEvents.filter(event => event.player_id !== null).forEach(event => {
          if (event.event_type === 'goal') {
            plusMinus += 1; // But marqué quand le joueur était sur le terrain
          } else if (event.event_type === 'opponent_goal') {
            plusMinus -= 1; // But encaissé quand le joueur était sur le terrain
          } else if (event.event_type === 'shot_on_target') {
            shotsPlusMinus += 1; // Tir cadré quand le joueur était sur le terrain
          } else if (event.event_type === 'shot') {
            shotsPlusMinus += 1; // Tir non cadré quand le joueur était sur le terrain
          } else if (event.event_type === 'opponent_shot_on_target') {
            shotsPlusMinus -= 1; // Tir cadré adverse quand le joueur était sur le terrain
          } else if (event.event_type === 'opponent_shot') {
            shotsPlusMinus -= 1; // Tir non cadré adverse quand le joueur était sur le terrain
          }
        });

        // Gérer les buts CSC (contre son camp) de l'adversaire
        // Ces événements ont player_id = NULL mais tous les joueurs sur le terrain doivent être crédités
        const cscEvents = filteredEvents.filter(event => 
          event.event_type === 'goal' && 
          event.player_id === null && 
          event.players_on_field && 
          event.players_on_field.includes(player.id)
        );

        // Gérer les buts CSC de notre équipe (contre son camp)
        // Ces événements ont player_id = NULL mais tous les joueurs sur le terrain doivent être débités
        const ourCscEvents = filteredEvents.filter(event => 
          event.event_type === 'opponent_goal' && 
          event.player_id === null && 
          event.players_on_field && 
          event.players_on_field.includes(player.id)
        );
        
        // Debug pour voir les événements CSC
        if (cscEvents.length > 0) {
          console.log(`🔍 DEBUG CSC - ${player.first_name} ${player.last_name} a ${cscEvents.length} but(s) CSC adverse:`, cscEvents);
        }

        // Debug pour voir tous les événements du joueur
        if (player.first_name === 'Adrien' && player.last_name === 'Daniel') {
          console.log(`🔍 DEBUG ${player.first_name} ${player.last_name} - Événements:`, {
            totalEvents: playerEvents.length,
            eventsWithPlayerId: playerEvents.filter(e => e.player_id !== null).length,
            eventsWithNullPlayerId: playerEvents.filter(e => e.player_id === null).length,
            cscEvents: cscEvents.length,
            ourCscEvents: ourCscEvents.length,
            plusMinusBeforeCsc: plusMinus,
            events: playerEvents.map(e => ({
              type: e.event_type,
              playerId: e.player_id,
              playersOnField: e.players_on_field?.length || 0
            }))
          });
        }
        
        cscEvents.forEach(event => {
          plusMinus += 1; // But CSC adverse = +1 pour tous les joueurs sur le terrain
          console.log(`🏆 CSC - ${player.first_name} ${player.last_name} crédité +1 pour but CSC adverse`);
        });

        ourCscEvents.forEach(event => {
          plusMinus -= 1; // But CSC de notre équipe = -1 pour tous les joueurs sur le terrain
          console.log(`⚽ CSC - ${player.first_name} ${player.last_name} débité -1 pour but CSC de notre équipe`);
        });

        // Gérer les tirs CSC (contre son camp) de l'adversaire pour shotsPlusMinus
        const cscShotEvents = filteredEvents.filter(event => 
          (event.event_type === 'shot_on_target' || event.event_type === 'shot') && 
          event.player_id === null && 
          event.players_on_field && 
          event.players_on_field.includes(player.id)
        );
        
        cscShotEvents.forEach(event => {
          shotsPlusMinus += 1; // Tir CSC adverse = +1 pour tous les joueurs sur le terrain
          console.log(`🎯 CSC Shot - ${player.first_name} ${player.last_name} crédité +1 pour tir CSC adverse`);
        });

        // Gérer les tirs CSC de notre équipe pour shotsPlusMinus
        const ourCscShotEvents = filteredEvents.filter(event => 
          (event.event_type === 'opponent_shot_on_target' || event.event_type === 'opponent_shot') && 
          event.player_id === null && 
          event.players_on_field && 
          event.players_on_field.includes(player.id)
        );
        
        ourCscShotEvents.forEach(event => {
          shotsPlusMinus -= 1; // Tir CSC de notre équipe = -1 pour tous les joueurs sur le terrain
          console.log(`🎯 CSC Shot - ${player.first_name} ${player.last_name} débité -1 pour tir CSC de notre équipe`);
        });

        // Récupérer le temps de jeu depuis les données du match
        let totalTime = 0;
        if (selectedMatches.length > 0) {
          // Récupérer le temps de jeu depuis les données du match
          for (const matchId of selectedMatches) {
            const match = matches.find(m => m.id === matchId);
            if (match && match.players) {
              const playerData = match.players.find((p: MatchPlayer) => p.id === player.id);
              if (playerData && playerData.time_played) {
                totalTime += playerData.time_played;
                console.log(`${player.first_name} ${player.last_name} - Match ${match.title}: ${playerData.time_played}s (total: ${totalTime}s)`);
              }
            }
          }
        } else {
          // Si aucun match sélectionné, utiliser tous les matches
          for (const match of matches) {
            if (match.players) {
              const playerData = match.players.find((p: MatchPlayer) => p.id === player.id);
              if (playerData && playerData.time_played) {
                totalTime += playerData.time_played;
                console.log(`${player.first_name} ${player.last_name} - Match ${match.title}: ${playerData.time_played}s (total: ${totalTime}s)`);
              }
            }
          }
        }

        console.log(`${player.first_name} ${player.last_name} - Temps total calculé: ${totalTime}s`);

        // Trouver les matches uniques où le joueur a participé
        const uniqueMatches = new Set(playerEvents.map(event => event.match_id));
        const matchesPlayed = uniqueMatches.size;

        // Debug: afficher les détails pour un joueur spécifique
        if (player.first_name === 'Adrien' && player.last_name === 'Daniel') {
          console.log('Adrien Daniel - Debug:', {
            playerEvents: playerEvents.length,
            goals: totalGoals,
            plusMinus: plusMinus,
            shotsPlusMinus: shotsPlusMinus,
            events: playerEvents.map(event => ({
              type: event.event_type,
              match: matches.find(m => m.id === event.match_id)?.title,
              time: event.match_time_seconds
            }))
          });
        }

        // Debug: afficher les détails pour tous les joueurs
        console.log(`${player.first_name} ${player.last_name} - Debug:`, {
          playerId: player.id,
          playerEvents: playerEvents.length,
          goals: totalGoals,
          plusMinus: plusMinus,
          shotsPlusMinus: shotsPlusMinus,
          events: playerEvents.map(event => ({
            type: event.event_type,
            match: matches.find(m => m.id === event.match_id)?.title,
            time: event.match_time_seconds,
            playersOnField: event.players_on_field
          }))
        });

        return {
          playerId: player.id,
          playerName: `${player.first_name} ${player.last_name}`,
          matchesPlayed,
          totalGoals: adjustedGoals,
          totalShots: adjustedShots,
          totalShotsOnTarget: adjustedShotsOnTarget,
          totalDribbles,
          totalBallLoss,
          totalRecoveries,
          totalYellowCards,
          totalRedCards,
          totalTime,
          plusMinus,
          shotsPlusMinus,
          averageTimePerMatch: matchesPlayed > 0 ? totalTime / matchesPlayed : 0
        };
      });

      setPlayerStats(stats);
    }
  }, [matches, players, matchEvents, selectedMatches]);

  // Générer des données d'actions par type basées sur les événements réels
  useEffect(() => {
    if (matchEvents.length > 0 && players.length > 0) {
      const actions: MatchAction[] = matchEvents.map(event => {
        const match = matches.find(m => m.id === event.match_id);
        const player = event.player_id ? players.find(p => p.id === event.player_id) : null;
        
        return {
          matchId: event.match_id,
          matchTitle: match?.title || 'Match inconnu',
          date: match?.date || '',
          minute: Math.floor(event.match_time_seconds / 60),
          actionType: event.event_type,
          playerId: event.player_id || undefined,
          playerName: player ? `${player.first_name} ${player.last_name}` : 'Adversaire',
          value: 1
        };
      });

      setMatchActions(actions);
    }
  }, [matchEvents, players, matches]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getActionTypeColor = (actionType: string) => {
    const colors: { [key: string]: string } = {
      goal: '#10B981',
      shot_on_target: '#3B82F6',
      shot: '#F59E0B',
      recovery: '#8B5CF6',
      yellow_card: '#F59E0B',
      red_card: '#EF4444',
      dribble: '#06B6D4',
      ball_loss: '#6B7280',
      opponent_goal: '#EF4444',
      opponent_shot_on_target: '#F59E0B',
      opponent_shot: '#6B7280'
    };
    return colors[actionType] || '#6B7280';
  };

  const getActionTypeLabel = (actionType: string) => {
    const labels: { [key: string]: string } = {
      goal: 'But',
      shot_on_target: 'Tir cadré',
      shot: 'Tir',
      recovery: 'Récupération',
      yellow_card: 'Carton jaune',
      red_card: 'Carton rouge',
      dribble: 'Dribble',
      ball_loss: 'Perte de balle',
      opponent_goal: 'But adverse',
      opponent_shot_on_target: 'Tir cadré adverse',
      opponent_shot: 'Tir adverse'
    };
    return labels[actionType] || actionType;
  };

  // Données pour le radar chart


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des données...</p>
        </div>
      </div>
    );
  }

  if (!activeTeam) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Aucune équipe sélectionnée</h1>
          <p className="text-gray-600 mb-6">
            Veuillez sélectionner une équipe dans la sidebar pour afficher le dashboard tracker.
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard Avancé</h1>
              <p className="text-gray-600">Analyse détaillée des performances basée sur les événements réels</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <RefreshCw className="h-4 w-4" />
                Exporter
              </button>
            </div>
          </div>

          {/* Filtres de compétition */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Filtrer par type de compétition :</h3>
            <div className="flex gap-6">
              {(['Amical', 'Coupe', 'Championnat'] as const).map((competition) => (
                <label key={competition} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={competitionFilters[competition]}
                    onChange={() => handleCompetitionFilterChange(competition)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-700 font-medium">{competition}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {(() => {
                const activeFilters = Object.entries(competitionFilters).filter(([_, isActive]) => isActive);
                const filteredMatches = getFilteredMatches();
                return `${activeFilters.length} type(s) sélectionné(s) • ${filteredMatches.length} match(es) affiché(s)`;
              })()}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('plusminus')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === 'plusminus'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              +/- Stats
            </button>
            <button
              onClick={() => setActiveTab('actions')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === 'actions'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="h-4 w-4" />
              Actions par Type
            </button>

            <button
              onClick={() => setActiveTab('radar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === 'radar'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Target className="h-4 w-4" />
              Radar
            </button>

            <button
              onClick={() => setActiveTab('time')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === 'time'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Clock className="h-4 w-4" />
              Temps de Jeu
            </button>
          </div>
        </div>

        {activeTab === 'plusminus' && (
          <div className="space-y-6">
            {/* Filtres */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Filtres</h3>
              
              {/* Sélection des matches */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sélectionner les matches à analyser :
                </label>
                <div className="flex flex-wrap gap-2">
                  {getFilteredMatches().map(match => (
                    <button
                      key={match.id}
                      onClick={() => {
                        setSelectedMatches(prev =>
                          prev.includes(match.id)
                            ? prev.filter(id => id !== match.id)
                            : [...prev, match.id]
                        );
                      }}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedMatches.includes(match.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {match.title}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-gray-500">
                    {selectedMatches.length === 0 
                      ? 'Tous les matches sont sélectionnés' 
                      : `${selectedMatches.length} match(es) sélectionné(s)`
                    }
                  </p>
                  <button
                    onClick={() => {
                      if (selectedMatches.length === 0) {
                        // Désélectionner tous les matches
                        setSelectedMatches([]);
                      } else {
                        // Sélectionner tous les matches filtrés
                        setSelectedMatches(getFilteredMatches().map(match => match.id));
                      }
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {selectedMatches.length === 0 ? 'Désélectionner tout' : 'Sélectionner tout'}
                  </button>
                </div>
              </div>
            </div>

            {/* Graphiques */}
            <div className="grid grid-cols-1 gap-6">
              {/* Stats +/- Buts */}
              <div className="bg-white rounded-lg shadow-lg p-4">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Statistiques +/- (Buts)</h2>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={playerStats} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="playerName" 
                      angle={-45} 
                      textAnchor="end" 
                      height={60}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis allowDataOverflow={false} />
                    <Tooltip 
                      formatter={(value: number) => [
                        `${value > 0 ? '+' : ''}${value}`,
                        '+/- Buts'
                      ]}
                      labelStyle={{ color: '#374151' }}
                    />
                    
                    <Bar 
                      dataKey="plusMinus" 
                      fill="#3B82F6"
                      name="+/- Buts"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Stats +/- Tirs */}
              <div className="bg-white rounded-lg shadow-lg p-4">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Statistiques +/- (Tirs)</h2>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={playerStats} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="playerName" 
                      angle={-45} 
                      textAnchor="end" 
                      height={60}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis allowDataOverflow={false} />
                    <Tooltip 
                      formatter={(value: number) => [
                        `${value > 0 ? '+' : ''}${value}`,
                        '+/- Tirs'
                      ]}
                      labelStyle={{ color: '#374151' }}
                    />
                    
                    <Bar 
                      dataKey="shotsPlusMinus" 
                      fill="#10B981"
                      name="+/- Tirs"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tableau des statistiques */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Statistiques détaillées des joueurs</h3>
              
              {/* Légende des abréviations */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-2 font-medium">Légende des colonnes :</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-500">
                  <div><span className="font-semibold">M</span> = Matches</div>
                  <div><span className="font-semibold">B</span> = Buts</div>
                  <div><span className="font-semibold">T</span> = Tirs totaux</div>
                  <div><span className="font-semibold">TC</span> = Tirs cadrés</div>
                  <div><span className="font-semibold">D</span> = Dribbles</div>
                  <div><span className="font-semibold">PB</span> = Pertes de balle</div>
                  <div><span className="font-semibold">R</span> = Récupérations</div>
                  <div><span className="font-semibold">+/-</span> = Différence buts</div>
                  <div><span className="font-semibold">+/-T</span> = Différence tirs</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                        <button
                          onClick={() => handlePlayerStatsSort('playerName')}
                          className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          Joueur
                          {getPlayerStatsSortIcon('playerName')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <button
                          onClick={() => handlePlayerStatsSort('matchesPlayed')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          M
                          {getPlayerStatsSortIcon('matchesPlayed')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <button
                          onClick={() => handlePlayerStatsSort('totalGoals')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          B
                          {getPlayerStatsSortIcon('totalGoals')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <button
                          onClick={() => handlePlayerStatsSort('totalShots')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          T
                          {getPlayerStatsSortIcon('totalShots')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <button
                          onClick={() => handlePlayerStatsSort('totalShotsOnTarget')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          TC
                          {getPlayerStatsSortIcon('totalShotsOnTarget')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <button
                          onClick={() => handlePlayerStatsSort('totalDribbles')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          D
                          {getPlayerStatsSortIcon('totalDribbles')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <button
                          onClick={() => handlePlayerStatsSort('totalBallLoss')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          PB
                          {getPlayerStatsSortIcon('totalBallLoss')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <button
                          onClick={() => handlePlayerStatsSort('totalRecoveries')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          R
                          {getPlayerStatsSortIcon('totalRecoveries')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                        <button
                          onClick={() => handlePlayerStatsSort('totalTime')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          Temps
                          {getPlayerStatsSortIcon('totalTime')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <button
                          onClick={() => handlePlayerStatsSort('plusMinus')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          +/-
                          {getPlayerStatsSortIcon('plusMinus')}
                        </button>
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                        <button
                          onClick={() => handlePlayerStatsSort('shotsPlusMinus')}
                          className="flex items-center justify-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          +/-T
                          {getPlayerStatsSortIcon('shotsPlusMinus')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getSortedPlayerStats().map((player) => (
                      <tr key={player.playerId} className="hover:bg-gray-50">
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {player.playerName}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                          {player.matchesPlayed}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                          {player.totalGoals}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                          {player.totalShots}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                          {player.totalShotsOnTarget}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                          {player.totalDribbles}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                          {player.totalBallLoss}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                          {player.totalRecoveries}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                          {Math.floor(player.totalTime / 60)}:{(player.totalTime % 60).toString().padStart(2, '0')}
                        </td>
                        <td className={`px-2 py-3 whitespace-nowrap text-sm font-medium text-center ${
                          player.plusMinus > 0 ? 'text-green-600' : 
                          player.plusMinus < 0 ? 'text-red-600' : 'text-gray-500'
                        }`}>
                          {player.plusMinus > 0 ? '+' : ''}{player.plusMinus}
                        </td>
                        <td className={`px-2 py-3 whitespace-nowrap text-sm font-medium text-center ${
                          player.shotsPlusMinus > 0 ? 'text-green-600' : 
                          player.shotsPlusMinus < 0 ? 'text-red-600' : 'text-gray-500'
                        }`}>
                          {player.shotsPlusMinus > 0 ? '+' : ''}{player.shotsPlusMinus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-6">
            {/* Actions par type - Séquences de 5 minutes */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Actions par Type - Séquences de 5 minutes</h2>
              <ActionsByTypeChart events={getFilteredEvents()} selectedMatchIds={selectedMatches} />
            </div>

            {/* Répartition des actions */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Répartition des Actions</h2>
              <ResponsiveContainer width="100%" height={400}>
                <RechartsPieChart>
                  <Pie
                    data={Object.entries(
                      matchActions.reduce((acc, action) => {
                        acc[action.actionType] = (acc[action.actionType] || 0) + action.value;
                        return acc;
                      }, {} as { [key: string]: number })
                    ).map(([type, value]) => ({
                      name: getActionTypeLabel(type),
                      value,
                      fill: getActionTypeColor(type)
                    }))}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                  />
                  <Tooltip />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'radar' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Radar des statistiques d'équipe</h2>
              <TeamRadarChart selectedMatchIds={getFilteredMatches().map(m => m.id)} />
            </div>
          </div>
        )}

        {activeTab === 'time' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Comparaison des Temps de Jeu</h2>
            
            {/* Sélection des joueurs */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sélectionner un joueur :
              </label>
              <div className="flex flex-wrap gap-2">
                {players.map(player => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayers([player.id])}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      selectedPlayers.includes(player.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {player.first_name} {player.last_name}
                  </button>
                ))}
              </div>
            </div>

            {selectedPlayers.length > 0 && (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={matches.map(match => {
                  const playerId = selectedPlayers[0];
                  const player = players.find(p => p.id === playerId);
                  
                  return {
                    match: match.title,
                    time: (() => {
                      // Récupérer le temps de jeu depuis les données du match
                      if (match.players) {
                        const playerData = match.players.find((p: MatchPlayer) => p.id === playerId);
                        if (playerData && playerData.time_played) {
                          return playerData.time_played;
                        }
                      }
                      // Si pas de total_time enregistré, on a 0 temps de jeu
                      return 0;
                    })(),
                    player: `${player?.first_name} ${player?.last_name}`
                  };
                })}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="match" 
                    angle={-45} 
                    textAnchor="end" 
                    height={80}
                    tick={{ fontSize: 9 }}
                  />
                  <YAxis />
                  <Tooltip formatter={(value) => [formatTime(value as number), 'Temps de jeu']} />
                  <Bar dataKey="time" fill="#8B5CF6" />
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Nouveau graphique : Comparaison des temps de jeu totaux par joueur */}
            <div className="mt-8">
              <h3 className="text-lg text-gray-900 font-semibold mb-4">Temps de jeu par joueur et par match</h3>
              
              {/* Sélection des matchs pour ce graphique */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sélectionner les matchs à inclure :
                </label>
                <div className="flex flex-wrap gap-2">
                  {matches.map(match => (
                    <button
                      key={match.id}
                      onClick={() => {
                        if (selectedMatches.includes(match.id)) {
                          setSelectedMatches(prev => prev.filter(id => id !== match.id));
                        } else {
                          setSelectedMatches(prev => [...prev, match.id]);
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedMatches.includes(match.id)
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {match.title}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedMatches(matches.map(m => m.id))}
                    className="px-3 py-1 rounded-full text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Tous
                  </button>
                  <button
                    onClick={() => setSelectedMatches([])}
                    className="px-3 py-1 rounded-full text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Aucun
                  </button>
                </div>
              </div>

              {/* Graphique de comparaison */}
              {(() => {
                const playerData = players.map(player => {
                  // Calculer le temps total du joueur pour les matchs sélectionnés
                  let totalPlayerTime = 0;
                  let matchesCount = 0;
                  
                  if (selectedMatches.length > 0) {
                    // Filtrer sur les matchs sélectionnés
                    for (const matchId of selectedMatches) {
                      const match = matches.find(m => m.id === matchId);
                      if (match && match.players) {
                        const playerData = match.players.find((p: MatchPlayer) => p.id === player.id);
                        if (playerData && playerData.time_played) {
                          totalPlayerTime += playerData.time_played;
                          matchesCount++;
                        }
                      }
                    }
                  } else {
                    // Utiliser tous les matchs si aucun n'est sélectionné
                    for (const match of matches) {
                      if (match.players) {
                        const playerData = match.players.find((p: MatchPlayer) => p.id === player.id);
                        if (playerData && playerData.time_played) {
                          totalPlayerTime += playerData.time_played;
                          matchesCount++;
                        }
                      }
                    }
                  }

                  return {
                    player: `${player.first_name} ${player.last_name}`,
                    totalTime: totalPlayerTime, // Garder en secondes pour le format mm:ss
                    matchesCount: matchesCount,
                    averageTime: matchesCount > 0 ? totalPlayerTime / matchesCount : 0 // Garder en secondes pour le format mm:ss
                  };
                }).filter(playerData => playerData.totalTime > 0)
                .sort((a, b) => b.totalTime - a.totalTime); // Trier par ordre décroissant (en secondes)

                // Debug: afficher les données
                console.log('Données du graphique temps de jeu:', playerData);
                
                // Si aucune donnée, afficher un message
                if (playerData.length === 0) {
                  console.warn('Aucun temps de jeu trouvé dans les données');
                  console.log('Matches disponibles:', matches.map(m => ({ id: m.id, title: m.title, players: m.players })));
                  
                  return (
                    <div className="flex items-center justify-center h-96">
                      <div className="text-center">
                        <div className="text-lg text-gray-600 mb-2">Aucun temps de jeu disponible</div>
                        <div className="text-sm text-gray-500">
                          {matches.length === 0 ? (
                            'Aucun match trouvé dans la base de données'
                          ) : (
                            <>
                              {matches.length} match(s) trouvé(s) mais aucun temps de jeu enregistré.
                              <br />
                              Assurez-vous d'avoir terminé des matchs avec le matchrecorder.
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={playerData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="player" 
                        angle={-45} 
                        textAnchor="end" 
                        height={80}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis 
                        tickFormatter={(value) => {
                          const totalSeconds = Math.round(value as number);
                          const minutes = Math.floor(totalSeconds / 60);
                          const seconds = totalSeconds % 60;
                          return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                        }}
                      />
                      <Tooltip 
                        formatter={(value, name) => [
                          name === 'totalTime' ? (() => {
                            const totalSeconds = Math.round(value as number);
                            const minutes = Math.floor(totalSeconds / 60);
                            const seconds = totalSeconds % 60;
                            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                          })() : 
                          name === 'averageTime' ? (() => {
                            const totalSeconds = Math.round(value as number);
                            const minutes = Math.floor(totalSeconds / 60);
                            const seconds = totalSeconds % 60;
                            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                          })() : 
                          name === 'matchesCount' ? value : (() => {
                            const totalSeconds = Math.round(value as number);
                            const minutes = Math.floor(totalSeconds / 60);
                            const seconds = totalSeconds % 60;
                            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                          })(),
                          name === 'totalTime' ? 'Temps total' : 
                          name === 'averageTime' ? 'Temps moyen' : 
                          name === 'matchesCount' ? 'Nombre de matchs' : name
                        ]}
                        labelFormatter={(label) => `Joueur: ${label}`}
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: '12px' }}
                      />
                      <Bar dataKey="totalTime" fill="#8B5CF6" name="Temps total" />
                      <Bar dataKey="averageTime" fill="#10B981" name="Temps moyen par match joué" />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}

              {/* Statistiques résumées */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-600">Temps de jeu total moyen</div>
                  <div className="text-lg font-semibold text-gray-800">
                    {(() => {
                      const allPlayersData = players.map(player => {
                        let totalTime = 0;
                        let matchesCount = 0;
                        
                        if (selectedMatches.length > 0) {
                          for (const matchId of selectedMatches) {
                            const match = matches.find(m => m.id === matchId);
                            if (match && match.players) {
                              const playerData = match.players.find((p: MatchPlayer) => p.id === player.id);
                              if (playerData && playerData.time_played) {
                                totalTime += playerData.time_played;
                                matchesCount++;
                              }
                            }
                          }
                        } else {
                          for (const match of matches) {
                            if (match.players) {
                              const playerData = match.players.find((p: MatchPlayer) => p.id === player.id);
                              if (playerData && playerData.time_played) {
                                totalTime += playerData.time_played;
                                matchesCount++;
                              }
                            }
                          }
                        }
                        
                        return { totalTime, matchesCount };
                      });
                      
                      const totalTime = allPlayersData.reduce((sum, p) => sum + p.totalTime, 0);
                      const totalMatches = allPlayersData.reduce((sum, p) => sum + p.matchesCount, 0);
                      
                      return totalMatches > 0 ? (() => {
                        const totalSeconds = Math.round(totalTime / totalMatches);
                        const minutes = Math.floor(totalSeconds / 60);
                        const seconds = totalSeconds % 60;
                        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                      })() : '00:00';
                    })()}
                  </div>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-600">Joueurs avec temps</div>
                  <div className="text-lg font-semibold text-gray-800">
                    {(() => {
                      const playersWithTime = players.filter(player => {
                        let hasTime = false;
                        
                        if (selectedMatches.length > 0) {
                          for (const matchId of selectedMatches) {
                            const match = matches.find(m => m.id === matchId);
                            if (match && match.players) {
                              const playerData = match.players.find((p: MatchPlayer) => p.id === player.id);
                              if (playerData && playerData.time_played) {
                                hasTime = true;
                                break;
                              }
                            }
                          }
                        } else {
                          for (const match of matches) {
                            if (match.players) {
                              const playerData = match.players.find((p: MatchPlayer) => p.id === player.id);
                              if (playerData && playerData.time_played) {
                                hasTime = true;
                                break;
                              }
                            }
                          }
                        }
                        
                        return hasTime;
                      });
                      
                      return playersWithTime.length;
                    })()}
                  </div>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-600">Matchs analysés</div>
                  <div className="text-lg font-semibold text-gray-800">
                    {selectedMatches.length > 0 ? selectedMatches.length : matches.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 