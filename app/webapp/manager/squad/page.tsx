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
}

interface PlayerFormData {
  first_name: string;
  last_name: string;
  age: string;
  position: string;
  strong_foot: string;
  status: string;
  number: string;
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
  number: ''
};

const initialFilters: FilterState = {
  name: '',
  age: '',
  position: '',
  strongFoot: '',
  status: ''
};

export default function SquadPage() {
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

  // Récupération des données initiales
  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchTotalTrainings();
        await fetchPlayers();
      } catch (err) {
        console.error('Erreur lors du chargement des données:', err);
      }
    };

    loadData();
  }, []);

  // Recalculer les stats quand totalTrainings change
  useEffect(() => {
    if (totalTrainings > 0 && players.length > 0) {
      recalculatePlayerStats();
    }
  }, [totalTrainings, players]);

  const handleFilterChange = (field: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  const fetchTotalTrainings = async () => {
    try {
      const { count, error } = await supabase
        .from('trainings')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      setTotalTrainings(count || 0);
    } catch (err) {
      console.error('Erreur lors de la récupération du nombre total d\'entraînements:', err);
      setTotalTrainings(0);
    }
  };

  const recalculatePlayerStats = async () => {
    try {
      // Récupération des matchs
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('players');
      if (matchesError) throw matchesError;

      // Récupération des entraînements
      const { data: trainingsData, error: trainingsError } = await supabase
        .from('trainings')
        .select('players');
      if (trainingsError) throw trainingsError;

      // Recalcul des stats pour chaque joueur
      const playersWithUpdatedStats = players.map(player => {
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

        // Nombre de présences à l'entraînement
        const trainingAttendance = (trainingsData || []).filter(training => {
          if (!training.players) return false;
          try {
            const arr = Array.isArray(training.players) ? training.players : JSON.parse(training.players);
            return arr.some((p: { id: string; present?: boolean }) => p.id === player.id && p.present === true);
          } catch {
            return false;
          }
        }).length;

        const attendance_percentage = totalTrainings > 0 ? Math.round((trainingAttendance / totalTrainings) * 100) : 0;

        return {
          ...player,
          matches_played: matchesPlayed,
          goals,
          training_attendance: trainingAttendance,
          attendance_percentage
        };
      });

      setPlayers(playersWithUpdatedStats);
    } catch (err) {
      console.error('Erreur lors du recalcul des stats:', err);
    }
  };

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Récupération des joueurs
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('last_name');

      if (error) throw error;

      // Récupération des matchs
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('players');
      if (matchesError) throw matchesError;

      // Récupération des entraînements
      const { data: trainingsData, error: trainingsError } = await supabase
        .from('trainings')
        .select('players');
      if (trainingsError) throw trainingsError;

      // Calcul dynamique des stats pour chaque joueur
      const playersWithStats = (data || []).map(player => {
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

        // Nombre de présences à l'entraînement
        const trainingAttendance = (trainingsData || []).filter(training => {
          if (!training.players) return false;
          try {
            const arr = Array.isArray(training.players) ? training.players : JSON.parse(training.players);
            return arr.some((p: { id: string; present?: boolean }) => p.id === player.id && p.present === true);
          } catch {
            return false;
          }
        }).length;

        return {
          ...player,
          matches_played: matchesPlayed,
          goals,
          training_attendance: trainingAttendance,
          attendance_percentage: totalTrainings > 0 ? Math.round((trainingAttendance / totalTrainings) * 100) : 0
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
        number: player.number?.toString() || ''
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
      const playerData = {
        ...formData,
        age: parseInt(formData.age),
        number: formData.number ? parseInt(formData.number) : null
      };

      if (isEditing && currentPlayer) {
        const { error } = await supabase
          .from('players')
          .update(playerData)
          .eq('id', currentPlayer.id);

        if (error) throw error;
        setSuccess('Joueur modifié avec succès');
      } else {
        const { error } = await supabase
          .from('players')
          .insert([playerData]);

        if (error) throw error;
        setSuccess('Joueur ajouté avec succès');
      }

      handleCloseModal();
      fetchPlayers();
    } catch (err) {
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
        <h1 className="text-2xl font-bold text-gray-900">Effectif</h1>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Ajouter un joueur
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
                  <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
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