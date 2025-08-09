'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  Download,
  Users,
  Clock,
  Target,
  Crosshair,
  Goal,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Calendar,
  CheckCircle
} from 'lucide-react';

interface Player {
  id: string;
  name: string;
  number: number;
  position: string;
  isStarter: boolean;
  isOnField: boolean;
  totalTime: number; // en secondes
  currentSequenceTime: number; // en secondes
  stats: {
    shotsOnTarget: number;
    shotsOffTarget: number;
    goals: number;
    ballLoss: number;
    ballRecovery: number;
    missedPass: number;
    fouls: number;
    [key: string]: number; // pour les indicateurs personnalisés
  };
}

interface CustomIndicator {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface Match {
  id: string;
  title: string;
  date: string;
  competition: string;
  score_team?: number;
  score_opponent?: number;
}

interface MatchData {
  selectedMatch: Match | null;
  isRunning: boolean;
  currentSequence: number;
  sequences: Array<{
    id: number;
    startTime: Date;
    endTime?: Date;
    duration: number;
  }>;
  players: Player[];
  customIndicators: CustomIndicator[];
}



const DEFAULT_INDICATORS = [
  { id: 'shotsOnTarget', name: 'Tir cadré', icon: 'Target', color: 'bg-green-500' },
  { id: 'shotsOffTarget', name: 'Tir non cadré', icon: 'Crosshair', color: 'bg-yellow-500' },
  { id: 'goals', name: 'But', icon: 'Goal', color: 'bg-blue-500' },
  { id: 'ballLoss', name: 'Perte de balle', icon: 'AlertTriangle', color: 'bg-red-500' },
  { id: 'ballRecovery', name: 'Récupération', icon: 'RefreshCw', color: 'bg-green-600' },
  { id: 'missedPass', name: 'Passe ratée', icon: 'ArrowRight', color: 'bg-orange-500' },
  { id: 'fouls', name: 'Faute', icon: 'AlertTriangle', color: 'bg-red-600' },
];

export default function TrackerPage() {
  const [matchData, setMatchData] = useState<MatchData>({
    selectedMatch: null,
    isRunning: false,
    currentSequence: 1,
    sequences: [],
    players: [],
    customIndicators: [],
  });

  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMatchSelector, setShowMatchSelector] = useState(true);

  const [showCustomIndicatorForm, setShowCustomIndicatorForm] = useState(false);
  const [newIndicator, setNewIndicator] = useState({ name: '', icon: '', color: 'bg-blue-500' });
  const [draggedPlayer, setDraggedPlayer] = useState<Player | null>(null);

  // Charger les matches et joueurs depuis Supabase
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Charger les matches
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

        // Charger les joueurs
        const { data: playersData, error: playersError } = await supabase
          .from('players')
          .select('id, first_name, last_name, age, position, strong_foot, status')
          .order('last_name');

        if (playersError) {
          console.error('Erreur lors du chargement des joueurs:', playersError);
          setPlayers([]);
                } else {
          // Transformer les données des joueurs
          const transformedPlayers: Player[] = (playersData || []).map((player: { id: string; first_name: string; last_name: string; age: number; position: string; strong_foot: string; status: string }) => ({
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            number: player.age || 0, // Utiliser l'âge comme numéro temporaire
            position: player.position || 'Non défini',
            isStarter: false, // Sera défini lors de la sélection du match
            isOnField: false,
            totalTime: 0,
            currentSequenceTime: 0,
            stats: {
              shotsOnTarget: 0,
              shotsOffTarget: 0,
              goals: 0,
              ballLoss: 0,
              ballRecovery: 0,
              missedPass: 0,
              fouls: 0,
            }
          }));

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
  }, []);

  // Timer pour mettre à jour les temps de jeu
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (matchData.isRunning) {
      interval = setInterval(() => {
        setMatchData(prev => ({
          ...prev,
          players: prev.players.map(player => ({
            ...player,
            totalTime: player.isOnField ? player.totalTime + 1 : player.totalTime,
            currentSequenceTime: player.isOnField ? player.currentSequenceTime + 1 : player.currentSequenceTime,
          }))
        }));
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [matchData.isRunning]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleMatch = () => {
    setMatchData(prev => {
      if (prev.isRunning) {
        // Arrêter la séquence actuelle
        const updatedSequences = [...prev.sequences];
        if (updatedSequences.length > 0) {
          updatedSequences[updatedSequences.length - 1].endTime = new Date();
          updatedSequences[updatedSequences.length - 1].duration = 
            (updatedSequences[updatedSequences.length - 1].endTime!.getTime() - 
             updatedSequences[updatedSequences.length - 1].startTime.getTime()) / 1000;
        }
        
        return {
          ...prev,
          isRunning: false,
          sequences: updatedSequences,
        };
      } else {
        // Démarrer une nouvelle séquence
        const newSequence = {
          id: prev.currentSequence,
          startTime: new Date(),
          duration: 0,
        };
        
        return {
          ...prev,
          isRunning: true,
          sequences: [...prev.sequences, newSequence],
          players: prev.players.map(player => ({
            ...player,
            currentSequenceTime: 0,
          })),
        };
      }
    });
  };

  const nextSequence = () => {
    setMatchData(prev => {
      // Arrêter la séquence actuelle
      const updatedSequences = [...prev.sequences];
      if (updatedSequences.length > 0) {
        updatedSequences[updatedSequences.length - 1].endTime = new Date();
        updatedSequences[updatedSequences.length - 1].duration = 
          (updatedSequences[updatedSequences.length - 1].endTime!.getTime() - 
           updatedSequences[updatedSequences.length - 1].startTime.getTime()) / 1000;
      }
      
      return {
        ...prev,
        currentSequence: prev.currentSequence + 1,
        players: prev.players.map(player => ({
          ...player,
          currentSequenceTime: 0,
        })),
      };
    });
  };

  const updatePlayerStat = (playerId: string, statKey: string) => {
    setMatchData(prev => ({
      ...prev,
      players: prev.players.map(player => 
        player.id === playerId 
          ? { ...player, stats: { ...player.stats, [statKey]: player.stats[statKey] + 1 } }
          : player
      )
    }));
  };

  const handleDragStart = (e: React.DragEvent, player: Player) => {
    setDraggedPlayer(player);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetPlayer: Player) => {
    e.preventDefault();
    
    if (draggedPlayer && draggedPlayer.id !== targetPlayer.id) {
      setMatchData(prev => ({
        ...prev,
        players: prev.players.map(player => {
          if (player.id === draggedPlayer.id) {
            return { ...player, isOnField: targetPlayer.isOnField };
          }
          if (player.id === targetPlayer.id) {
            return { ...player, isOnField: !targetPlayer.isOnField };
          }
          return player;
        })
      }));
    }
    
    setDraggedPlayer(null);
  };

  const addCustomIndicator = () => {
    if (newIndicator.name.trim()) {
      const indicator: CustomIndicator = {
        id: `custom_${Date.now()}`,
        name: newIndicator.name,
        icon: newIndicator.icon || 'Plus',
        color: newIndicator.color,
      };
      
      setMatchData(prev => ({
        ...prev,
        customIndicators: [...prev.customIndicators, indicator],
        players: prev.players.map(player => ({
          ...player,
          stats: { ...player.stats, [indicator.id]: 0 }
        }))
      }));
      
      setNewIndicator({ name: '', icon: '', color: 'bg-blue-500' });
      setShowCustomIndicatorForm(false);
    }
  };

  const exportData = () => {
    const data = {
      matchInfo: matchData.selectedMatch,
      matchData,
      exportTime: new Date().toISOString(),
      totalMatchTime: matchData.players.reduce((sum, player) => sum + player.totalTime, 0),
      summary: {
        totalGoals: matchData.players.reduce((sum, player) => sum + player.stats.goals, 0),
        totalShots: matchData.players.reduce((sum, player) => sum + player.stats.shotsOnTarget + player.stats.shotsOffTarget, 0),
        totalFouls: matchData.players.reduce((sum, player) => sum + player.stats.fouls, 0),
      }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match_data_${matchData.selectedMatch?.title || 'unknown'}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getIconComponent = (iconName: string) => {
    const iconMap: { [key: string]: React.ComponentType<{ className?: string }> } = {
      Target, Crosshair, Goal, AlertTriangle, RefreshCw, ArrowRight, ArrowLeft, Plus
    };
    return iconMap[iconName] || Plus;
  };

  const allIndicators = [...DEFAULT_INDICATORS, ...matchData.customIndicators];

  const selectMatch = (match: Match) => {
    try {
      console.log('selectMatch appelé avec:', match);
      console.log('players disponible:', players);
      console.log('players.length:', players?.length);
      
      if (!players || players.length === 0) {
        console.error('Aucun joueur disponible');
        return;
      }

      console.log('Création des joueurs sélectionnés...');
      
      const selectedPlayers = players.slice(0, 8).map((player, index) => {
        console.log('Traitement du joueur:', player);
        
        // Vérification que le joueur a toutes les propriétés nécessaires
        if (!player || !player.id || !player.name) {
          console.error('Joueur invalide:', player);
          return null;
        }
        
        const selectedPlayer = {
          ...player,
          isStarter: index < 5, // Les 5 premiers sont titulaires
          isOnField: index < 5, // Les 5 premiers commencent sur le terrain
          totalTime: 0,
          currentSequenceTime: 0,
          stats: {
            shotsOnTarget: 0,
            shotsOffTarget: 0,
            goals: 0,
            ballLoss: 0,
            ballRecovery: 0,
            missedPass: 0,
            fouls: 0,
          }
        };
        
        console.log('Joueur sélectionné créé:', selectedPlayer);
        return selectedPlayer;
      }).filter(player => player !== null) as Player[];

      console.log('Tous les joueurs sélectionnés:', selectedPlayers);

      setMatchData(prev => ({
        ...prev,
        selectedMatch: match,
        players: selectedPlayers
      }));
      
      console.log('matchData mis à jour');
      setShowMatchSelector(false);
      console.log('showMatchSelector mis à false');
      
    } catch (error) {
      console.error('Erreur lors de la sélection du match:', error);
    }
  };

  const resetMatchSelection = () => {
    setMatchData(prev => ({
      ...prev,
      selectedMatch: null,
      players: [],
      isRunning: false,
      currentSequence: 1,
      sequences: [],
    }));
    setShowMatchSelector(true);
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

  if (showMatchSelector) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <Calendar className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Sélectionner un match</h1>
            </div>
            
            <p className="text-gray-600 mb-6">
              Choisissez le match que vous souhaitez suivre en temps réel.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {matches && matches.map((match) => (
                <div
                  key={match.id}
                  onClick={() => selectMatch(match)}
                  className="bg-gray-50 rounded-lg p-4 cursor-pointer hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-300"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">{match.title || 'Match sans titre'}</h3>
                    <CheckCircle className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    {match.date ? new Date(match.date).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'Date non définie'}
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    {match.competition || 'Compétition non définie'}
                  </div>
                  {match.score_team !== null && match.score_opponent !== null && (
                    <div className="text-lg font-bold text-blue-600">
                      {match.score_team} - {match.score_opponent}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {matches.length === 0 && (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Aucun match disponible</p>
                <p className="text-sm text-gray-500 mt-2">
                  Créez d&apos;abord un match dans le calendrier pour pouvoir le suivre.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header avec contrôles */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tracker Match</h1>
            {matchData.selectedMatch && (
              <div className="text-gray-600 mt-1">
                {matchData.selectedMatch.title} - {matchData.selectedMatch.competition}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={resetMatchSelection}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Calendar className="h-4 w-4" />
              Changer de match
            </button>
            <button
              onClick={exportData}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="h-5 w-5" />
              Exporter
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleMatch}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg text-white font-semibold transition-colors ${
              matchData.isRunning 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {matchData.isRunning ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            {matchData.isRunning ? 'Stop' : 'Start'}
          </button>

          <button
            onClick={nextSequence}
            disabled={!matchData.isRunning}
            className="flex items-center gap-2 px-4 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="h-5 w-5" />
            Séquence suivante
          </button>

          <div className="flex items-center gap-2 text-lg font-semibold">
            <Clock className="h-5 w-5" />
            Séquence {matchData.currentSequence}
          </div>
        </div>
      </div>

            {/* Grille des joueurs */}
      {!matchData.players || matchData.players.length === 0 ? (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Aucun joueur disponible</p>
          <p className="text-sm text-gray-500 mt-2">
            Assurez-vous d&apos;avoir des joueurs dans votre effectif.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
          {matchData.players && matchData.players.map((player) => (
          <div
            key={player.id}
            className={`bg-white rounded-lg shadow-lg p-4 transition-all duration-200 ${
              player.isOnField ? 'border-2 border-green-500' : 'border-2 border-gray-200'
            } ${draggedPlayer?.id === player.id ? 'opacity-50' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, player)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, player)}
          >
            {/* En-tête du joueur */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-bold text-lg">{player.name}</div>
                <div className="text-sm text-gray-600">#{player.number} - {player.position}</div>
                <div className={`text-xs px-2 py-1 rounded-full ${
                  player.isStarter ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {player.isStarter ? 'Titulaire' : 'Remplaçant'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Temps total</div>
                <div className="font-mono text-lg">{formatTime(player.totalTime)}</div>
                <div className="text-sm text-gray-600">Séquence</div>
                <div className="font-mono text-sm">{formatTime(player.currentSequenceTime)}</div>
              </div>
            </div>

            {/* Actions rapides */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {allIndicators && allIndicators.map((indicator) => {
                const IconComponent = getIconComponent(indicator.icon);
                return (
                  <button
                    key={indicator.id}
                    onClick={() => updatePlayerStat(player.id, indicator.id)}
                    className={`flex items-center justify-center gap-1 p-2 rounded-lg text-white font-medium transition-colors ${indicator.color} hover:opacity-80`}
                  >
                    <IconComponent className="h-4 w-4" />
                    <span className="text-xs">{player.stats && player.stats[indicator.id] || 0}</span>
                  </button>
                );
              })}
            </div>

            {/* Statut sur le terrain */}
            <div className={`text-center py-2 rounded-lg font-medium ${
              player.isOnField 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {player.isOnField ? 'Sur le terrain' : 'Sur le banc'}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Formulaire d'indicateur personnalisé */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Indicateurs personnalisés</h2>
          <button
            onClick={() => setShowCustomIndicatorForm(!showCustomIndicatorForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </button>
        </div>

        {showCustomIndicatorForm && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Nom de l'indicateur"
                value={newIndicator.name}
                onChange={(e) => setNewIndicator(prev => ({ ...prev, name: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="text"
                placeholder="Icône (optionnel)"
                value={newIndicator.icon}
                onChange={(e) => setNewIndicator(prev => ({ ...prev, icon: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={newIndicator.color}
                onChange={(e) => setNewIndicator(prev => ({ ...prev, color: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="bg-blue-500">Bleu</option>
                <option value="bg-green-500">Vert</option>
                <option value="bg-red-500">Rouge</option>
                <option value="bg-yellow-500">Jaune</option>
                <option value="bg-purple-500">Violet</option>
                <option value="bg-pink-500">Rose</option>
              </select>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={addCustomIndicator}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Ajouter
              </button>
              <button
                onClick={() => setShowCustomIndicatorForm(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Liste des indicateurs personnalisés */}
        {matchData.customIndicators.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {matchData.customIndicators.map((indicator) => (
              <div key={indicator.id} className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg">
                <div className={`w-3 h-3 rounded-full ${indicator.color}`}></div>
                <span className="text-sm font-medium">{indicator.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 
