'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  BarChart3,
  TrendingUp,
  Users,
  Clock,
  Target,
  Crosshair,
  Goal,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Filter,
  Download,
  Radar,
  Activity
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar as RechartsRadar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  number: number;
}

interface Match {
  id: string;
  title: string;
  date: string;
  competition: string;
  score_team: number;
  score_opponent: number;
  recorded_with_tracker: boolean;
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
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [matchActions, setMatchActions] = useState<MatchAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'plusminus' | 'actions' | 'radar' | 'time'>('plusminus');

  // Charger les données depuis Supabase
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Charger tous les matches
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select('id, title, date, competition, score_team, score_opponent')
          .order('date', { ascending: false });

        if (matchesError) {
          console.error('Erreur lors du chargement des matches:', matchesError);
          setMatches([]);
        } else {
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

        // Charger les joueurs
        const { data: playersData, error: playersError } = await supabase
          .from('players')
          .select('id, first_name, last_name, position, number')
          .order('last_name');

        if (playersError) {
          console.error('Erreur lors du chargement des joueurs:', playersError);
          setPlayers([]);
        } else {
          setPlayers(playersData || []);
        }

      } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

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
        const totalShots = playerCreatedEvents.filter(event => event.event_type === 'shot').length;
        const totalDribbles = playerCreatedEvents.filter(event => event.event_type === 'dribble').length;
        const totalBallLoss = playerCreatedEvents.filter(event => event.event_type === 'ball_loss').length;
        const totalRecoveries = playerCreatedEvents.filter(event => event.event_type === 'recovery').length;
        const totalYellowCards = playerCreatedEvents.filter(event => event.event_type === 'yellow_card').length;
        const totalRedCards = playerCreatedEvents.filter(event => event.event_type === 'red_card').length;

        // Ajuster les statistiques pour qu'elles soient cohérentes
        // Si un joueur marque un but, il doit aussi avoir un tir cadré et un tir
        const adjustedGoals = totalGoals;
        const adjustedShotsOnTarget = Math.max(totalShotsOnTarget, totalGoals); // Au moins autant de tirs cadrés que de buts
        const adjustedShots = Math.max(totalShots, adjustedShotsOnTarget); // Au moins autant de tirs que de tirs cadrés

        // Calculer le +/- basé sur les événements réels
        let plusMinus = 0;
        let shotsPlusMinus = 0;

        // Pour chaque événement où le joueur était sur le terrain
        playerEvents.forEach(event => {
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

        // Calculer le temps de jeu (approximation basée sur le nombre d'événements)
        const totalTime = playerEvents.length * 30; // 30 secondes par événement en moyenne

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
                <Download className="h-4 w-4" />
                Exporter
              </button>
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
              <TrendingUp className="h-4 w-4" />
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
              <Activity className="h-4 w-4" />
              Actions par Type
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

        {/* Contenu des tabs */}
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
                  {matches.map(match => (
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
                      {match.title} ({new Date(match.date).toLocaleDateString()})
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
                        // Sélectionner tous les matches
                        setSelectedMatches(matches.map(match => match.id));
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Stats +/- Buts */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Statistiques +/- (Buts)</h2>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={playerStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="playerName" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="plusMinus" fill="#3B82F6" name="+/- Buts" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Stats +/- Tirs */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Statistiques +/- (Tirs)</h2>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={playerStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="playerName" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="shotsPlusMinus" fill="#10B981" name="+/- Tirs" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Actions par type dans le temps */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Actions par Type dans le Temps</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={matchActions.slice(0, 50)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="minute" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {['goal', 'shot_on_target', 'recovery', 'yellow_card', 'opponent_goal'].map((actionType, index) => (
                    <Line
                      key={actionType}
                      type="monotone"
                      dataKey="value"
                      data={matchActions.filter(action => action.actionType === actionType)}
                      stroke={getActionTypeColor(actionType)}
                      name={getActionTypeLabel(actionType)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Répartition des actions */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Répartition des Actions</h2>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
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
                </PieChart>
              </ResponsiveContainer>
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
                  const playerEvents = matchEvents.filter(event => 
                    event.match_id === match.id && event.players_on_field.includes(playerId)
                  );
                  const player = players.find(p => p.id === playerId);
                  
                  return {
                    match: match.title,
                    time: playerEvents.length * 30, // 30 secondes par événement en moyenne
                    player: `${player?.first_name} ${player?.last_name}`
                  };
                })}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="match" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip formatter={(value) => [formatTime(value as number), 'Temps de jeu']} />
                  <Legend />
                  <Bar dataKey="time" fill="#8B5CF6" name="Temps de jeu" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 