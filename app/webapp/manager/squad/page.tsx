'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Plus,
  X,
  Trash2,
  AlertCircle,
  Check,
  Pencil
} from 'lucide-react';
import { useActiveTeam } from '../../hooks/useActiveTeam';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  age: number;
  position: string;
  strong_foot: string;
  status: string;
  number?: number;
  matches_played?: number;
  goals?: number;
  training_attendance?: number;
  attendance_percentage?: number;
  sequence_time_limit?: number;
}

interface PlayerFormData {
  first_name: string;
  last_name: string;
  age: string;
  position: string;
  strong_foot: string;
  status: string;
  number: string;
  sequence_time_limit: string;
}

interface FilterState {
  name: string;
  age: string;
  position: string;
  strongFoot: string;
  status: string;
}

const initialFormData: PlayerFormData = {
  first_name: '',
  last_name: '',
  age: '',
  position: '',
  strong_foot: '',
  status: '',
  number: '',
  sequence_time_limit: '180'
};

const initialFilters: FilterState = {
  name: '',
  age: '',
  position: '',
  strongFoot: '',
  status: ''
};

export default function SquadPage() {
  const { activeTeam } = useActiveTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [totalTrainings, setTotalTrainings] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [formData, setFormData] = useState<PlayerFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  // Recharger les données quand l'équipe active change OU au chargement initial
  useEffect(() => {
    if (activeTeam) {
      console.log('🏆 Équipe active détectée, chargement des données pour:', activeTeam.name);
      console.log('🏆 ID de l\'équipe:', activeTeam.id);
      
      // Vider d'abord les données existantes
      setPlayers([]);
      setTotalTrainings(0);
      setLoading(true);
      
      // Puis recharger les nouvelles données
      const loadData = async () => {
        try {
          console.log('🏆 Début du chargement des données...');
          await fetchTotalTrainings();
          await fetchPlayers();
          console.log('🏆 Chargement des données terminé');
        } catch (err) {
          console.error('🏆 Erreur lors du chargement des données:', err);
        } finally {
          setLoading(false);
        }
      };
      
      loadData();
    } else {
      console.log('🏆 Aucune équipe active, attente...');
      setPlayers([]);
      setTotalTrainings(0);
      setLoading(false);
    }
  }, [activeTeam]);

  // Recalculer les stats quand totalTrainings ou players changent
  useEffect(() => {
    if (totalTrainings > 0 && players.length > 0 && activeTeam) {
      console.log('🏆 Recalcul des stats pour l\'équipe:', activeTeam.name);
      recalculatePlayerStats();
    }
  }, [totalTrainings, players, activeTeam]);

  const handleFilterChange = (field: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  const fetchTotalTrainings = async () => {
    try {
      // Vérifier qu'une équipe est sélectionnée
      if (!activeTeam) {
        console.log('🏆 Aucune équipe active, chargement des entraînements impossible');
        setTotalTrainings(0);
        return;
      }
      
      console.log('🏆 Chargement des entraînements pour l\'équipe:', activeTeam.name);
      console.log('🏆 Requête Supabase avec team_id:', activeTeam.id);
      
      const { count, error } = await supabase
        .from('trainings')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', activeTeam.id);

      if (error) {
        console.error('🏆 Erreur Supabase:', error);
        throw error;
      }
      
      console.log('🏆 Nombre d\'entraînements trouvés:', count);
      setTotalTrainings(count || 0);
    } catch (err) {
      console.error('🏆 Erreur lors de la récupération du nombre total d\'entraînements:', err);
      setTotalTrainings(0);
    }
  };

  const recalculatePlayerStats = async () => {
    try {
      // Vérifier qu'une équipe est sélectionnée
      if (!activeTeam) {
        console.log('Aucune équipe active, recalcul des stats impossible');
        return;
      }
      
      console.log('Recalcul des stats pour l\'équipe:', activeTeam.name);
      
      // Récupération des matchs filtrés par équipe
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('players')
        .eq('team_id', activeTeam.id);
      if (matchesError) throw matchesError;

      // Récupération des entraînements filtrés par équipe avec le nouveau champ attendance
      const { data: trainingsData, error: trainingsError } = await supabase
        .from('trainings')
        .select('attendance')
        .eq('team_id', activeTeam.id);
      if (trainingsError) throw trainingsError;
      
      console.log('Trainings data récupérée:', trainingsData);

      // Recalcul des stats pour chaque joueur
      const playersWithUpdatedStats = players.map(player => {
        try {
          // Nombre de matchs joués
          const matchesPlayed = (matchesData || []).filter(match => {
            if (!match.players) return false;
            try {
              const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
              return arr.some((p: { id: string }) => p.id === player.id);
            } catch {
              return false;
            }
          }).length;

          // Nombre de buts marqués
          const goals = (matchesData || []).reduce((sum, match) => {
            if (!match.players) return sum;
            try {
              const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
              const playerMatch = arr.find((p: { id: string; goals?: number; yellow_cards?: number; red_cards?: number }) => p.id === player.id);
              return sum + (playerMatch && typeof playerMatch.goals === 'number' ? playerMatch.goals : 0);
            } catch {
              return sum;
            }
          }, 0);

          // Nombre de présences à l'entraînement (nouveau système avec attendance JSONB)
          const trainingAttendance = (trainingsData || []).filter(training => {
            try {
              // Debug: vérifier la structure de chaque training
              if (!training.attendance || typeof training.attendance !== 'object') {
                console.log('Training sans attendance valide:', training);
                return false;
              }
              
              // Vérifier si le joueur est présent dans ce training
              const isPresent = training.attendance[player.id] === 'present';
              console.log('Vérification présence:', { 
                playerId: player.id, 
                attendance: training.attendance[player.id],
                isPresent 
              });
              return isPresent;
            } catch (error) {
              console.error('Erreur lors de la vérification de présence:', error, training);
              return false;
            }
          }).length;

          const attendance_percentage = totalTrainings > 0 ? Math.round((trainingAttendance / totalTrainings) * 100) : 0;

          return {
            ...player,
            matches_played: matchesPlayed,
            goals,
            training_attendance: trainingAttendance,
          attendance_percentage,
          sequence_time_limit: player.sequence_time_limit ?? 180
          };
        } catch (playerError) {
          console.error('Erreur lors du traitement du joueur:', player.id, playerError);
          return player; // Retourner le joueur sans modification en cas d'erreur
        }
      });

      console.log('Stats recalculées avec succès');
      setPlayers(playersWithUpdatedStats);
    } catch (err) {
      console.error('Erreur lors du recalcul des stats:', err);
    }
  };

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Vérifier qu'une équipe est sélectionnée
      if (!activeTeam) {
        console.log('❌ Aucune équipe active, chargement des joueurs impossible');
        setPlayers([]);
        return;
      }
      
      console.log('🏆 Chargement des joueurs pour l\'équipe:', activeTeam.name, 'ID:', activeTeam.id);
      
      // Récupération des joueurs filtrés par équipe
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('last_name');

      if (error) throw error;

      console.log('📊 Joueurs récupérés de Supabase:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('📋 Premier joueur (exemple):', data[0]);
        console.log('🔍 Vérification team_id du premier joueur:', data[0].team_id);
      } else {
        console.log('⚠️ Aucun joueur trouvé pour l\'équipe:', activeTeam.name);
        console.log('⚠️ Vérifiez que l\'équipe a des joueurs dans la base de données');
      }

      // Récupération des matchs
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('players');
      if (matchesError) throw matchesError;

      // Récupération des entraînements avec le nouveau champ attendance
      const { data: trainingsData, error: trainingsError } = await supabase
        .from('trainings')
        .select('attendance');
      if (trainingsError) throw trainingsError;

      // Calcul dynamique des stats pour chaque joueur
      const playersWithStats = (data || []).map(player => {
        const sequenceTimeLimit =
          typeof (player as any).sequence_time_limit === 'number'
            ? (player as any).sequence_time_limit
            : 180;
        // Nombre de matchs joués
        const matchesPlayed = (matchesData || []).filter(match => {
          if (!match.players) return false;
          try {
            const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
            return arr.some((p: { id: string }) => p.id === player.id);
          } catch {
            return false;
          }
        }).length;

        // Nombre de buts marqués
        const goals = (matchesData || []).reduce((sum, match) => {
          if (!match.players) return sum;
          try {
            const arr = Array.isArray(match.players) ? match.players : JSON.parse(match.players);
            const playerMatch = arr.find((p: { id: string; goals?: number; yellow_cards?: number; red_cards?: number }) => p.id === player.id);
            return sum + (playerMatch && typeof playerMatch.goals === 'number' ? playerMatch.goals : 0);
          } catch {
            return sum;
          }
        }, 0);

        // Nombre de présences à l'entraînement (nouveau système avec attendance JSONB)
        const trainingAttendance = (trainingsData || []).filter(training => {
          if (!training.attendance) return false;
          try {
            // Vérifier si le joueur est présent dans ce training
            return training.attendance[player.id] === 'present';
          } catch {
            return false;
          }
        }).length;

        return {
          ...player,
          matches_played: matchesPlayed,
          goals,
          training_attendance: trainingAttendance,
          attendance_percentage: totalTrainings > 0 ? Math.round((trainingAttendance / totalTrainings) * 100) : 0,
          sequence_time_limit: sequenceTimeLimit
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

  // Filtrage des joueurs
  const filteredPlayers = useMemo(() => {
    return players.filter(player => {
      const fullName = `${player.first_name} ${player.last_name}`.toLowerCase();
      const searchName = filters.name.toLowerCase();
      
      if (filters.name && !fullName.includes(searchName)) return false;
      if (filters.age && player.age.toString() !== filters.age) return false;
      if (filters.position && player.position !== filters.position) return false;
      if (filters.strongFoot && player.strong_foot !== filters.strongFoot) return false;
      if (filters.status && player.status !== filters.status) return false;
      return true;
    });
  }, [players, filters]);

  const handleOpenModal = (player?: Player) => {
    // Vérifier qu'une équipe est active
    if (!activeTeam) {
      setError('Aucune équipe active sélectionnée. Veuillez sélectionner une équipe dans la sidebar.');
      return;
    }

    console.log('🏆 Ouverture du modal pour l\'équipe:', activeTeam.name);

    if (player) {
      setIsEditing(true);
      setCurrentPlayer(player);
      setFormData({
        first_name: player.first_name,
        last_name: player.last_name,
        age: player.age.toString(),
        position: player.position,
        strong_foot: player.strong_foot,
        status: player.status,
      number: player.number?.toString() || '',
      sequence_time_limit: (player.sequence_time_limit ?? 180).toString()
      });
    } else {
      setIsEditing(false);
      setCurrentPlayer(null);
      setFormData(initialFormData);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData(initialFormData);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Vérifier qu'une équipe est active
      if (!activeTeam) {
        setError('Aucune équipe active sélectionnée. Veuillez sélectionner une équipe dans la sidebar.');
        return;
      }

      console.log('🏆 Ajout/modification de joueur pour l\'équipe:', activeTeam.name, 'ID:', activeTeam.id);

      const playerData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        age: parseInt(formData.age),
        position: formData.position,
        strong_foot: formData.strong_foot,
        status: formData.status,
        number: formData.number ? parseInt(formData.number) : null,
        sequence_time_limit: formData.sequence_time_limit ? parseInt(formData.sequence_time_limit) : 180,
        team_id: activeTeam.id // Ajouter automatiquement le team_id
      };

      console.log('🏆 Données du joueur à enregistrer:', playerData);

      if (isEditing && currentPlayer) {
        const { error } = await supabase
          .from('players')
          .update(playerData)
          .eq('id', currentPlayer.id);

        if (error) throw error;
        setSuccess(`Joueur modifié avec succès dans l'équipe ${activeTeam.name}`);
      } else {
        const { error } = await supabase
          .from('players')
          .insert([playerData]);

        if (error) throw error;
        setSuccess(`Joueur ajouté avec succès dans l'équipe ${activeTeam.name}`);
      }

      handleCloseModal();
      fetchPlayers();
    } catch (err) {
      console.error('🏆 Erreur lors de l\'ajout/modification du joueur:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (playerId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce joueur ?')) return;

    try {
      setError(null);
      const { error } = await supabase
        .from('players')
        .delete()
        .eq('id', playerId);

      if (error) throw error;

      setSuccess('Joueur supprimé avec succès');
      setPlayers(players.filter(player => player.id !== playerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Indicateur d'équipe active */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="text-lg">🏆</div>
          <div>
            <div className="font-semibold text-blue-800">
              Équipe active : {activeTeam ? activeTeam.name : 'Aucune équipe sélectionnée'}
            </div>
            <div className="text-sm text-blue-600">
              {activeTeam ? `${activeTeam.category} - Niveau ${activeTeam.level}` : 'Sélectionnez une équipe dans la sidebar'}
            </div>
            {activeTeam && (
              <div className="text-xs text-blue-500 mt-1">
                ID: {activeTeam.id} | Couleur: {activeTeam.color}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 text-green-600 rounded-md flex items-center gap-2">
          <Check className="h-5 w-5" />
          <span>{success}</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Effectif</h1>
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
        <button
          onClick={() => handleOpenModal()}
          disabled={!activeTeam}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
            activeTeam 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-gray-400 text-gray-200 cursor-not-allowed'
          }`}
        >
          <Plus className="h-5 w-5" />
          {activeTeam ? `Ajouter un joueur à ${activeTeam.name}` : 'Sélectionnez une équipe'}
        </button>
      </div>

      {/* Filtres */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Filtres</h3>
          <button
            onClick={resetFilters}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Réinitialiser
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              type="text"
              value={filters.name}
              onChange={(e) => handleFilterChange('name', e.target.value)}
              placeholder="Rechercher par nom..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Âge</label>
            <select
              value={filters.age}
              onChange={(e) => handleFilterChange('age', e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Tous les âges</option>
              {Array.from(new Set(players.map(p => p.age))).sort().map(age => (
                <option key={age} value={age.toString()}>{age} ans</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Poste</label>
            <select
              value={filters.position}
              onChange={(e) => handleFilterChange('position', e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Tous les postes</option>
              <option value="Meneur">Meneur</option>
              <option value="Ailier">Ailier</option>
              <option value="Pivot">Pivot</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pied fort</label>
            <select
              value={filters.strongFoot}
              onChange={(e) => handleFilterChange('strongFoot', e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Tous les pieds</option>
              <option value="Droit">Droit</option>
              <option value="Gauche">Gauche</option>
              <option value="Ambidextre">Ambidextre</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Tous les statuts</option>
              <option value="Non-muté">Non-muté</option>
              <option value="Muté">Muté</option>
              <option value="Muté HP">Muté HP</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nom
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Âge
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Poste
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pied fort
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Limite séquence (s)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Matchs
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Buts
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Présences
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  % Présence
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-8 text-center text-gray-500">
                    {players.length === 0 ? (
                      <div>
                        <p className="text-lg font-medium mb-2">Aucun joueur trouvé</p>
                        <p className="text-sm">Vérifiez la connexion à la base de données et les permissions.</p>
                        <p className="text-sm mt-1">Players count: {players.length}</p>
                        <p className="text-sm">Error: {error || 'none'}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-lg font-medium mb-2">Aucun joueur ne correspond aux filtres</p>
                        <p className="text-sm">Essayez de modifier vos critères de recherche.</p>
                        <p className="text-sm mt-1">Total players: {players.length}</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {player.number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {player.first_name} {player.last_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {player.age}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {player.position}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {player.strong_foot}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {player.status}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {player.sequence_time_limit ?? 180}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {player.matches_played || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {player.goals || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {player.training_attendance || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {player.attendance_percentage}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(player)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(player.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="px-6 py-2"></td>
                <td className="px-6 py-2">{filteredPlayers.length} joueur{filteredPlayers.length > 1 ? 's' : ''}</td>
                <td className="px-6 py-2">
                  {filteredPlayers.length > 0
                    ? (filteredPlayers.reduce((sum, p) => sum + (p.age || 0), 0) / filteredPlayers.length).toFixed(1)
                    : '-'}
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td className="px-6 py-2">-</td>
                <td className="px-6 py-2">
                  {filteredPlayers.length > 0
                    ? (filteredPlayers.reduce((sum, p) => sum + (p.matches_played || 0), 0) / filteredPlayers.length).toFixed(1)
                    : '-'}
                </td>
                <td className="px-6 py-2">
                  {filteredPlayers.reduce((sum, p) => sum + (p.goals || 0), 0)}
                </td>
                <td className="px-6 py-2">
                  {filteredPlayers.length > 0
                    ? (filteredPlayers.reduce((sum, p) => sum + (p.training_attendance || 0), 0) / filteredPlayers.length).toFixed(1)
                    : '-'}
                </td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {isEditing ? 'Modifier le joueur' : 'Ajouter un joueur'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Numéro</label>
                <input
                  type="number"
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  min="1"
                  max="99"
                  placeholder="Numéro de maillot"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Prénom</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Nom</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Âge</label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                  min="15"
                  max="50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Poste</label>
                <select
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                >
                  <option value="">Sélectionner un poste</option>
                  <option value="Gardien">Gardien</option>
                  <option value="Meneur">Meneur</option>
                  <option value="Ailier">Ailier</option>
                  <option value="Pivot">Pivot</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Pied fort</label>
                <select
                  value={formData.strong_foot}
                  onChange={(e) => setFormData({ ...formData, strong_foot: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                >
                  <option value="">Sélectionner un pied</option>
                  <option value="Droit">Droit</option>
                  <option value="Gauche">Gauche</option>
                  <option value="Ambidextre">Ambidextre</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Statut</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                >
                  <option value="">Sélectionner un statut</option>
                  <option value="Non-muté">Non-Muté</option>
                  <option value="Muté">Muté</option>
                  <option value="Muté HP">Muté HP</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Limite de temps par séquence (secondes)</label>
                <input
                  type="number"
                  min="30"
                  step="10"
                  value={formData.sequence_time_limit}
                  onChange={(e) => setFormData({ ...formData, sequence_time_limit: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Durée maximale avant alerte dans le match recorder (défaut 180 secondes).</p>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Enregistrement...' : isEditing ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 