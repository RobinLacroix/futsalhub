/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { 
  Play, 
  Pause, 
  Users,
  Target,
  Crosshair,
  Goal,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Trophy,
  Clock,
  X,
  Save,
  Zap,
  Circle,
  Square,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  WifiOff,
  Wifi,
  Database,
  FileText
} from 'lucide-react';

import type { Player, Match, MatchData, LocalMatchEvent, LocalMatchSnapshot } from './types';
import { ACTIONS, DEFAULT_SEQUENCE_TIME_LIMIT } from './constants';
import { formatClock, formatDate } from './utils';
import LiveSummary from './components/LiveSummary';
import { useMatchTimer } from './hooks/useMatchTimer';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useLongPress } from './hooks/useLongPress';
import { insertMatchEvent } from './data';

export default function MatchRecorderPage() {
  const { activeTeam } = useActiveTeam();
  const [matchData, setMatchData] = useState<MatchData>({
    selectedMatch: null,
    isRunning: false,
    currentSequence: 1,
    players: [],
    teamScore: 0,
    opponentScore: 0,
    matchTime: 0,
    currentHalf: 1,
    teamFouls: 0,
    opponentFouls: 0,
    opponentActions: {
      shotsOnTarget: 0,
      shotsOffTarget: 0,
    },
    firstHalfOpponentActions: {
      shotsOnTarget: 0,
      shotsOffTarget: 0,
    },
  });

  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'match' | 'matchInfo' | 'recording' | 'summary'>('match');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showAddMatchForm, setShowAddMatchForm] = useState(false);
  const [newMatch, setNewMatch] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 16), // Format datetime-local
    location: 'Domicile',
    competition: 'Amical',
    opponent_team: '',
    score_team: 0,
    score_opponent: 0,
    goals_by_type: {
      offensive: 0,
      transition: 0,
      cpa: 0,
      superiority: 0
    },
    conceded_by_type: {
      offensive: 0,
      transition: 0,
      cpa: 0,
      superiority: 0
    }
  });

  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  // État pour les informations du match
  const [matchInfo, setMatchInfo] = useState({
    title: '',
    date: '',
    location: 'Domicile',
    competition: 'Amical',
    opponent: ''
  });

  // État pour les joueurs convoqués
  const [convokedPlayers, setConvokedPlayers] = useState<string[]>([]);
  const [starterPlayers, setStarterPlayers] = useState<string[]>([]);
  

  
  // État pour la vue active (saisie ou bilan)
  const [activeView, setActiveView] = useState<'recording' | 'summary'>('recording');
  
  // Clic long générique (souris + tactile), état géré par le hook.
  const { start: startLongPress, end: endLongPress, triggered: longPressTriggered } = useLongPress();

  // État pour le tri des statistiques des joueurs
  const [sortConfig, setSortConfig] = useState<{
    key: string | null;
    direction: 'asc' | 'desc' | null;
  }>({ key: 'totalTime', direction: 'desc' }); // Tri par défaut par temps de jeu décroissant

  // États pour la sélection tactile des joueurs
  const [selectedPlayerForChange, setSelectedPlayerForChange] = useState<string | null>(null);
  const [changeType, setChangeType] = useState<'substitution' | 'swap' | null>(null);

  // Gestion hors ligne : état réseau + persistance/sync locale (extraits dans ./hooks).
  const isOnline = useOnlineStatus();
  const { localEvents, isSyncing, saveToLocalStorage, syncLocalData } = useOfflineSync(matchData, isOnline);

  // Charger les données depuis Supabase
  useEffect(() => {
    if (activeTeam) {
    const loadData = async () => {
      try {
        setLoading(true);
          console.log('🏆 MatchRecorder - Chargement des données pour l\'équipe:', activeTeam.name);
        
          // Charger les matches triés par date (plus récents en premier, filtrés par équipe)
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select('id, title, date, competition, location, score_team, score_opponent, opponent_team')
            .eq('team_id', activeTeam.id)
          .order('date', { ascending: false });

        if (matchesError) {
          console.error('Erreur lors du chargement des matches:', matchesError);
          setMatches([]);
        } else {
          setMatches(matchesData || []);
        }

        // Charger les joueurs via la table de liaison si une équipe est active
        let playersData: any[] | null = null;
        let playersError: any = null;
        
        if (activeTeam?.id) {
          const { data: playerTeamsData, error: ptError } = await supabase
            .from('player_teams')
            .select(`
              player_id,
              players (*)
            `)
            .eq('team_id', activeTeam.id);
          
          if (ptError) {
            playersError = ptError;
          } else {
            playersData = playerTeamsData?.map((item: any) => item.players).filter(Boolean) || [];
            // Trier par nom de famille
            playersData.sort((a: any, b: any) => (a.last_name || '').localeCompare(b.last_name || ''));
          }
        } else {
          // Si aucune équipe active, charger tous les joueurs
          const { data: allPlayersData, error: allPlayersError } = await supabase
            .from('players')
            .select('*')
            .order('last_name');
          
          playersData = allPlayersData;
          playersError = allPlayersError;
        }

        if (playersError) {
          console.error('Erreur lors du chargement des joueurs:', playersError);
          setPlayers([]);
        } else {
          const transformedPlayers: Player[] = (playersData || []).filter((p: any) => p?.status !== 'left').map((player: { id: string; first_name: string; last_name: string; number?: number; age?: number; position?: string }) => {
            if (!player || !player.id || !player.first_name || !player.last_name) {
              return null;
            }
            
            const sequenceTimeLimit =
              typeof (player as any).sequence_time_limit === 'number'
                ? (player as any).sequence_time_limit
                : DEFAULT_SEQUENCE_TIME_LIMIT;

            return {
              id: player.id,
              name: `${player.first_name} ${player.last_name}`,
              number: player.number || 0,
              position: player.position || 'Non défini',
              isStarter: false,
              isOnField: false,
              totalTime: 0,
              currentSequenceTime: 0,
              sequenceTimeLimit,
              stats: {
                shotsOnTarget: 0,
                shotsOffTarget: 0,
                goals: 0,
                ballLoss: 0,
                ballRecovery: 0,
                assists: 0,
                oneOnOneDefLost: 0,
              }
            };
          }).filter(player => player !== null) as Player[];

          setPlayers(transformedPlayers);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
        setMatches([]);
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    }
  }, [activeTeam]);

  // Timer du match : temps de match + temps de jeu par joueur (extrait dans ./hooks).
  useMatchTimer(matchData.isRunning, setMatchData);


  // Détecter l'état de connexion
  // L'état online/offline est géré par useOnlineStatus (./hooks).

  // Le chargement localStorage et l'auto-synchronisation sont gérés par useOfflineSync.

  // Alias vers le helper pur ./utils (formatClock), pour ne pas toucher les call sites.
  const formatTime = formatClock;

  // Fonction pour gérer le tri
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    
    if (sortConfig.key === key) {
      // Si on clique sur la même colonne, inverser la direction
      if (sortConfig.direction === 'desc') {
        direction = 'asc';
      } else if (sortConfig.direction === 'asc') {
        direction = 'desc';
      }
    }
    
    setSortConfig({ key, direction });
  };

  // Fonction pour obtenir l'icône de tri
  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) {
      return <ChevronsUpDown className="h-4 w-4 text-gray-600" />;
    }
    
    if (sortConfig.direction === 'desc') {
      return <ChevronDown className="h-4 w-4 text-blue-600" />;
    } else {
      return <ChevronUp className="h-4 w-4 text-blue-600" />;
    }
  };

  // Fonction pour trier les joueurs
  const getSortedPlayers = () => {
    if (!sortConfig.key || !sortConfig.direction) {
      return matchData.players.sort((a, b) => (b.totalTime || 0) - (a.totalTime || 0));
    }

    return [...matchData.players].sort((a, b) => {
      let aValue, bValue;

      switch (sortConfig.key) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'number':
          aValue = a.number;
          bValue = b.number;
          break;
        case 'goals':
          aValue = a.stats.goals;
          bValue = b.stats.goals;
          break;
        case 'shotsOnTarget':
          aValue = a.stats.shotsOnTarget;
          bValue = b.stats.shotsOnTarget;
          break;
        case 'totalShots':
          aValue = a.stats.shotsOnTarget + a.stats.shotsOffTarget;
          bValue = b.stats.shotsOnTarget + b.stats.shotsOffTarget;
          break;
        case 'ballLoss':
          aValue = a.stats.ballLoss;
          bValue = b.stats.ballLoss;
          break;
        case 'ballRecovery':
          aValue = a.stats.ballRecovery;
          bValue = b.stats.ballRecovery;
          break;
        case 'assists':
          aValue = a.stats.assists;
          bValue = b.stats.assists;
          break;
        case 'totalTime':
          aValue = a.totalTime || 0;
          bValue = b.totalTime || 0;
          break;
        case 'plusMinus':
          aValue = a.stats.plusMinus || 0;
          bValue = b.stats.plusMinus || 0;
          break;
        case 'yellowCards':
          aValue = a.yellowCards || 0;
          bValue = b.yellowCards || 0;
          break;
        case 'redCards':
          aValue = a.redCards || 0;
          bValue = b.redCards || 0;
          break;
        default:
          aValue = a.totalTime || 0;
          bValue = b.totalTime || 0;
      }

      // Gestion du tri pour les chaînes de caractères
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (sortConfig.direction === 'asc') {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      }

      // Gestion du tri pour les nombres
      if (sortConfig.direction === 'asc') {
        return (aValue as number) - (bValue as number);
      } else {
        return (bValue as number) - (aValue as number);
      }
    });
  };

  // Fonctions de gestion hors ligne
  // saveToLocalStorage et syncLocalData sont fournis par useOfflineSync (./hooks).

  const toggleMatch = () => {
    setMatchData(prev => ({
      ...prev,
      isRunning: !prev.isRunning,
      // Ne pas remettre à zéro le currentSequenceTime des joueurs
    }));
  };



  const nextHalf = () => {
    setMatchData(prev => {
      if (prev.currentHalf === 1) {
        // Passer à la deuxième mi-temps : sauvegarder les stats de la première
        return {
      ...prev,
          currentHalf: 2,
          teamFouls: 0,
          opponentFouls: 0,
          matchTime: 0,
          firstHalfOpponentActions: {
            shotsOnTarget: prev.opponentActions.shotsOnTarget,
            shotsOffTarget: prev.opponentActions.shotsOffTarget,
          },
          // Ne pas remettre à zéro les opponentActions, continuer à les cumuler
          // Réinitialiser currentSequenceTime pour tous les joueurs
      players: prev.players.map(player => ({
        ...player,
            currentSequenceTime: 0
          }))
        };
      } else {
        // Retourner à la première mi-temps (reset complet)
        return {
      ...prev,
          currentHalf: 1,
      teamFouls: 0,
      opponentFouls: 0,
      matchTime: 0,
      opponentActions: {
        shotsOnTarget: 0,
        shotsOffTarget: 0,
      },
          firstHalfOpponentActions: {
            shotsOnTarget: 0,
            shotsOffTarget: 0,
          },
          // Réinitialiser currentSequenceTime pour tous les joueurs
          players: prev.players.map(player => ({
            ...player,
            currentSequenceTime: 0
          }))
        };
      }
    });
  };

  const updatePlayerStat = async (playerId: string, statKey: string, increment: boolean = true) => {
    console.log('🚨 DEBUGGING - updatePlayerStat appelé:', { playerId, statKey, increment, matchId: matchData.selectedMatch?.id });
    
    if (!matchData.selectedMatch) return;

    // Mettre à jour l'état local
    let actualDeltaResult = 0;

    setMatchData(prev => {
      const delta = increment ? 1 : -1;

      const targetPlayer = prev.players.find(player => player.id === playerId);
      const currentValue = targetPlayer ? targetPlayer.stats[statKey] || 0 : 0;
      const nextValue = Math.max(currentValue + delta, 0);
      const actualDelta = nextValue - currentValue;
      actualDeltaResult = actualDelta;

      if (actualDelta === 0 && statKey !== 'goals') {
        // Aucun changement à appliquer
        return prev;
      }

      const updatedPlayers = prev.players.map(player => {
        if (player.id !== playerId) {
          return player;
        }

        return {
          ...player,
          stats: {
            ...player.stats,
            [statKey]: nextValue,
          },
        };
      });

      let newTeamScore = prev.teamScore;
      if (statKey === 'goals') {
        if (actualDelta === 0) {
          return prev;
        }

        newTeamScore = Math.max(prev.teamScore + actualDelta, 0);

        const plusMinusDelta = actualDelta > 0 ? 1 : -1;

        const playersWithAdjustments = updatedPlayers.map(player => {
          let updatedStats = player.stats;

          if (player.isOnField) {
            const currentPlusMinus = player.stats.plusMinus || 0;
            const nextPlusMinus = currentPlusMinus + plusMinusDelta;
            if (nextPlusMinus !== currentPlusMinus) {
              updatedStats = {
                ...updatedStats,
                plusMinus: nextPlusMinus,
              };
            }
          }

          if (player.id === playerId) {
            const currentShotsOnTarget = player.stats.shotsOnTarget || 0;
            const nextShotsOnTarget = Math.max(currentShotsOnTarget + actualDelta, 0);
            if (nextShotsOnTarget !== currentShotsOnTarget) {
              updatedStats = {
                ...updatedStats,
                shotsOnTarget: nextShotsOnTarget,
              };
            }
          }

          if (updatedStats !== player.stats) {
            return {
              ...player,
              stats: updatedStats,
            };
          }

          return player;
        });

        return {
          ...prev,
          players: playersWithAdjustments,
          teamScore: newTeamScore,
        };
      } else if (statKey === 'shotsOnTarget') {
        // Un tir cadré est déjà compté dans shotsOnTarget, pas besoin d'incrémenter shotsOffTarget
        // Note: shotsOffTarget représente les tirs non cadrés uniquement
      }

      return {
        ...prev,
        players: updatedPlayers,
        teamScore: newTeamScore
      };
    });

    // Enregistrer l'événement dans la base de données
    if (increment) {
      const playersOnField = matchData.players
        .filter(p => p.isOnField)
        .map(p => p.id);

      const eventType = statKey === 'goals' ? 'goal' : 
                       statKey === 'shotsOnTarget' ? 'shot_on_target' :
                       statKey === 'shotsOffTarget' ? 'shot' :
                       statKey === 'ballRecovery' ? 'recovery' :
                       statKey === 'assists' ? 'assist' :
                       statKey === 'ballLoss' ? 'ball_loss' : 'goal';

      // Log de débogage pour vérifier que players_on_field est correct
      console.log(`[DEBUG] Enregistrement ${statKey}:`, {
        matchId: matchData.selectedMatch.id,
        eventType,
        playerId,
        playersOnField,
        totalPlayersOnField: playersOnField.length,
        allPlayers: matchData.players.map(p => ({ id: p.id, name: p.name, isOnField: p.isOnField }))
      });

      // Créer l'événement local
      const localEvent: LocalMatchEvent = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        match_id: matchData.selectedMatch.id,
        event_type: eventType,
        match_time_seconds: matchData.matchTime,
        half: matchData.currentHalf,
        player_id: playerId,
        players_on_field: playersOnField,
        created_at: new Date().toISOString(),
        synced: false,
      };

      // Essayer de sauvegarder en ligne
      const { error: insertError } = await insertMatchEvent({
        match_id: matchData.selectedMatch.id,
        event_type: eventType,
        match_time_seconds: matchData.matchTime,
        half: matchData.currentHalf,
        player_id: playerId,
        players_on_field: playersOnField,
      });

      if (insertError) {
        console.error(`Erreur lors de l'insertion de l'événement ${statKey}:`, insertError);
        alert(`Impossible d'enregistrer l'événement: ${insertError.message}\n\nVérifiez la console (F12) pour plus de détails.`);
        saveToLocalStorage(localEvent);
      } else {
        console.log(`[DEBUG] ${statKey} enregistré avec succès`);
        localEvent.synced = true;
        // Sauvegarder aussi localement pour backup
        saveToLocalStorage(localEvent);
      }
    } else {
      if (actualDeltaResult === 0) {
        return;
      }

      // Supprimer le dernier événement de ce type
      const eventType = statKey === 'goals' ? 'goal' : 
                       statKey === 'shotsOnTarget' ? 'shot_on_target' :
                       statKey === 'shotsOffTarget' ? 'shot' :
                       statKey === 'ballRecovery' ? 'recovery' :
                       statKey === 'assists' ? 'assist' :
                       statKey === 'ballLoss' ? 'ball_loss' : 'goal';

      const { error: deleteError } = await supabase.rpc('delete_last_event_by_type', {
        p_match_id: matchData.selectedMatch.id,
        p_event_type: eventType,
        p_player_id: playerId
      });

      if (deleteError) {
        console.error(`Erreur lors de la suppression de l'événement ${statKey}:`, deleteError);
      } else {
        console.log(`[DEBUG] ${statKey} supprimé avec succès`);
      }
    }
  };

  const updateOpponentGoal = async (increment: boolean = true) => {
    if (!matchData.selectedMatch) return;

    setMatchData(prev => {
      const delta = increment ? 1 : -1;
      const nextOpponentScore = Math.max(prev.opponentScore + delta, 0);
      const nextShotsOnTarget = Math.max(prev.opponentActions.shotsOnTarget + delta, 0);

      return {
        ...prev,
        opponentScore: nextOpponentScore,
        opponentActions: {
          ...prev.opponentActions,
          shotsOnTarget: nextShotsOnTarget, // Un but adverse ajoute un tir cadré
          shotsOffTarget: prev.opponentActions.shotsOffTarget, // Ne pas compter de tir non cadré pour un but
        },
      };
    });

    // Enregistrer l'événement dans la base de données
    if (increment) {
      const playersOnField = matchData.players
        .filter(p => p.isOnField)
        .map(p => p.id);

      // Log de débogage pour vérifier que players_on_field est correct
      console.log(`[DEBUG] Enregistrement but adverse:`, {
        matchId: matchData.selectedMatch.id,
        eventType: 'opponent_goal',
        playerId: null,
        playersOnField,
        totalPlayersOnField: playersOnField.length,
        allPlayers: matchData.players.map(p => ({ id: p.id, name: p.name, isOnField: p.isOnField }))
      });

      // Mettre à jour les statistiques +/- de tous les joueurs sur le terrain
      setMatchData(prev => ({
        ...prev,
        players: prev.players.map(player => 
          player.isOnField 
            ? { 
                ...player, 
                stats: { 
                  ...player.stats, 
                  plusMinus: (player.stats.plusMinus || 0) - 1 // Décrémenter le +/- de 1
                } 
              }
            : player
        )
      }));

      // Créer l'événement local
      const localEvent: LocalMatchEvent = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        match_id: matchData.selectedMatch.id,
        event_type: 'opponent_goal',
        match_time_seconds: matchData.matchTime,
        half: matchData.currentHalf,
        player_id: null,
        players_on_field: playersOnField,
        created_at: new Date().toISOString(),
        synced: false,
      };

      const { error: insertError } = await insertMatchEvent({
        match_id: matchData.selectedMatch.id,
        event_type: 'opponent_goal',
        match_time_seconds: matchData.matchTime,
        half: matchData.currentHalf,
        player_id: null,
        players_on_field: playersOnField,
      });

      if (insertError) {
        console.error('Erreur lors de l\'insertion de l\'événement but adverse:', insertError);
        alert(`Impossible d'enregistrer le but adverse: ${insertError.message}`);
        saveToLocalStorage(localEvent);
      } else {
        console.log(`[DEBUG] But adverse enregistré avec succès`);
        localEvent.synced = true;
        saveToLocalStorage(localEvent);
      }
    } else {
      // Supprimer le dernier événement de ce type
      const { error: deleteError } = await supabase.rpc('delete_last_event_by_type', {
        p_match_id: matchData.selectedMatch.id,
        p_event_type: 'opponent_goal',
        p_player_id: null
      });

      if (deleteError) {
        console.error('Erreur lors de la suppression de l\'événement but adverse:', deleteError);
      } else {
        // Remettre à jour les statistiques +/- de tous les joueurs sur le terrain (+1 pour annuler le -1)
        setMatchData(prev => ({
          ...prev,
          players: prev.players.map(player => 
            player.isOnField 
              ? { 
                  ...player, 
                  stats: { 
                    ...player.stats, 
                    plusMinus: (player.stats.plusMinus || 0) + 1 // Incrémenter le +/- de 1 pour annuler
                  } 
                }
              : player
          )
        }));
        console.log(`[DEBUG] But adverse supprimé avec succès`);
      }
    }
  };

  const updateOpponentAction = async (actionType: 'shotsOnTarget' | 'shotsOffTarget', increment: boolean = true) => {
    if (!matchData.selectedMatch) return;

    let actualDeltaResult = 0;

    setMatchData(prev => {
      const delta = increment ? 1 : -1;
      const currentValue = prev.opponentActions[actionType] || 0;
      const nextValue = Math.max(currentValue + delta, 0);
      const actualDelta = nextValue - currentValue;
      actualDeltaResult = actualDelta;

      if (actualDelta === 0) {
        return prev;
      }

      return {
        ...prev,
        opponentActions: {
          ...prev.opponentActions,
          [actionType]: nextValue,
        },
      };
    });

    // Enregistrer l'événement dans la base de données
    if (increment) {
      const eventType = actionType === 'shotsOnTarget' ? 'opponent_shot_on_target' : 'opponent_shot';
      const playersOnField = matchData.players
        .filter(p => p.isOnField)
        .map(p => p.id);

      // Créer l'événement local
      const localEvent: LocalMatchEvent = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        match_id: matchData.selectedMatch.id,
        event_type: eventType,
        match_time_seconds: matchData.matchTime,
        half: matchData.currentHalf,
        player_id: null, // NULL pour l'adversaire
        players_on_field: playersOnField,
        created_at: new Date().toISOString(),
        synced: false,
      };

      const { error: insertError } = await insertMatchEvent({
        match_id: matchData.selectedMatch.id,
        event_type: eventType,
        match_time_seconds: matchData.matchTime,
        half: matchData.currentHalf,
        player_id: null,
        players_on_field: playersOnField,
      });

      if (insertError) {
        console.error('Erreur lors de l\'insertion de l\'événement adverse:', insertError);
        alert(`Impossible d'enregistrer l'événement adverse: ${insertError.message}`);
        saveToLocalStorage(localEvent);
      } else {
        localEvent.synced = true;
        saveToLocalStorage(localEvent);
      }
    } else {
      if (actualDeltaResult === 0) {
        return;
      }

      // Supprimer le dernier événement de ce type
      const eventType = actionType === 'shotsOnTarget' ? 'opponent_shot_on_target' : 'opponent_shot';
      await supabase.rpc('delete_last_event_by_type', {
        p_match_id: matchData.selectedMatch.id,
        p_event_type: eventType,
        p_player_id: null
      });
    }
  };

  // Fonctions pour le clic long
  const handleLongPressStart = (playerId: string, statKey: string) => {
    startLongPress(`${playerId}-${statKey}`, () => updatePlayerStat(playerId, statKey, false));
  };

  const handleLongPressEnd = (playerId: string, statKey: string) => {
    endLongPress(`${playerId}-${statKey}`);
  };

  const handleOpponentLongPressStart = (actionType: 'shotsOnTarget' | 'shotsOffTarget' | 'goals') => {
    startLongPress(`opponent-${actionType}`, () =>
      actionType === 'goals'
        ? updateOpponentGoal(false)
        : updateOpponentAction(actionType, false)
    );
  };

  const handleOpponentLongPressEnd = (actionType: 'shotsOnTarget' | 'shotsOffTarget' | 'goals') => {
    endLongPress(`opponent-${actionType}`);
  };

  const handleTeamScoreLongPressStart = () => {
    startLongPress('score-team', () => updateTeamScore(false));
  };

  const handleTeamScoreLongPressEnd = () => {
    endLongPress('score-team');
  };

  const handleFoulLongPressStart = (isTeamFoul: boolean) => {
    startLongPress(isTeamFoul ? 'foul-team' : 'foul-opponent', () => updateFouls(isTeamFoul, false));
  };

  const handleFoulLongPressEnd = (isTeamFoul: boolean) => {
    endLongPress(isTeamFoul ? 'foul-team' : 'foul-opponent');
  };

  // Fonctions pour calculer les statistiques du bilan
  const getTeamStats = () => {
    // Tirs non cadrés uniquement
    const totalShotsOffTarget = matchData.players.reduce((sum, player) => 
      sum + (player.stats.shotsOffTarget || 0), 0
    );
    
    // Tirs cadrés (incluant les buts car un but est un tir cadré)
    const totalShotsOnTarget = matchData.players.reduce((sum, player) => 
      sum + (player.stats.shotsOnTarget || 0), 0
    );
    
    // Tirs totaux = Tirs cadrés + Tirs non cadrés (les buts sont déjà inclus dans les tirs cadrés)
    const totalShots = totalShotsOnTarget + totalShotsOffTarget;

    return {
      totalShots,
      totalShotsOnTarget,
      totalShotsOffTarget,
      opponentShots: matchData.opponentActions.shotsOnTarget + matchData.opponentActions.shotsOffTarget,
      opponentShotsOnTarget: matchData.opponentActions.shotsOnTarget,
      opponentShotsOffTarget: matchData.opponentActions.shotsOffTarget,
    };
  };

  const getTopPlayers = (statKey: keyof Player['stats'], limit: number = 3) => {
    return matchData.players
      .filter(player => player.stats[statKey] > 0)
      .sort((a, b) => (b.stats[statKey] || 0) - (a.stats[statKey] || 0))
      .slice(0, limit);
  };

  const getTopPlayersByTotalShots = (limit: number = 3) => {
    return matchData.players
      .filter(player => {
        const totalShots = (player.stats.shotsOnTarget || 0) + (player.stats.shotsOffTarget || 0);
        return totalShots > 0;
      })
      .sort((a, b) => {
        const totalShotsA = (a.stats.shotsOnTarget || 0) + (a.stats.shotsOffTarget || 0);
        const totalShotsB = (b.stats.shotsOnTarget || 0) + (b.stats.shotsOffTarget || 0);
        return totalShotsB - totalShotsA;
      })
      .slice(0, limit);
  };

  const getTopPlayersByTime = (limit: number = 3) => {
    return matchData.players
      .filter(player => player.totalTime > 0)
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, limit);
  };

  // Vue de bilan en direct pendant l'enregistrement

  const updateFouls = (isTeamFoul: boolean, increment: boolean = true) => {
    setMatchData(prev => {
      const delta = increment ? 1 : -1;
      const teamFoulDelta = isTeamFoul ? delta : 0;
      const opponentFoulDelta = !isTeamFoul ? delta : 0;

      return {
        ...prev,
        teamFouls: Math.max(prev.teamFouls + teamFoulDelta, 0),
        opponentFouls: Math.max(prev.opponentFouls + opponentFoulDelta, 0),
      };
    });
  };

  const updateTeamScore = (increment: boolean = true) => {
    setMatchData(prev => ({
      ...prev,
      teamScore: Math.max(prev.teamScore + (increment ? 1 : -1), 0),
    }));
  };

  const updatePlayerCard = async (playerId: string, cardType: 'yellow' | 'red', increment: boolean = true) => {
    console.log('🚨 DEBUGGING - updatePlayerCard appelé:', { playerId, cardType, increment, matchId: matchData.selectedMatch?.id });
    
    if (!matchData.selectedMatch) return;

    setMatchData(prev => {
      const updatedPlayers = prev.players.map(player => {
        // S'assurer que tous les joueurs ont les propriétés yellowCards et redCards initialisées
        const playerWithCards = {
          ...player,
          yellowCards: player.yellowCards || 0,
          redCards: player.redCards || 0
        };
        
        if (player.id === playerId) {
          const currentValue = cardType === 'yellow' ? playerWithCards.yellowCards : playerWithCards.redCards;
          const newValue = increment ? currentValue + 1 : Math.max(0, currentValue - 1);
          return {
            ...playerWithCards,
            [cardType === 'yellow' ? 'yellowCards' : 'redCards']: newValue
          };
        }
        return playerWithCards;
      });

      return {
        ...prev,
        players: updatedPlayers
      };
    });

    // Enregistrer l'événement dans la base de données
    if (increment) {
      const eventType = cardType === 'yellow' ? 'yellow_card' : 'red_card';
      const playersOnField = matchData.players
        .filter(p => p.isOnField)
        .map(p => p.id);

      // Créer l'événement local
      const localEvent: LocalMatchEvent = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        match_id: matchData.selectedMatch.id,
        event_type: eventType,
        match_time_seconds: matchData.matchTime,
        half: matchData.currentHalf,
        player_id: playerId,
        players_on_field: playersOnField,
        created_at: new Date().toISOString(),
        synced: false
      };

      const { error: insertError } = await insertMatchEvent({
        match_id: matchData.selectedMatch.id,
        event_type: eventType,
        match_time_seconds: matchData.matchTime,
        half: matchData.currentHalf,
        player_id: playerId,
        players_on_field: playersOnField
      });

      if (insertError) {
        console.error('Erreur lors de l\'insertion de l\'événement carte:', insertError);
        alert(`Impossible d'enregistrer la carte: ${insertError.message}`);
        saveToLocalStorage(localEvent);
      } else {
        localEvent.synced = true;
        saveToLocalStorage(localEvent);
      }
    } else {
      // Supprimer le dernier événement de ce type pour ce joueur
      const eventType = cardType === 'yellow' ? 'yellow_card' : 'red_card';
      await supabase.rpc('delete_last_event_by_type', {
        p_match_id: matchData.selectedMatch.id,
        p_event_type: eventType,
        p_player_id: playerId
      });
    }
  };

  const handleCardLongPressStart = (playerId: string, cardType: 'yellow' | 'red') => {
    startLongPress(`${playerId}-${cardType}Card`, () => updatePlayerCard(playerId, cardType, false));
  };

  const handleCardLongPressEnd = (playerId: string, cardType: 'yellow' | 'red') => {
    endLongPress(`${playerId}-${cardType}Card`);
  };

  const selectMatch = async (match: Match) => {
    setSelectedMatch(match);
    
    // Pré-remplir les informations du match
    let formattedDate = '';
    if (match.date) {
      try {
        // Convertir la date ISO en format datetime-local
        const date = new Date(match.date);
        formattedDate = date.toISOString().slice(0, 16); // Format YYYY-MM-DDTHH:MM
      } catch (error) {
        console.error('Erreur lors du formatage de la date:', error);
        formattedDate = '';
      }
    }
    
    setMatchInfo({
      title: match.title || '',
      date: formattedDate,
      location: match.location || 'Domicile',
      competition: match.competition || 'Amical',
      opponent: match.opponent_team || ''
    });
    
    // Vérifier si le match a déjà des données (score final, événements, etc.)
    try {
      // Récupérer les événements existants du match
      const { data: existingEvents, error: eventsError } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', match.id)
        .order('match_time_seconds', { ascending: true });

      if (eventsError) {
        console.error('Erreur lors de la récupération des événements:', eventsError);
      }

      // Récupérer les informations complètes du match
      const { data: matchDetails, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .eq('id', match.id)
        .single();

      if (matchError) {
        console.error('Erreur lors de la récupération des détails du match:', matchError);
      }

      // Un match est considéré comme terminé seulement s'il a un score différent de 0-0
      // ou s'il a des événements enregistrés
      const hasScore = matchDetails && 
                      (matchDetails.score_team !== null && matchDetails.score_team !== undefined) && 
                      (matchDetails.score_opponent !== null && matchDetails.score_opponent !== undefined);
      
      const hasNonZeroScore = hasScore && (matchDetails.score_team > 0 || matchDetails.score_opponent > 0);
      const hasEvents = existingEvents && existingEvents.length > 0;
      
      const isMatchFinished = hasNonZeroScore || hasEvents;
      
      console.log('🔍 Statut du match:', {
        hasScore,
        score_team: matchDetails?.score_team,
        score_opponent: matchDetails?.score_opponent,
        hasNonZeroScore,
        hasEvents,
        eventsCount: existingEvents?.length || 0,
        isMatchFinished
      });

              if (isMatchFinished) {
          console.log('Match terminé détecté, chargement de la vue bilan...');
          
          // Charger les données du match terminé
          await loadFinishedMatchData(match.id, existingEvents || [], matchDetails);
          
          // Passer directement à la vue bilan
          setCurrentStep('summary');
        } else {
        // Match nouveau ou en cours, passer à la configuration
    setCurrentStep('matchInfo');
      }
    } catch (error) {
      console.error('Erreur lors de la vérification du statut du match:', error);
      // En cas d'erreur, passer à la configuration par défaut
      setCurrentStep('matchInfo');
    }
  };

  // Nouvelle fonction pour charger les données d'un match terminé
  const loadFinishedMatchData = async (matchId: string, events: any[], matchDetails: any) => {
    try {
      // Récupérer les événements depuis Supabase
      console.log('🔍 Chargement des événements depuis Supabase pour le match:', matchId);
      const { data: matchEvents, error: eventsError } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

      if (eventsError) {
        console.error('Erreur lors du chargement des événements:', eventsError);
        throw eventsError;
      }

      console.log('🔍 Événements chargés depuis Supabase:', matchEvents?.length || 0);
      
      // Récupérer TOUS les joueurs qui ont participé à ce match
      // (équipe A, équipe B, ou autres équipes)
      let allPlayerIds = new Set<string>();
      let teamPlayers: any[] = [];
      
      console.log('🔍 Debug - Match details:', matchDetails);
      
      // Ajouter les joueurs qui ont des événements
      matchEvents?.forEach(event => {
        if (event.player_id) {
          allPlayerIds.add(event.player_id);
          console.log('🔍 Ajout joueur depuis événement:', event.player_id);
        }
        if (event.players_on_field) {
          event.players_on_field.forEach((id: string) => {
            allPlayerIds.add(id);
            console.log('🔍 Ajout joueur depuis players_on_field:', id);
          });
        }
      });

      // Ajouter les joueurs du match depuis matchDetails.players si disponible
      if (matchDetails.players && Array.isArray(matchDetails.players)) {
        console.log('🔍 Match details.players:', matchDetails.players);
        matchDetails.players.forEach((player: any) => {
          if (player.id) {
            allPlayerIds.add(player.id);
            console.log('🔍 Ajout joueur depuis matchDetails.players:', player.id);
          }
        });
      }

      // IMPORTANT: Charger TOUS les joueurs de la base, pas seulement ceux de l'équipe active
      // car les joueurs de l'équipe B peuvent être dans d'autres équipes
      console.log('🔍 Chargement de TOUS les joueurs de la base pour trouver tous les participants...');
      const { data: allPlayersData, error: allPlayersError } = await supabase
        .from('players')
        .select('*')
        .order('last_name');

      if (allPlayersError) {
        console.error('Erreur lors de la récupération de tous les joueurs:', allPlayersError);
        return;
      }

      console.log('🔍 Tous les joueurs de la base récupérés:', allPlayersData?.length || 0);
      
      // Filtrer pour ne garder que ceux qui ont participé au match
      // IMPORTANT: Inclure tous les joueurs qui apparaissent dans players_on_field
      if (allPlayersData && allPlayerIds.size > 0) {
        teamPlayers = allPlayersData.filter(player => allPlayerIds.has(player.id));
        console.log('🔍 Joueurs filtrés qui ont participé au match:', teamPlayers.length);
        console.log('🔍 IDs des joueurs trouvés:', teamPlayers.map(p => p.id));
      } else if (allPlayersData) {
        // Si pas d'IDs spécifiques, prendre tous les joueurs (fallback)
        teamPlayers = allPlayersData;
        console.log('🔍 Utilisation de tous les joueurs (fallback):', teamPlayers.length);
      }

      // Les joueurs sont déjà chargés et filtrés ci-dessus
      console.log('🔍 Joueurs finaux pour le match:', teamPlayers.length);

      console.log('🔍 Joueurs participants au match:', teamPlayers.length);
      console.log('🔍 IDs des joueurs:', Array.from(allPlayerIds));
      console.log('🔍 Détails des joueurs récupérés:', teamPlayers);

      // Initialiser les joueurs avec leurs statistiques
      const playersWithStats = teamPlayers.map(player => ({
        id: player.id,
        name: `${player.first_name} ${player.last_name}`,
        number: player.number || 0,
        position: player.position || '',
        isStarter: false,
        isOnField: false,
        totalTime: 0,
        currentSequenceTime: 0,
        sequenceTimeLimit:
          typeof (player as any).sequence_time_limit === 'number'
            ? (player as any).sequence_time_limit
            : DEFAULT_SEQUENCE_TIME_LIMIT,
        yellowCards: 0,
        redCards: 0,
        stats: {
          shotsOnTarget: 0,
          shotsOffTarget: 0,
          goals: 0,
          ballLoss: 0,
          ballRecovery: 0,
          assists: 0,
          oneOnOneDefLost: 0,
        }
      }));

      // Reconstituer les statistiques des joueurs à partir des événements
      const playerStatsMap = new Map();
      let teamScore = 0;
      let opponentScore = 0;
      let opponentActions = {
        shotsOnTarget: 0,
        shotsOffTarget: 0
      };

      // Calculer le temps de jeu de chaque joueur depuis les données du match
      const playerTimeMap = new Map<string, number>();
      teamPlayers.forEach(player => {
        playerTimeMap.set(player.id, 0);
      });

      // Récupérer le temps de jeu depuis matchDetails.players (même logique exacte que tracker/dashboard)
      if (matchDetails.players && Array.isArray(matchDetails.players)) {
        console.log('🔍 Match details.players:', matchDetails.players);

        console.log('🔍 Structure de matchDetails.players[0]:', matchDetails.players[0]);
        
        matchDetails.players.forEach((playerData: any) => {
          console.log(`🔍 Traitement joueur ${playerData.id}:`, {
            hasId: !!playerData.id,
            hasTimePlayed: !!playerData.time_played,
            timePlayed: playerData.time_played,
            allFields: Object.keys(playerData)
          });
          
          if (playerData.id && playerData.time_played) {
            const currentTime = playerTimeMap.get(playerData.id) || 0;
            playerTimeMap.set(playerData.id, currentTime + playerData.time_played);
            console.log(`🔍 Joueur ${playerData.id}: temps de jeu = ${playerData.time_played}s (total: ${currentTime + playerData.time_played}s)`);
          } else if (playerData.id) {
            console.log(`🔍 Joueur ${playerData.id}: PAS de temps de jeu (time_played: ${playerData.time_played})`);
          }
        });
      } else {
        console.log('🔍 PAS de matchDetails.players ou pas un array:', matchDetails.players);
      }

      // Debug: afficher le temps de jeu de chaque joueur
      console.log('🔍 Temps de jeu calculé pour chaque joueur:');
      teamPlayers.forEach(player => {
        const time = playerTimeMap.get(player.id) || 0;
        console.log(`🔍 ${player.first_name} ${player.last_name}: ${time}s`);
      });

      // IMPORTANT: Mettre à jour matchData.players avec TOUS les joueurs qui ont participé
      // pour qu'ils soient visibles dans le tableau des statistiques
      const allPlayersWithStats = teamPlayers.map(player => {
        const time = playerTimeMap.get(player.id) || 0;
        const stats = playerStatsMap.get(player.id) || {
          shotsOnTarget: 0,
          shotsOffTarget: 0,
          goals: 0,
          ballLoss: 0,
          ballRecovery: 0,
          assists: 0,
          oneOnOneDefLost: 0,
        };
        
        return {
          id: player.id,
          name: `${player.first_name} ${player.last_name}`,
          number: player.number || 0,
          position: player.position || '',
          isStarter: false,
          isOnField: false,
          totalTime: time, // Temps de jeu depuis matchDetails.players
          currentSequenceTime: 0,
          sequenceTimeLimit:
            typeof (player as any).sequence_time_limit === 'number'
              ? (player as any).sequence_time_limit
              : DEFAULT_SEQUENCE_TIME_LIMIT,
          yellowCards: 0,
          redCards: 0,
          stats: stats
        };
      });

      console.log('🔍 PREMIÈRE mise à jour de matchData.players avec', allPlayersWithStats.length, 'joueurs');
      console.log('🔍 Détail des joueurs:', allPlayersWithStats.map(p => ({ name: p.name, time: p.totalTime })));
      
      // ATTENTION: Ne pas faire cette première mise à jour car elle sera écrasée
      // par la deuxième mise à jour plus bas. On garde seulement les données
      // pour la deuxième mise à jour qui sera la finale.

      // ÉTAPE 1: Initialiser TOUS les joueurs dans playerStatsMap avec +/- à 0
      allPlayersWithStats.forEach(player => {
        playerStatsMap.set(player.id, {
          shotsOnTarget: 0,
          shotsOffTarget: 0,
          goals: 0,
          ballLoss: 0,
          ballRecovery: 0,
          assists: 0,
          oneOnOneDefLost: 0,
          yellowCards: 0,
          redCards: 0,
          totalTime: 0,
          plusMinus: 0 // Initialiser le +/- à 0, sera calculé depuis les événements
        });
      });


      // ÉTAPE 2: Analyser les événements pour les statistiques
      matchEvents?.forEach(event => {
        // Traiter les statistiques personnelles seulement si player_id existe
        if (event.player_id) {
          // Statistiques des joueurs
          if (!playerStatsMap.has(event.player_id)) {
            console.warn('⚠️ Joueur non initialisé trouvé dans les événements:', event.player_id);
            playerStatsMap.set(event.player_id, {
              shotsOnTarget: 0,
              shotsOffTarget: 0,
              goals: 0,
              ballLoss: 0,
              ballRecovery: 0,
              assists: 0,
              oneOnOneDefLost: 0,
              yellowCards: 0,
              redCards: 0,
              totalTime: 0,
              plusMinus: 0
            });
          }

          const playerStats = playerStatsMap.get(event.player_id);
          
          switch (event.event_type) {
            case 'goal':
              playerStats.goals++;
              playerStats.shotsOnTarget++; // Un but est aussi un tir cadré
              break;
            case 'shot_on_target':
              playerStats.shotsOnTarget++;
              break;
            case 'shot':
              playerStats.shotsOffTarget++;
              break;
            case 'ball_loss':
              playerStats.ballLoss++;
              break;
            case 'recovery':
              playerStats.ballRecovery++;
              break;
            case 'assist':
              playerStats.assists++;
              break;
            case 'one_on_one_def_lost':
              playerStats.oneOnOneDefLost++;
              break;
            case 'yellow_card':
              playerStats.yellowCards++;
              break;
            case 'red_card':
              playerStats.redCards++;
              break;
          }
        }

        // Traiter le +/- pour TOUS les événements goal/opponent_goal, même si player_id = NULL
        if (event.event_type === 'goal') {
          teamScore++;
          
          // Incrémenter le +/- de +1 pour tous les joueurs présents sur le terrain
          if (event.players_on_field && Array.isArray(event.players_on_field)) {
            event.players_on_field.forEach((playerId: string) => {
              if (playerStatsMap.has(playerId)) {
                const playerStats = playerStatsMap.get(playerId);
                const oldPlusMinus = playerStats.plusMinus;
                playerStats.plusMinus = (playerStats.plusMinus || 0) + 1;
                
              } else {
                console.warn(`⚠️ Joueur ${playerId} non trouvé dans playerStatsMap pour le but marqué`);
                console.warn(`⚠️ Joueurs disponibles dans playerStatsMap:`, Array.from(playerStatsMap.keys()));
                console.warn(`⚠️ Joueurs sur le terrain:`, event.players_on_field);
              }
            });
          } else {
            console.warn('⚠️ Pas de players_on_field pour le but marqué');
          }
        } else if (event.event_type === 'opponent_goal') {
          opponentScore++;
          opponentActions.shotsOnTarget++;
          opponentActions.shotsOffTarget++;
          
          
          // Décrémenter le +/- de -1 pour tous les joueurs présents sur le terrain
          if (event.players_on_field && Array.isArray(event.players_on_field)) {
            event.players_on_field.forEach((playerId: string) => {
              if (playerStatsMap.has(playerId)) {
                const playerStats = playerStatsMap.get(playerId);
                const oldPlusMinus = playerStats.plusMinus;
                playerStats.plusMinus = (playerStats.plusMinus || 0) - 1;
                
              } else {
                console.warn(`⚠️ Joueur ${playerId} non trouvé dans playerStatsMap pour le but encaissé`);
              }
            });
          } else {
            console.warn('⚠️ Pas de players_on_field pour le but encaissé');
          }
        } else if (event.event_type.startsWith('opponent_')) {
          // Autres actions de l'adversaire
          switch (event.event_type) {
            case 'opponent_shot_on_target':
              opponentActions.shotsOnTarget++;
              opponentActions.shotsOffTarget++;
              break;
            case 'opponent_shot':
              opponentActions.shotsOffTarget++;
              break;
          }
        }
      });


      // Mettre à jour les joueurs avec leurs statistiques ET le temps de jeu
      const updatedPlayers = allPlayersWithStats.map(player => {
        const stats = playerStatsMap.get(player.id);
        
        console.log(`🔍 Mise à jour joueur ${player.name}:`, {
          timeFromMatchDetails: player.totalTime,
          stats: stats || 'aucune'
        });
        
        if (stats) {
          return {
            ...player,
            stats: {
              shotsOnTarget: stats.shotsOnTarget,
              shotsOffTarget: stats.shotsOffTarget,
              goals: stats.goals,
              ballLoss: stats.ballLoss,
              ballRecovery: stats.ballRecovery,
              assists: stats.assists,
              oneOnOneDefLost: stats.oneOnOneDefLost,
              plusMinus: stats.plusMinus || 0, // Ajouter le +/- calculé
            },
            yellowCards: stats.yellowCards,
            redCards: stats.redCards,
            totalTime: player.totalTime // IMPORTANT: Garder le temps depuis allPlayersWithStats
          };
        }
        return player;
      });

      // Mettre à jour le state avec les données du match terminé
      // Utiliser le score réel du match depuis la base de données
      setMatchData(prev => ({
        ...prev,
        selectedMatch: matchDetails,
        players: updatedPlayers,
        teamScore: matchDetails.score_team || 0,
        opponentScore: matchDetails.score_opponent || 0,
        opponentActions: opponentActions,
        isRunning: false
      }));

      // Mettre à jour les informations du match
      setMatchInfo({
        title: matchDetails.title || '',
        date: matchDetails.date ? new Date(matchDetails.date).toISOString().slice(0, 16) : '',
        location: matchDetails.location || 'Domicile',
        competition: matchDetails.competition || 'Amical',
        opponent: matchDetails.opponent_team || ''
      });

      console.log('Données du match terminé chargées avec succès');
    } catch (error) {
      console.error('Erreur lors du chargement des données du match terminé:', error);
    }
  };

  const saveMatchInfo = async () => {
    if (!selectedMatch) return;

    try {
      // Convertir la date en format ISO
      let dateToSave = matchInfo.date;
      if (matchInfo.date) {
        try {
          // Le format datetime-local est déjà compatible avec new Date()
          dateToSave = new Date(matchInfo.date).toISOString();
        } catch (error) {
          console.error('Erreur lors de la conversion de la date:', error);
          alert('Format de date invalide');
          return;
        }
      }

      // Mettre à jour le match dans Supabase
      const { error } = await supabase
        .from('matches')
        .update({
          title: matchInfo.title,
          date: dateToSave,
          location: matchInfo.location,
          competition: matchInfo.competition,
          opponent_team: matchInfo.opponent || null
        })
        .eq('id', selectedMatch.id);

      if (error) {
        console.error('Erreur lors de la mise à jour du match:', error);
        alert('Erreur lors de la mise à jour du match');
        return;
      }

      // Passer directement à l'enregistrement
      const selectedPlayers = players
        .filter(player => convokedPlayers.includes(player.id))
        .map((player) => ({
          ...player,
          isStarter: starterPlayers.includes(player.id),
          isOnField: starterPlayers.includes(player.id),
          totalTime: 0,
          currentSequenceTime: 0,
          yellowCards: 0,
          redCards: 0,
          stats: {
            shotsOnTarget: 0,
            shotsOffTarget: 0,
            goals: 0,
            ballLoss: 0,
            ballRecovery: 0,
            assists: 0,
            oneOnOneDefLost: 0,
          }
        }));

      setMatchData(prev => ({
        ...prev,
        selectedMatch,
        players: selectedPlayers
      }));
      
      setCurrentStep('recording');
    } catch (error) {
      console.error('Erreur lors de la mise à jour du match:', error);
      alert('Erreur lors de la mise à jour du match');
    }
  };

  const togglePlayerConvocation = (playerId: string) => {
    setConvokedPlayers(prev => {
      if (prev.includes(playerId)) {
        // Retirer le joueur des convoqués
        const newConvoked = prev.filter(id => id !== playerId);
        setStarterPlayers(prevStarters => prevStarters.filter(id => id !== playerId));
        return newConvoked;
      } else {
        // Ajouter le joueur aux convoqués
        const newConvoked = [...prev, playerId];
        
        // Si c'est un des 5 premiers, le mettre en titulaire
        if (newConvoked.length <= 5) {
          setStarterPlayers(prevStarters => [...prevStarters, playerId]);
        }
        
        return newConvoked;
      }
    });
  };

  // Fonctions pour le changement de joueurs (remplace le drag & drop)
  const handlePlayerSubstitution = (playerOutId: string, playerInId: string) => {
    try {
      setMatchData(prev => {
        const players = [...prev.players];
        const playerOut = players.find(p => p.id === playerOutId);
        const playerIn = players.find(p => p.id === playerInId);
        
        if (playerOut && playerIn) {
          // Mettre le joueur sortant sur le banc
            const updatedPlayers = players.map(p => 
            p.id === playerOutId 
                ? { ...p, isOnField: false, isStarter: false, currentSequenceTime: 0 }
                : p
            );
            
          // Mettre le joueur entrant sur le terrain
            const finalPlayers = updatedPlayers.map(p => 
            p.id === playerInId 
                ? { ...p, isOnField: true, isStarter: true, currentSequenceTime: 0 }
                : p
            );
            
            return { ...prev, players: finalPlayers };
          } 
        
        return prev;
      });
    } catch (error) {
      console.error('Erreur lors du changement:', error);
    }
  };

  const handlePlayerSwap = (player1Id: string, player2Id: string) => {
    try {
      setMatchData(prev => {
        const players = [...prev.players];
        const player1 = players.find(p => p.id === player1Id);
        const player2 = players.find(p => p.id === player2Id);
        
        if (player1 && player2 && player1.isOnField && player2.isOnField) {
            // Échanger les positions des titulaires
          const player1Index = players.findIndex(p => p.id === player1Id);
          const player2Index = players.findIndex(p => p.id === player2Id);
            
          if (player1Index !== -1 && player2Index !== -1) {
            [players[player1Index], players[player2Index]] = [players[player2Index], players[player1Index]];
            }
            
            return { ...prev, players };
        }
        
        return prev;
      });
    } catch (error) {
      console.error('Erreur lors de l\'échange:', error);
    }
  };

  const resetMatchSelection = () => {
    setMatchData(prev => ({
      ...prev,
      selectedMatch: null,
      players: [],
      isRunning: false,
      currentSequence: 1,
      matchTime: 0,
      currentHalf: 1,
      teamFouls: 0,
      opponentFouls: 0,
      opponentActions: {
        shotsOnTarget: 0,
        shotsOffTarget: 0,
      },
    }));
    setCurrentStep('match');
  };

      const addNewMatch = async () => {
      console.log('addNewMatch called with:', newMatch);
      console.log('Date value:', newMatch.date);
      console.log('Title value:', newMatch.title);
      
      if (!newMatch.title || !newMatch.date) {
        alert('Veuillez remplir tous les champs obligatoires');
        return;
      }

    if (!activeTeam) {
      alert('Aucune équipe active sélectionnée. Veuillez sélectionner une équipe dans la sidebar.');
        return;
      }

    // La sélection des joueurs est optionnelle

    try {
      // Convertir la date en format ISO si nécessaire
      let dateToSave = newMatch.date;
      if (newMatch.date && !newMatch.date.includes('T')) {
        // Si c'est juste une date, ajouter l'heure
        dateToSave = new Date(newMatch.date + 'T00:00:00').toISOString();
      } else if (newMatch.date) {
        // Si c'est déjà un datetime-local, convertir en ISO
        dateToSave = new Date(newMatch.date).toISOString();
      }
      
      // Préparer les données des joueurs (optionnel)
      const playersData = selectedPlayers.length > 0 
        ? selectedPlayers.map(playerId => ({
            id: playerId,
            goals: 0,
            yellow_cards: 0,
            red_cards: 0
          }))
        : [];

      const matchData: any = {
        title: newMatch.title,
        date: dateToSave,
        competition: newMatch.competition,
        location: newMatch.location,
        score_team: newMatch.score_team,
        score_opponent: newMatch.score_opponent,
        opponent_team: newMatch.opponent_team || null,
        goals_by_type: newMatch.goals_by_type,
        conceded_by_type: newMatch.conceded_by_type,
        team_id: activeTeam.id // Ajouter l'ID de l'équipe active
      };

      // N'ajouter le champ players que s'il y a des joueurs sélectionnés
      if (playersData.length > 0) {
        matchData.players = playersData;
      } else {
        // Envoyer explicitement la valeur par défaut
        matchData.players = [];
      }
      
      console.log('Inserting match data:', matchData);
      console.log('Selected players:', selectedPlayers);
      console.log('Players data:', playersData);
      
      const { data, error } = await supabase
        .from('matches')
        .insert([matchData])
        .select();

      if (error) {
        console.error('Erreur lors de la création du match:', error);
        console.error('Error details:', error.message, error.details, error.hint);
        alert(`Erreur lors de la création du match: ${error.message}`);
        return;
      }

      // Recharger les matches
      const { data: matchesData } = await supabase
        .from('matches')
        .select('id, title, date, competition, location, score_team, score_opponent, opponent_team')
        .order('date', { ascending: false });

      setMatches(matchesData || []);
      setShowAddMatchForm(false);
      setNewMatch({ 
        title: '', 
        date: '', 
        location: 'Domicile',
        competition: 'Amical', 
        opponent_team: '',
        score_team: 0,
        score_opponent: 0,
        goals_by_type: {
          offensive: 0,
          transition: 0,
          cpa: 0,
          superiority: 0
        },
        conceded_by_type: {
          offensive: 0,
          transition: 0,
          cpa: 0,
          superiority: 0
        }
      });
      setSelectedPlayers([]);
      
      // Sélectionner automatiquement le nouveau match
      if (data && data[0]) {
        selectMatch(data[0]);
      }
    } catch (error) {
      console.error('Erreur lors de la création du match:', error);
      alert('Erreur lors de la création du match');
    }
  };

  const finishMatch = async () => {
    if (!matchData.selectedMatch) {
      alert('Aucun match sélectionné');
      return;
    }

    try {
      console.log('🚨 DEBUGGING - DÉBUT DE finishMatch()');
      console.log('🚨 DEBUGGING - Match ID:', matchData.selectedMatch.id);
      
      // VÉRIFIER LES ÉVÉNEMENTS EXISTANTS AVANT LA FINALISATION
      const { data: existingEventsBefore, error: eventsError } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchData.selectedMatch.id)
        .order('created_at', { ascending: true });

      if (eventsError) {
        console.error('🚨 DEBUGGING - Erreur lors de la récupération des événements existants:', eventsError);
      } else {
        console.log('🚨 DEBUGGING - Événements DÉJÀ EXISTANTS avant finalisation:', existingEventsBefore?.length || 0);
        if (existingEventsBefore && existingEventsBefore.length > 0) {
          console.log('🚨 DEBUGGING - Détail des événements existants:', existingEventsBefore);
        }
      }

      // Arrêter le chronomètre si en cours
      if (matchData.isRunning) {
        setMatchData(prev => ({ ...prev, isRunning: false }));
      }

      // Préparer les données des joueurs pour la sauvegarde
      console.log('🔍 FINISH MATCH - Préparation des données des joueurs:');
      console.log('🔍 FINISH MATCH - matchData.players:', matchData.players);
      
      const playersData = matchData.players.map(player => {
        const playerData = {
        id: player.id,
        goals: player.stats.goals || 0,
        yellow_cards: player.yellowCards || 0,
          red_cards: player.redCards || 0,
          time_played: player.totalTime || 0,
          plus_minus: player.stats.plusMinus || 0 // Ajouter le +/- pour la cohérence
        };
        
        console.log(`🔍 FINISH MATCH - Joueur ${player.name || player.id}:`, {
          totalTime: player.totalTime,
          time_played: playerData.time_played,
          goals: playerData.goals,
          yellow_cards: playerData.yellow_cards,
          red_cards: playerData.red_cards
        });
        
        return playerData;
      });
      
      console.log('🔍 FINISH MATCH - playersData final:', playersData);

      // Calculer les statistiques globales du match
      const totalGoals = matchData.players.reduce((sum, player) => sum + (player.stats.goals || 0), 0);
      const totalYellowCards = matchData.players.reduce((sum, player) => sum + (player.yellowCards || 0), 0);
      const totalRedCards = matchData.players.reduce((sum, player) => sum + (player.redCards || 0), 0);

      // Mettre à jour le match dans Supabase avec les statistiques finales
      console.log('🔍 FINISH MATCH - Données à sauvegarder en base:', {
        score_team: matchData.teamScore,
        score_opponent: matchData.opponentScore,
        players: playersData,
        match_id: matchData.selectedMatch.id
      });
      
      const { error } = await supabase
        .from('matches')
        .update({
          score_team: matchData.teamScore,
          score_opponent: matchData.opponentScore,
          players: playersData
        })
        .eq('id', matchData.selectedMatch.id);

      if (error) {
        console.error('Erreur lors de la finalisation du match:', error);
        alert('Erreur lors de la finalisation du match');
        return;
      }

      // VÉRIFIER LES ÉVÉNEMENTS APRÈS LA FINALISATION
      const { data: existingEventsAfter, error: eventsAfterError } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchData.selectedMatch.id)
        .order('created_at', { ascending: true });

      if (eventsAfterError) {
        console.error('🚨 DEBUGGING - Erreur lors de la récupération des événements après finalisation:', eventsAfterError);
      } else {
        console.log('🚨 DEBUGGING - Événements APRÈS finalisation:', existingEventsAfter?.length || 0);
        if (existingEventsAfter && existingEventsAfter.length > 0) {
          console.log('🚨 DEBUGGING - Détail des événements après finalisation:', existingEventsAfter);
        }
      }

      // Afficher un message de succès
      alert(`Match terminé et enregistré avec succès !
        
Résumé :
- Score final : ${matchData.teamScore} - ${matchData.opponentScore}
- Temps de jeu : ${formatTime(matchData.matchTime)}
- Buts marqués : ${totalGoals}
- Cartons jaunes : ${totalYellowCards}
- Cartons rouges : ${totalRedCards}

Les statistiques des joueurs ont été sauvegardées dans la base de données.

🚨 DEBUGGING - Vérifiez la console pour les logs de débogage des événements !`);

      // Rediriger vers la page de sélection de match
      setCurrentStep('match');
      setMatchData({
        selectedMatch: null,
        isRunning: false,
        currentSequence: 1,
        players: [],
        teamScore: 0,
        opponentScore: 0,
        matchTime: 0,
        currentHalf: 1,
        teamFouls: 0,
        opponentFouls: 0,
        opponentActions: {
          shotsOnTarget: 0,
          shotsOffTarget: 0,
        },
        firstHalfOpponentActions: {
          shotsOnTarget: 0,
          shotsOffTarget: 0,
        },
      });

    } catch (error) {
      console.error('Erreur lors de la finalisation du match:', error);
      alert('Erreur lors de la finalisation du match');
    }
  };

  // Met un remplaçant directement sur le terrain (sans substitution).
  const addPlayerToField = (playerId: string) => {
    setMatchData(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId
          ? { ...p, isOnField: true, isStarter: true, currentSequenceTime: 0 }
          : p
      ),
    }));
  };

  const handlePlayerSelection = (playerId: string, playerIsOnField: boolean) => {
    const onFieldCount = matchData.players.filter(p => p.isOnField).length;
    if (!selectedPlayerForChange) {
      // Terrain incomplet : un remplaçant tapé rejoint directement le terrain.
      if (!playerIsOnField && onFieldCount < 5) {
        addPlayerToField(playerId);
        return;
      }
      // Premier joueur sélectionné (pour substitution / échange)
      setSelectedPlayerForChange(playerId);
      setChangeType(playerIsOnField ? 'substitution' : 'substitution');
    } else if (selectedPlayerForChange === playerId) {
      // Désélectionner le même joueur
      setSelectedPlayerForChange(null);
      setChangeType(null);
    } else {
      // Deuxième joueur sélectionné - effectuer le changement
      const firstPlayer = matchData.players.find(p => p.id === selectedPlayerForChange);
      const secondPlayer = matchData.players.find(p => p.id === playerId);
      
      if (firstPlayer && secondPlayer) {
        if (firstPlayer.isOnField && !secondPlayer.isOnField) {
          // Titulaire -> Remplaçant
          handlePlayerSubstitution(firstPlayer.id, secondPlayer.id);
        } else if (!firstPlayer.isOnField && secondPlayer.isOnField) {
          // Remplaçant -> Titulaire
          handlePlayerSubstitution(secondPlayer.id, firstPlayer.id);
        } else if (firstPlayer.isOnField && secondPlayer.isOnField && firstPlayer.position !== 'Gardien' && secondPlayer.position !== 'Gardien') {
          // Échange entre titulaires (pas le gardien)
          handlePlayerSwap(firstPlayer.id, secondPlayer.id);
        }
      }
      
      // Réinitialiser la sélection
      setSelectedPlayerForChange(null);
      setChangeType(null);
    }
  };

  // Fonction pour réinitialiser la sélection
  const resetPlayerSelection = () => {
    setSelectedPlayerForChange(null);
    setChangeType(null);
  };

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

  // Étape 1: Sélection du match
  if (currentStep === 'match') {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="w-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Choix du match</h1>
            {!showAddMatchForm && (
              <button
                onClick={() => setShowAddMatchForm(true)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Trophy className="h-5 w-5" />
                Ajouter un match
              </button>
            )}
          </div>

          {/* Formulaire d'ajout de match */}
          {showAddMatchForm && (
            <div className="bg-white rounded-xl shadow-xl p-8 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Ajouter un nouveau match</h2>
                <button
                  onClick={() => setShowAddMatchForm(false)}
                  className="text-gray-600 hover:text-gray-800"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Titre</label>
                  <input
                    type="text"
                    value={newMatch.title}
                    onChange={(e) => setNewMatch(prev => ({ ...prev, title: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="Ex: Match Amical vs Team X"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="datetime-local"
                    value={newMatch.date}
                    onChange={(e) => setNewMatch(prev => ({ ...prev, date: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Lieu</label>
                  <select
                    value={newMatch.location}
                    onChange={(e) => setNewMatch(prev => ({ ...prev, location: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="Domicile">Domicile</option>
                    <option value="Exterieur">Exterieur</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Type de compétition</label>
                  <select
                    value={newMatch.competition}
                    onChange={(e) => setNewMatch(prev => ({ ...prev, competition: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="Championnat">Championnat</option>
                    <option value="Coupe">Coupe</option>
                    <option value="Amical">Amical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Nom de l'adversaire</label>
                  <input
                    type="text"
                    value={newMatch.opponent_team}
                    onChange={(e) => setNewMatch(prev => ({ ...prev, opponent_team: e.target.value }))}
                    placeholder="Ex: Team X (optionnel)"
                    className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Score équipe</label>
                    <input
                      type="number"
                      min="0"
                      value={newMatch.score_team}
                      onChange={(e) => setNewMatch(prev => ({ ...prev, score_team: parseInt(e.target.value) || 0 }))}
                      className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Score adversaire</label>
                    <input
                      type="number"
                      min="0"
                      value={newMatch.score_opponent}
                      onChange={(e) => setNewMatch(prev => ({ ...prev, score_opponent: parseInt(e.target.value) || 0 }))}
                      className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Répartition des buts marqués */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Répartition des buts marqués</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Phase Offensive</label>
                      <input
                        type="number"
                        min="0"
                        value={newMatch.goals_by_type.offensive}
                        onChange={(e) => setNewMatch(prev => ({ 
                          ...prev, 
                          goals_by_type: { 
                            ...prev.goals_by_type, 
                            offensive: parseInt(e.target.value) || 0 
                          } 
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Transition</label>
                      <input
                        type="number"
                        min="0"
                        value={newMatch.goals_by_type.transition}
                        onChange={(e) => setNewMatch(prev => ({ 
                          ...prev, 
                          goals_by_type: { 
                            ...prev.goals_by_type, 
                            transition: parseInt(e.target.value) || 0 
                          } 
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">CPA</label>
                      <input
                        type="number"
                        min="0"
                        value={newMatch.goals_by_type.cpa}
                        onChange={(e) => setNewMatch(prev => ({ 
                          ...prev, 
                          goals_by_type: { 
                            ...prev.goals_by_type, 
                            cpa: parseInt(e.target.value) || 0 
                          } 
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Supériorité</label>
                      <input
                        type="number"
                        min="0"
                        value={newMatch.goals_by_type.superiority}
                        onChange={(e) => setNewMatch(prev => ({ 
                          ...prev, 
                          goals_by_type: { 
                            ...prev.goals_by_type, 
                            superiority: parseInt(e.target.value) || 0 
                          } 
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Répartition des buts encaissés */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Répartition des buts encaissés</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Phase Offensive</label>
                      <input
                        type="number"
                        min="0"
                        value={newMatch.conceded_by_type.offensive}
                        onChange={(e) => setNewMatch(prev => ({ 
                          ...prev, 
                          conceded_by_type: { 
                            ...prev.conceded_by_type, 
                            offensive: parseInt(e.target.value) || 0 
                          } 
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Transition</label>
                      <input
                        type="number"
                        min="0"
                        value={newMatch.conceded_by_type.transition}
                        onChange={(e) => setNewMatch(prev => ({ 
                          ...prev, 
                          conceded_by_type: { 
                            ...prev.conceded_by_type, 
                            transition: parseInt(e.target.value) || 0 
                          } 
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">CPA</label>
                      <input
                        type="number"
                        min="0"
                        value={newMatch.conceded_by_type.cpa}
                        onChange={(e) => setNewMatch(prev => ({ 
                          ...prev, 
                          conceded_by_type: { 
                            ...prev.conceded_by_type, 
                            cpa: parseInt(e.target.value) || 0 
                          } 
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Supériorité</label>
                      <input
                        type="number"
                        min="0"
                        value={newMatch.conceded_by_type.superiority}
                        onChange={(e) => setNewMatch(prev => ({ 
                          ...prev, 
                          conceded_by_type: { 
                            ...prev.conceded_by_type, 
                            superiority: parseInt(e.target.value) || 0 
                          } 
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>


              
              <div className="flex gap-4 mt-6">
                <button
                  onClick={addNewMatch}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Créer le match
                </button>
                <button
                  onClick={() => setShowAddMatchForm(false)}
                  className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Annuler
                </button>
              </div>
              {/* Colonne droite: terrain cliquable (uniquement pendant la saisie, pas sur la page de sélection des matchs) */}
            </div>
          )}

          {/* Grille des matches */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {matches && matches.map((match) => (
              <div
                key={match.id}
                onClick={() => selectMatch(match)}
                className="bg-white rounded-xl shadow-lg cursor-pointer hover:shadow-xl transition-all duration-200 overflow-hidden"
              >
                {/* Logo adversaire (placeholder) */}
                <div className="h-32 bg-gray-100 flex items-center justify-center">
                  <div className="text-gray-600 text-sm">Logo adversaire</div>
                </div>
                
                {/* Détails du match */}
                <div className="p-6 bg-blue-50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-lg text-gray-900">
                      {match.title || 'Match sans titre'}
                    </h3>
                    <div className="text-sm text-gray-600">
                      {match.date ? formatDate(match.date) : 'Date non définie'}
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-2">
                    {match.competition || 'Compétition non définie'}
                  </div>

                  {match.title && match.title.includes('vs') && (
                    <div className="text-sm text-gray-600 mb-2">
                      {match.title}
                    </div>
                  )}
                  
                  {match.score_team !== null && match.score_opponent !== null && (
                    <div className="text-lg font-bold text-blue-600">
                      {match.score_team} - {match.score_opponent}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {matches.length === 0 && !showAddMatchForm && (
            <div className="text-center py-12">
              <Trophy className="h-16 w-16 text-gray-600 mx-auto mb-6" />
              <p className="text-xl text-gray-600">Aucun match disponible</p>
              <p className="text-lg text-gray-500 mt-3">
                Créez votre premier match pour commencer l&apos;enregistrement.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Étape 2: Informations du match (Modal)
  if (currentStep === 'matchInfo') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Informations du match</h2>
            <button
              onClick={() => setCurrentStep('match')}
              className="text-gray-600 hover:text-gray-800 dark:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Informations du match */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Titre
                </label>
                <input
                  type="text"
                  value={matchInfo.title}
                  onChange={(e) => setMatchInfo(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-400 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-600 dark:placeholder-gray-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Date
                </label>
                <input
                  type="datetime-local"
                  value={matchInfo.date}
                  onChange={(e) => setMatchInfo(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-400 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Lieu
                </label>
                <select
                  value={matchInfo.location}
                  onChange={(e) => setMatchInfo(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-400 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="Domicile">Domicile</option>
                  <option value="Exterieur">Exterieur</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Type de compétition
                </label>
                <select
                  value={matchInfo.competition}
                  onChange={(e) => setMatchInfo(prev => ({ ...prev, competition: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-400 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="Amical">Amical</option>
                  <option value="Championnat">Championnat</option>
                  <option value="Coupe">Coupe</option>
                  <option value="Tournoi">Tournoi</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Équipe adverse (optionnel)
                </label>
                <input
                  type="text"
                  value={matchInfo.opponent}
                  onChange={(e) => setMatchInfo(prev => ({ ...prev, opponent: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-400 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-600 dark:placeholder-gray-500"
                  placeholder="Ex: Team X (optionnel)"
                />
              </div>
            </div>

            {/* Joueurs convoqués */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Joueurs Convoqués</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {players && players.map((player) => {
                  const isConvoked = convokedPlayers.includes(player.id);
                  const isStarter = starterPlayers.includes(player.id);
                  
                  let buttonClass = "px-4 py-3 rounded-lg font-medium transition-colors cursor-pointer ";
                  if (isConvoked) {
                    if (isStarter) {
                      buttonClass += "bg-green-500 text-white hover:bg-green-600";
                    } else {
                      buttonClass += "bg-blue-500 text-white hover:bg-blue-600";
                    }
                  } else {
                    buttonClass += "bg-gray-300 text-gray-700 hover:bg-gray-400";
                  }

                  return (
                    <button
                      key={player.id}
                      onClick={() => togglePlayerConvocation(player.id)}
                      className={buttonClass}
                    >
                      {player.name}
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-4 text-sm text-gray-600">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span>Titulaires (5 premiers)</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 bg-blue-500 rounded"></div>
                  <span>Remplaçants</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-300 rounded"></div>
                  <span>Non convoqués</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t">
            <button
              onClick={() => setCurrentStep('match')}
              className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={saveMatchInfo}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save className="h-5 w-5" />
              Enregistrer Match
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Étape 3: Vue bilan du match terminé
  if (currentStep === 'summary') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="w-full">
          {/* Header avec bouton retour */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Bilan du Match</h1>
                {matchData.selectedMatch && (
                  <div className="text-lg text-gray-600 dark:text-gray-600 mt-2">
                    {matchData.selectedMatch.title} - {matchData.selectedMatch.competition}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setActiveView('recording'); setCurrentStep('recording'); }}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  title="Basculer vers la saisie pour compléter ou corriger les données"
                >
                  <Play className="h-5 w-5" />
                  Saisie
                </button>
                <button
                  onClick={() => setCurrentStep('match')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Retour aux matchs
                </button>
              </div>
            </div>

            {/* Score final */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white text-center">
              <div className="text-2xl font-bold mb-2">Score Final</div>
              <div className="text-4xl font-bold">
                {matchData.teamScore} - {matchData.opponentScore}
              </div>
              <div className="text-lg mt-2">
                {matchData.teamScore > matchData.opponentScore ? 'Victoire' : 
                 matchData.teamScore < matchData.opponentScore ? 'Défaite' : 'Match nul'}
              </div>
            </div>
          </div>

          {/* Statistiques détaillées */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Statistiques de l'équipe */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Statistiques de l'équipe</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <div className="text-xl font-bold text-gray-600 dark:text-gray-300">
                      {matchData.players.reduce((sum, player) => sum + player.stats.shotsOnTarget + player.stats.shotsOffTarget, 0)}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">Tirs totaux</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                    <div className="text-xl font-bold text-green-600 dark:text-green-400">
                      {matchData.players.reduce((sum, player) => sum + player.stats.shotsOnTarget, 0)}
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400">Tirs cadrés</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                    <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                      {matchData.players.reduce((sum, player) => sum + player.stats.ballRecovery, 0)}
                    </div>
                    <div className="text-xs text-purple-600 dark:text-purple-400">Récupérations</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                    <div className="text-xl font-bold text-red-600 dark:text-red-400">
                      {matchData.players.reduce((sum, player) => sum + player.stats.ballLoss, 0)}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-400">Pertes de balles amenant une transition</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Statistiques de l'adversaire */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Statistiques de l'adversaire</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <div className="text-xl font-bold text-gray-600 dark:text-gray-300">
                      {matchData.opponentActions.shotsOffTarget}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">Nombre de tirs concédés</div>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                    <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                      {matchData.opponentActions.shotsOnTarget}
                    </div>
                    <div className="text-xs text-yellow-600 dark:text-yellow-400">Nombre tirs cadrés concédés</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Statistiques des joueurs */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Statistiques des joueurs</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                      >
                        Joueur
                        {getSortIcon('name')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('goals')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        Buts
                        {getSortIcon('goals')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('shotsOnTarget')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        Tirs cadrés
                        {getSortIcon('shotsOnTarget')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('totalShots')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        Tirs totaux
                        {getSortIcon('totalShots')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('ballLoss')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        Pertes de balle
                        {getSortIcon('ballLoss')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('ballRecovery')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        Récupérations
                        {getSortIcon('ballRecovery')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('assists')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        Pdec
                        {getSortIcon('assists')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('totalTime')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        Temps
                        {getSortIcon('totalTime')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('plusMinus')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        +/-
                        {getSortIcon('plusMinus')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('yellowCards')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        Cartons J
                        {getSortIcon('yellowCards')}
                      </button>
                    </th>
                    <th className="text-center p-2 font-semibold text-gray-900 dark:text-white text-sm">
                      <button
                        onClick={() => handleSort('redCards')}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors mx-auto"
                      >
                        Cartons R
                        {getSortIcon('redCards')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    console.log('🔍 RENDU - matchData.players contient', matchData.players.length, 'joueurs');
                    console.log('🔍 RENDU - Joueurs avec temps > 0:', matchData.players.filter(p => p.totalTime > 0).length);
                    console.log('🔍 RENDU - Joueurs sans temps:', matchData.players.filter(p => p.totalTime === 0 || !p.totalTime).length);
                    
                    // Afficher TOUS les joueurs qui ont participé au match avec tri
                    return getSortedPlayers()
                      .filter(player => 
                        // Critère principal : joueur présent dans matchData.players
                        // (ce qui signifie qu'il a participé au match)
                        true
                      )
                      .map((player) => (
                      <tr key={player.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
                              {player.number}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white text-sm">{player.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-600">{player.position}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-center p-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded-full font-bold text-xs">
                            {player.stats.goals}
                          </span>
                        </td>
                        <td className="text-center p-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-green-500 text-white rounded-full font-bold text-xs">
                            {player.stats.shotsOnTarget}
                          </span>
                        </td>
                        <td className="text-center p-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-gray-800 text-white rounded-full font-bold text-xs">
                            {player.stats.shotsOnTarget + player.stats.shotsOffTarget}
                          </span>
                        </td>
                        <td className="text-center p-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-red-500 text-white rounded-full font-bold text-xs">
                            {player.stats.ballLoss}
                          </span>
                        </td>
                        <td className="text-center p-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-purple-500 text-white rounded-full font-bold text-xs">
                            {player.stats.ballRecovery}
                          </span>
                        </td>
                                                <td className="text-center p-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-orange-500 text-white rounded-full font-bold text-xs">
                            {player.stats.assists}
                          </span>
                        </td>
                        <td className="text-center p-2">
                          <span className="inline-flex items-center justify-center px-3 py-1 bg-gray-500 text-white rounded-lg font-bold text-xs min-w-[3rem]">
                            {formatTime(player.totalTime)}
                          </span>
                        </td>
                        <td className="text-center p-2">
                          <span className={`inline-flex items-center justify-center px-3 py-1 rounded-lg font-bold text-xs min-w-[2.5rem] ${
                            (player.stats.plusMinus || 0) > 0 ? 'bg-green-500 text-white' :
                            (player.stats.plusMinus || 0) < 0 ? 'bg-red-500 text-white' : 'bg-gray-300 text-gray-700'
                          }`}>
                            {(player.stats.plusMinus || 0) > 0 ? '+' : ''}{(player.stats.plusMinus || 0)}
                          </span>
                        </td>
                        <td className="text-center p-2">
                          {player.yellowCards > 0 && (
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-yellow-500 text-white rounded-full font-bold text-xs">
                              {player.yellowCards}
                            </span>
                          )}
                        </td>
                        <td className="text-center p-2">
                          {player.redCards > 0 && (
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-red-500 text-white rounded-full font-bold text-xs">
                              {player.redCards}
                            </span>
                          )}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>


          {/* Boutons d'action */}
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {matchData.selectedMatch?.id && (
              <button
                onClick={() => window.open(`/webapp/tracker/match-report/${matchData.selectedMatch!.id}`, '_blank')}
                className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-semibold"
              >
                <FileText className="h-5 w-5" />
                Rapport PDF
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Étape 4: Enregistrement du match (Interface complète)
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full">
        {/* Section de contrôle fixe en haut */}
        <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-xl p-3 mb-3 sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Enregistrement Match</h1>
              {matchData.selectedMatch && (
                <div className="text-sm text-gray-600 dark:text-gray-600 font-medium">
                  {matchData.selectedMatch.title} - {matchData.selectedMatch.competition}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {/* Indicateur de connexion */}
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700" title={isOnline ? "Connecté" : "Hors ligne - Données sauvegardées localement"}>
                {isOnline ? (
                  <Wifi className="h-3 w-3 text-green-600" />
                ) : (
                  <WifiOff className="h-3 w-3 text-red-600" />
                )}
                {localEvents.length > 0 && !localEvents.every(e => e.synced) && (
                  <span title={`${localEvents.filter(e => !e.synced).length} événements non synchronisés`}>
                    <Database className="h-3 w-3 text-orange-600 animate-pulse" />
                  </span>
                )}
              </div>
              
              {localEvents.length > 0 && !localEvents.every(e => e.synced) && isOnline && !isSyncing && (
                <button
                  onClick={syncLocalData}
                  className="flex items-center gap-1 px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors text-xs font-semibold"
                  title="Synchroniser les données locales"
                >
                  <RefreshCw className="h-3 w-3" />
                  Sync
                </button>
              )}
              
              
              <button
                onClick={() => setActiveView(activeView === 'recording' ? 'summary' : 'recording')}
                className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs font-semibold ${
                  activeView === 'recording' 
                    ? 'bg-purple-600 text-gray-900 dark:text-white hover:bg-purple-700 shadow-md' 
                    : 'bg-orange-600 text-gray-900 dark:text-white hover:bg-orange-700 shadow-md'
                }`}
              >
                {activeView === 'recording' ? (
                  <>
                    <Target className="h-3 w-3 text-gray-900 dark:text-white" />
                    Bilan
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 text-gray-900 dark:text-white" />
                    Saisie
                  </>
                )}
              </button>
              <button
                onClick={resetMatchSelection}
                className="flex items-center gap-1 px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-xs"
              >
                <Calendar className="h-3 w-3" />
                Changer
              </button>
              <button
                onClick={finishMatch}
                className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs font-semibold"
              >
                <Square className="h-3 w-3" />
                Fin Match
              </button>
            </div>
          </div>

          {/* Contrôles ultra-compacts */}
          <div className="grid grid-cols-4 gap-3">
            {/* Chronomètre du match */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Chronomètre</h3>
                <div className="text-xs text-gray-600 dark:text-gray-600">
                  MT {matchData.currentHalf}/2
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                {/* Temps à gauche */}
                <div className="text-center flex-1">
                  <div className="text-lg font-mono font-bold text-blue-600 dark:text-blue-400">
                    {formatTime(matchData.matchTime)}
                  </div>
                </div>
                
                {/* Boutons empilés à droite */}
                <div className="flex flex-col gap-1 ml-2">
                  <button
                    onClick={toggleMatch}
                    className={`py-2 px-4 rounded text-white font-semibold transition-colors text-xs min-w-[60px] ${
                      matchData.isRunning 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-green-500 hover:bg-green-600'
                    }`}
                  >
                    {matchData.isRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                  
                  <button
                    onClick={nextHalf}
                    className="py-2 px-4 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors font-semibold text-xs min-w-[60px]"
                  >
                    <Zap className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Score du match */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-1">Score</h3>
              
              <div className="flex items-center justify-between">
                {/* Score au centre */}
                <div className="text-center flex-1">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {matchData.teamScore} - {matchData.opponentScore}
                  </div>
                </div>
                
                {/* Boutons à droite */}
                <div className="flex flex-col gap-1 ml-1">
                  <button
                    onClick={() => {
                      const timerKey = 'score-team';
                      if (!longPressTriggered[timerKey]) {
                        updateTeamScore(true);
                      }
                    }}
                    onMouseDown={handleTeamScoreLongPressStart}
                    onMouseUp={handleTeamScoreLongPressEnd}
                    onMouseLeave={handleTeamScoreLongPressEnd}
                    onTouchStart={handleTeamScoreLongPressStart}
                    onTouchEnd={handleTeamScoreLongPressEnd}
                    className="py-2 px-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-semibold text-xs min-w-[60px]"
                  >
                    +1 Éq
                  </button>
                  <button
                    onClick={async () => {
                      const timerKey = 'opponent-goals';
                      if (!longPressTriggered[timerKey]) {
                        await updateOpponentGoal(true);
                      }
                    }}
                    onMouseDown={() => handleOpponentLongPressStart('goals')}
                    onMouseUp={() => handleOpponentLongPressEnd('goals')}
                    onMouseLeave={() => handleOpponentLongPressEnd('goals')}
                    onTouchStart={() => handleOpponentLongPressStart('goals')}
                    onTouchEnd={() => handleOpponentLongPressEnd('goals')}
                    className="py-2 px-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-semibold text-xs min-w-[45px]"
                  >
                    +1 Adv
                  </button>
                </div>
              </div>
            </div>

            {/* Fautes */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-1">Fautes</h3>
              
              <div className="flex items-center justify-between">
                {/* Compteurs de fautes au centre */}
                <div className="flex items-center gap-3 flex-1 justify-center">
                  <div className="text-center">
                    <div className="text-base font-bold text-blue-600 dark:text-blue-400">{matchData.teamFouls}</div>
                    <div className="text-xs text-gray-500">Équipe</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold text-red-600 dark:text-red-400">{matchData.opponentFouls}</div>
                    <div className="text-xs text-gray-500">Adversaire</div>
                  </div>
                </div>
                
                {/* Boutons à droite */}
                <div className="flex flex-col gap-1 ml-2">
                  <button
                    onClick={() => {
                      const timerKey = 'foul-team';
                      if (!longPressTriggered[timerKey]) {
                        updateFouls(true);
                      }
                    }}
                    onMouseDown={() => handleFoulLongPressStart(true)}
                    onMouseUp={() => handleFoulLongPressEnd(true)}
                    onMouseLeave={() => handleFoulLongPressEnd(true)}
                    onTouchStart={() => handleFoulLongPressStart(true)}
                    onTouchEnd={() => handleFoulLongPressEnd(true)}
                    className="py-2 px-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-semibold text-xs min-w-[45px]"
                  >
                    Faute Éq
                  </button>
                  <button
                    onClick={() => {
                      const timerKey = 'foul-opponent';
                      if (!longPressTriggered[timerKey]) {
                        updateFouls(false);
                      }
                    }}
                    onMouseDown={() => handleFoulLongPressStart(false)}
                    onMouseUp={() => handleFoulLongPressEnd(false)}
                    onMouseLeave={() => handleFoulLongPressEnd(false)}
                    onTouchStart={() => handleFoulLongPressStart(false)}
                    onTouchEnd={() => handleFoulLongPressEnd(false)}
                    className="py-2 px-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-semibold text-xs min-w-[45px]"
                  >
                    Faute Adv
                  </button>
                </div>
              </div>
            </div>

            {/* Actions adverses */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-1">Actions adverses</h3>
              
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={async () => {
                    const timerKey = 'opponent-goals';
                    if (!longPressTriggered[timerKey]) {
                      await updateOpponentGoal(true);
                    }
                  }}
                  onMouseDown={() => handleOpponentLongPressStart('goals')}
                  onMouseUp={() => handleOpponentLongPressEnd('goals')}
                  onMouseLeave={() => handleOpponentLongPressEnd('goals')}
                  onTouchStart={() => handleOpponentLongPressStart('goals')}
                  onTouchEnd={() => handleOpponentLongPressEnd('goals')}
                  className="py-3 bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-semibold text-xs active:scale-95"
                  title="Clic court: +1, Clic long: -1"
                >
                  But adverse
                </button>
                <button
                  onClick={async () => {
                    const timerKey = 'opponent-shotsOnTarget';
                    if (!longPressTriggered[timerKey]) {
                      await updateOpponentAction('shotsOnTarget');
                    }
                  }}
                  onMouseDown={() => handleOpponentLongPressStart('shotsOnTarget')}
                  onMouseUp={() => handleOpponentLongPressEnd('shotsOnTarget')}
                  onMouseLeave={() => handleOpponentLongPressEnd('shotsOnTarget')}
                  onTouchStart={() => handleOpponentLongPressStart('shotsOnTarget')}
                  onTouchEnd={() => handleOpponentLongPressEnd('shotsOnTarget')}
                  className="py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors font-semibold text-xs active:scale-95"
                  title="Clic court: +1, Clic long: -1"
                >
                  Tir cadré
                </button>
                <button
                  onClick={async () => {
                    const timerKey = 'opponent-shotsOffTarget';
                    if (!longPressTriggered[timerKey]) {
                      await updateOpponentAction('shotsOffTarget');
                    }
                  }}
                  onMouseDown={() => handleOpponentLongPressStart('shotsOffTarget')}
                  onMouseUp={() => handleOpponentLongPressEnd('shotsOffTarget')}
                  onMouseLeave={() => handleOpponentLongPressEnd('shotsOffTarget')}
                  onTouchStart={() => handleOpponentLongPressStart('shotsOffTarget')}
                  onTouchEnd={() => handleOpponentLongPressEnd('shotsOffTarget')}
                  className="py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors font-semibold text-xs active:scale-95"
                  title="Clic court: +1, Clic long: -1"
                >
                  Tir adverse
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Vue de saisie ou bilan */}
        <div className="pt-2">
          {activeView === 'recording' && (
            matchData.players.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 text-center">
                <Users className="h-16 w-16 text-gray-600 mx-auto mb-6" />
                <p className="text-xl text-gray-600 dark:text-gray-600">Aucun joueur sélectionné</p>
                <p className="text-lg text-gray-500 dark:text-gray-500 mt-3">
                  Sélectionnez des joueurs pour commencer l&apos;enregistrement.
                </p>
              </div>
            ) : (
              <>
                {/* Ligne 1: Titulaires (pleine largeur) */}
                <div className="mb-6">
                  {/* Titulaires : occupent toute la largeur disponible */}
                  <div className="w-full min-w-0">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        Joueurs sur le terrain
                      </h3>
                      
                      {/* Indicateur de sélection et bouton d'annulation */}
                      {selectedPlayerForChange && (
                        <div className="flex items-center gap-3">
                          <div className="text-sm text-blue-600 font-semibold flex items-center gap-2">
                            <span className="animate-pulse">🎯</span>
                            Joueur sélectionné pour changement
                          </div>
                          <button
                            onClick={resetPlayerSelection}
                            className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors active:scale-95"
                            title="Annuler la sélection"
                          >
                            ❌ Annuler
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-3">
                      {matchData.players
                        .filter(player => player.isStarter && player.isOnField)
                        .sort((a, b) => {
                          // Gardien en premier
                          if (a.position === 'Gardien' && b.position !== 'Gardien') return -1;
                          if (a.position !== 'Gardien' && b.position === 'Gardien') return 1;
                          return 0;
                        })
                        .map((player) => {
                          const isOverSequenceLimit = player.currentSequenceTime >= player.sequenceTimeLimit;
                          const baseBorderClass = player.position === 'Gardien'
                            ? 'border-2'
                            : player.isOnField
                              ? 'border-2 border-green-500'
                              : 'border border-gray-200 dark:border-gray-600';
                          const selectionClass =
                            !isOverSequenceLimit && selectedPlayerForChange === player.id
                              ? 'ring-4 ring-blue-500 scale-105 shadow-xl'
                              : '';
                          const alertClass = isOverSequenceLimit
                            ? 'ring-4 ring-red-500 animate-pulse border-red-500'
                            : '';

                          return (
                            <div
                              key={player.id}
                              className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 transition-all duration-200 ${baseBorderClass} ${selectionClass} ${alertClass}`}
                              style={player.position === 'Gardien' ? { borderColor: '#f59e0b' } : {}}
                            >
                              {/* En-tête du joueur */}
                              <div className="text-center mb-3">
                                <div className="font-bold text-sm text-gray-900 dark:text-white">
                                  {player.position === 'Gardien' && <span className="text-amber-500 mr-2">🧤</span>}
                                  {player.name}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-600">
                                  #{player.number} - {player.position}
                                </div>
                                {selectedPlayerForChange === player.id && !isOverSequenceLimit && (
                                  <div className="text-xs text-blue-600 font-bold mt-1">
                                    {changeType === 'substitution' ? '🔄 Sélectionné pour changement' : '↔️ Sélectionné pour échange'}
                                  </div>
                                )}
                                {isOverSequenceLimit && (
                                  <div className="text-xs font-bold text-red-600 mt-1 animate-pulse">
                                    ⏱️ Temps de séquence dépassé
                                  </div>
                                )}
                              </div>

                              {/* Temps de jeu */}
                              <div className="text-center mb-3">
                                <div className="flex justify-between text-xs">
                                  <span className="text-gray-600 dark:text-gray-600">Total</span>
                                  <span className="text-gray-600 dark:text-gray-600">Séquence</span>
                                </div>
                                <div className="flex justify-between font-mono text-sm font-bold">
                                  <span className="text-gray-900 dark:text-white">{formatTime(player.totalTime)}</span>
                                  <span className={`text-gray-900 dark:text-white ${isOverSequenceLimit ? 'text-red-600 animate-pulse font-extrabold' : ''}`}>
                                    {formatTime(player.currentSequenceTime)}
                                  </span>
                                </div>
                                <div className={`mt-1 text-xs font-semibold ${isOverSequenceLimit ? 'text-red-600 animate-pulse' : 'text-gray-500 dark:text-gray-600'}`}>
                                  Limite: {formatTime(player.sequenceTimeLimit)}
                                </div>
                                {isOverSequenceLimit && (
                                  <div className="mt-1 text-xs font-bold text-red-600 animate-pulse">
                                    +{formatTime(player.currentSequenceTime - player.sequenceTimeLimit)} au-delà
                                  </div>
                                )}
                              </div>

                              {/* Actions rapides */}
                              <div className="grid grid-cols-2 gap-2">
                                {ACTIONS.map((action) => {
                                  const IconComponent = action.icon;
                                  return (
                                    <button
                                      key={action.id}
                                      onClick={async () => {
                                        const timerKey = `${player.id}-${action.id}`;
                                        if (!longPressTriggered[timerKey]) {
                                          await updatePlayerStat(player.id, action.id);
                                        }
                                      }}
                                      onMouseDown={() => handleLongPressStart(player.id, action.id)}
                                      onMouseUp={() => handleLongPressEnd(player.id, action.id)}
                                      onMouseLeave={() => handleLongPressEnd(player.id, action.id)}
                                      onTouchStart={() => handleLongPressStart(player.id, action.id)}
                                      onTouchEnd={() => handleLongPressEnd(player.id, action.id)}
                                      className={`flex items-center justify-center gap-1 p-1 rounded text-white font-medium transition-colors text-xs ${action.color} hover:opacity-80 active:scale-95`}
                                      title={`${action.name} - Clic court: +1, Clic long: -1`}
                                    >
                                      <IconComponent className="h-3 w-3" />
                                      <span className="text-xs font-bold action-acronym">{action.acronym}</span>
                                      <span className="text-xs">{player.stats[action.id] || 0}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Cartons */}
                              <div className="flex justify-center gap-3 mt-4">
                                <button
                                  onClick={async () => {
                                    const timerKey = `${player.id}-yellowCard`;
                                    if (!longPressTriggered[timerKey]) {
                                      await updatePlayerCard(player.id, 'yellow');
                                    }
                                  }}
                                  onMouseDown={() => handleCardLongPressStart(player.id, 'yellow')}
                                  onMouseUp={() => handleCardLongPressEnd(player.id, 'yellow')}
                                  onMouseLeave={() => handleCardLongPressEnd(player.id, 'yellow')}
                                  onTouchStart={() => handleCardLongPressStart(player.id, 'yellow')}
                                  onTouchEnd={() => handleCardLongPressEnd(player.id, 'yellow')}
                                  className="flex items-center gap-1 px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600 transition-colors active:scale-95"
                                  title="Clic court: +1, Clic long: -1"
                                >
                                  <Circle className="h-3 w-3" />
                                  <span>{player.yellowCards || 0}</span>
                                </button>
                                <button
                                  onClick={async () => {
                                    const timerKey = `${player.id}-redCard`;
                                    if (!longPressTriggered[timerKey]) {
                                      await updatePlayerCard(player.id, 'red');
                                    }
                                  }}
                                  onMouseDown={() => handleCardLongPressStart(player.id, 'red')}
                                  onMouseUp={() => handleCardLongPressEnd(player.id, 'red')}
                                  onMouseLeave={() => handleCardLongPressEnd(player.id, 'red')}
                                  onTouchStart={() => handleCardLongPressStart(player.id, 'red')}
                                  onTouchEnd={() => handleCardLongPressEnd(player.id, 'red')}
                                  className="flex items-center gap-1 px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors active:scale-95"
                                  title="Clic court: +1, Clic long: -1"
                                >
                                  <Circle className="h-3 w-3" />
                                  <span>{player.redCards || 0}</span>
                                </button>
                              </div>

                              {/* Instructions tactiles */}
                              <div className="mt-4 text-center">
                                <button
                                  onTouchStart={() => handlePlayerSelection(player.id, player.isOnField)}
                                  onMouseDown={() => handlePlayerSelection(player.id, player.isOnField)}
                                  className={`w-full px-2 py-1 rounded text-xs transition-colors ${
                                    selectedPlayerForChange === player.id
                                      ? 'bg-blue-500 text-white'
                                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                  }`}
                                >
                                  {selectedPlayerForChange === player.id ? '✅ Joueur sélectionné' : 'Sélectionner pour changement'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                </div>

                {/* Ligne 2: Remplaçants (pleine largeur) */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    Remplaçants
                  </h3>
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                    {matchData.players
                      .filter(player => !player.isOnField)
                      .sort((a, b) => {
                        // Gardien en dernier
                        if (a.position === 'Gardien' && b.position !== 'Gardien') return 1;
                        if (a.position !== 'Gardien' && b.position === 'Gardien') return -1;
                        return 0;
                      })
                      .map((player) => (
                        <div
                          key={player.id}
                          className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-2 transition-all duration-200 ${
                            selectedPlayerForChange === player.id 
                              ? 'ring-4 ring-blue-500 scale-105 shadow-xl' 
                              : player.position === 'Gardien' 
                              ? 'border-2' 
                              : 'border border-gray-200 dark:border-gray-600'
                          }`}
                          style={player.position === 'Gardien' ? { borderColor: '#f59e0b' } : {}}
                        >
                          {/* En-tête du joueur */}
                          <div className="text-center mb-2">
                            <div className="font-bold text-xs text-gray-900 dark:text-white">
                              {player.position === 'Gardien' && <span className="text-amber-500 mr-2">🧤</span>}
                              {player.name}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-600">#{player.number}</div>
                            {selectedPlayerForChange === player.id && (
                              <div className="text-xs text-blue-600 font-bold mt-1">
                                🔄 Sélectionné pour entrer
                              </div>
                            )}
                          </div>

                          {/* Temps de jeu */}
                          <div className="text-center mb-2">
                            <div className="text-xs text-gray-600 dark:text-gray-600">Total</div>
                            <div className="font-mono text-xs font-bold text-gray-900 dark:text-white">
                              {formatTime(player.totalTime)}
                            </div>
                          </div>

                          {/* Cartons */}
                          <div className="flex justify-center gap-2 mt-3">
                            <button
                              onClick={() => {
                                const timerKey = `${player.id}-yellowCard`;
                                if (!longPressTriggered[timerKey]) {
                                  updatePlayerCard(player.id, 'yellow');
                                }
                              }}
                              onMouseDown={() => handleCardLongPressStart(player.id, 'yellow')}
                              onMouseUp={() => handleCardLongPressEnd(player.id, 'yellow')}
                              onMouseLeave={() => handleCardLongPressEnd(player.id, 'yellow')}
                              onTouchStart={() => handleCardLongPressStart(player.id, 'yellow')}
                              onTouchEnd={() => handleCardLongPressEnd(player.id, 'yellow')}
                              className="flex items-center gap-1 px-1 py-0.5 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600 transition-colors active:scale-95"
                              title="Clic court: +1, Clic long: -1"
                            >
                              <Circle className="h-2 w-2" />
                              <span className="text-xs">{player.yellowCards || 0}</span>
                            </button>
                            <button
                              onClick={() => {
                                const timerKey = `${player.id}-redCard`;
                                if (!longPressTriggered[timerKey]) {
                                  updatePlayerCard(player.id, 'red');
                                }
                              }}
                              onMouseDown={() => handleCardLongPressStart(player.id, 'red')}
                              onMouseUp={() => handleCardLongPressEnd(player.id, 'red')}
                              onMouseLeave={() => handleCardLongPressEnd(player.id, 'red')}
                              onTouchStart={() => handleCardLongPressStart(player.id, 'red')}
                              onTouchEnd={() => handleCardLongPressEnd(player.id, 'red')}
                              className="flex items-center gap-1 px-1 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors active:scale-95"
                              title="Clic court: +1, Clic long: -1"
                            >
                              <Circle className="h-2 w-2" />
                              <span className="text-xs">{player.redCards || 0}</span>
                            </button>
                          </div>

                          {/* Instructions tactiles */}
                          <div className="mt-3 text-center">
                            <button
                              onTouchStart={() => handlePlayerSelection(player.id, player.isOnField)}
                              onMouseDown={() => handlePlayerSelection(player.id, player.isOnField)}
                              className={`w-full px-2 py-1 rounded text-xs transition-colors ${
                                selectedPlayerForChange === player.id
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                              title="Appui long pour sélectionner ce joueur pour un changement"
                            >
                              {selectedPlayerForChange === player.id ? '✅ Sélectionné' : '👆 Appui long pour entrer'}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )
          )}

          {activeView === 'summary' && (
            <LiveSummary
              matchData={matchData}
              getTeamStats={getTeamStats}
              getTopPlayers={getTopPlayers}
              getTopPlayersByTotalShots={getTopPlayersByTotalShots}
              getTopPlayersByTime={getTopPlayersByTime}
            />
          )}
        </div>
      </div>
    </div>
  );
}
