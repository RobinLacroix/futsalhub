'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { Plus, Edit, Trash2, Users, Trophy, Calendar, X } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
  created_at: string;
}

interface TeamFormData {
  name: string;
  category: string;
  level: string;
  color: string;
}

interface TeamStats {
  player_count: number;
  match_count: number;
  training_count: number;
  total_goals: number;
  total_attendance: number;
}

export default function TeamsPage() {
  const { activeTeam } = useActiveTeam();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamStats, setTeamStats] = useState<Record<string, TeamStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [formData, setFormData] = useState<TeamFormData>({
    name: '',
    category: '',
    level: '',
    color: '#3B82F6'
  });

  useEffect(() => {
    if (activeTeam) {
      console.log('🏆 Teams - Chargement des données pour l\'équipe:', activeTeam.name);
      fetchTeams();
    }
  }, [activeTeam]);

  useEffect(() => {
    if (teams.length > 0) {
      fetchTeamStats();
    }
  }, [teams]);

  const fetchTeams = async () => {
    try {
      if (!activeTeam) {
        console.log('🏆 Teams - Aucune équipe active, chargement des équipes impossible');
        setTeams([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      console.log('🏆 Teams - Chargement des équipes pour l\'équipe active:', activeTeam.name);
      
      // Pour la page teams, on affiche toutes les équipes mais on met en évidence l'équipe active
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');

      if (error) throw error;
      console.log('🏆 Teams - Équipes récupérées:', data?.length || 0);
      setTeams(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des équipes');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamStats = async () => {
    try {
      const stats: Record<string, TeamStats> = {};
      
      for (const team of teams) {
        const { data, error } = await supabase
          .rpc('get_team_stats', { team_uuid: team.id });
        
        if (error) {
          console.error(`Erreur lors de la récupération des stats pour ${team.name}:`, error);
          stats[team.id] = {
            player_count: 0,
            match_count: 0,
            training_count: 0,
            total_goals: 0,
            total_attendance: 0
          };
        } else {
          stats[team.id] = data[0] || {
            player_count: 0,
            match_count: 0,
            training_count: 0,
            total_goals: 0,
            total_attendance: 0
          };
        }
      }
      
      setTeamStats(stats);
    } catch (err) {
      console.error('Erreur lors de la récupération des statistiques des équipes:', err);
    }
  };

  const handleOpenModal = (team?: Team) => {
    if (team) {
      setIsEditing(true);
      setCurrentTeam(team);
      setFormData({
        name: team.name,
        category: team.category,
        level: team.level,
        color: team.color
      });
    } else {
      setIsEditing(false);
      setCurrentTeam(null);
      setFormData({
        name: '',
        category: '',
        level: '',
        color: '#3B82F6'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsEditing(false);
    setCurrentTeam(null);
    setFormData({
      name: '',
      category: '',
      level: '',
      color: '#3B82F6'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setError(null);
      
      if (isEditing && currentTeam) {
        // Mise à jour d'une équipe existante
        const { error } = await supabase
          .from('teams')
          .update(formData)
          .eq('id', currentTeam.id);

        if (error) throw error;
        setSuccess('Équipe modifiée avec succès');
      } else {
        // Création d'une nouvelle équipe
        const { error } = await supabase
          .from('teams')
          .insert([formData]);

        if (error) throw error;
        setSuccess('Équipe créée avec succès');
      }

      handleCloseModal();
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    }
  };

  const handleDelete = async (teamId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette équipe ? Cette action est irréversible.')) {
      return;
    }

    try {
      setError(null);
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId);

      if (error) throw error;
      setSuccess('Équipe supprimée avec succès');
      fetchTeams();
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

  if (!activeTeam) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Aucune équipe sélectionnée</h1>
          <p className="text-gray-600 mb-6">
            Veuillez sélectionner une équipe dans la sidebar pour gérer les équipes.
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
          <div className="text-red-500 text-6xl">⚠️</div>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 text-green-600 rounded-md flex items-center gap-2">
          <div className="text-green-500 text-6xl">✅</div>
          <span>{success}</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des équipes</h1>
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
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Ajouter une équipe
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team) => {
          const stats = teamStats[team.id] || {
            player_count: 0,
            match_count: 0,
            training_count: 0,
            total_goals: 0,
            total_attendance: 0
          };

          return (
            <div key={team.id} className={`bg-white rounded-lg shadow-lg border overflow-hidden ${
              team.id === activeTeam.id 
                ? 'border-blue-400 ring-2 ring-blue-200' 
                : 'border-gray-200'
            }`}>
              {/* En-tête de l'équipe */}
              <div 
                className="h-3"
                style={{ backgroundColor: team.color }}
              ></div>
              {team.id === activeTeam.id && (
                <div className="bg-blue-50 px-3 py-1 text-center">
                  <span className="text-xs font-medium text-blue-700">ÉQUIPE ACTIVE</span>
                </div>
              )}
              
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{team.name}</h3>
                    <p className="text-sm text-gray-600">
                      {team.category} - Niveau {team.level}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenModal(team)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(team.id)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Statistiques de l'équipe */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span>{stats.player_count} joueurs</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Trophy className="h-4 w-4" />
                    <span>{stats.match_count} matchs</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>{stats.training_count} entraînements</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                    <span>{stats.total_goals} buts</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal d'ajout/modification d'équipe */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">
                {isEditing ? 'Modifier l\'équipe' : 'Ajouter une équipe'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de l'équipe
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Catégorie
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                >
                  <option value="">Sélectionner une catégorie</option>
                  <option value="Senior">Senior</option>
                  <option value="U19">U19</option>
                  <option value="U17">U17</option>
                  <option value="U15">U15</option>
                  <option value="U13">U13</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Niveau
                </label>
                <select
                  value={formData.level}
                  onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                >
                  <option value="">Sélectionner un niveau</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Couleur
                </label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full h-10 rounded-md border-gray-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  {isEditing ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
