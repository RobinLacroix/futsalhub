/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState } from 'react';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { useDashboardData } from './hooks/useDashboardData';
import { PlayerFilters } from './components/PlayerFilters';
import { PlayerSelector } from './components/PlayerSelector';
import type { PlayerFilterState, PerformanceFilterState } from '@/types';
import { CHART_COLORS } from '@/lib/utils/chartUtils';
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
import { RefreshCw } from 'lucide-react';

const initialFilters: PlayerFilterState = {
  position: '',
  strongFoot: '',
  status: '',
  selectedPlayers: []
};

const initialPerformanceFilters: PerformanceFilterState = {
  matchLocationFilter: 'Tous',
  selectedMatches: []
};

export default function DashboardPage() {
  const { activeTeam } = useActiveTeam();
  const [filters, setFilters] = useState<PlayerFilterState>(initialFilters);
  const [performanceFilters, setPerformanceFilters] = useState<PerformanceFilterState>(initialPerformanceFilters);

  const {
    players,
    matchStats,
    trainingStats,
    attendanceStats,
    chartData,
    performanceData,
    loading,
    totalTrainings
  } = useDashboardData({
    teamId: activeTeam?.id,
    filters,
    performanceFilters
  });

  const handleFilterChange = (field: keyof PlayerFilterState, value: string | string[]) => {
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

  const togglePlayerSelection = (playerId: string) => {
    setFilters(prev => ({
      ...prev,
      selectedPlayers: prev.selectedPlayers.includes(playerId)
        ? prev.selectedPlayers.filter(id => id !== playerId)
        : [...prev.selectedPlayers, playerId]
    }));
  };

  const toggleMatchSelection = (matchId: string) => {
    setPerformanceFilters(prev => ({
      ...prev,
      selectedMatches: prev.selectedMatches.includes(matchId)
        ? prev.selectedMatches.filter(id => id !== matchId)
        : [...prev.selectedMatches, matchId]
    }));
  };

  const selectAllPlayers = () => {
    const allPlayerIds = players.map(p => p.id);
    setFilters(prev => ({ ...prev, selectedPlayers: allPlayerIds }));
  };

  const selectAllMatches = () => {
    const allMatchIds = matchStats.map(m => m.id);
    setPerformanceFilters(prev => ({ ...prev, selectedMatches: allMatchIds }));
  };

  const clearPlayerSelection = () => {
    setFilters(prev => ({ ...prev, selectedPlayers: [] }));
  };

  const clearMatchSelection = () => {
    setPerformanceFilters(prev => ({ ...prev, selectedMatches: [] }));
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
          <PlayerFilters 
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={resetFilters}
          />
        </div>

        <PlayerSelector
          players={players}
          selectedPlayers={filters.selectedPlayers}
          onToggle={togglePlayerSelection}
          onSelectAll={selectAllPlayers}
          onClear={clearPlayerSelection}
        />

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
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
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
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
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
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, color: '#374151', fontWeight: 'bold' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Statistiques de présence détaillées */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Statistiques de présence détaillées</h3>
            <div className="h-80">
              {attendanceStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceStats}>
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
                  <PolarAngleAxis dataKey="joueur" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar
                    name="Présence (%)"
                    dataKey="Présence (%)"
                    stroke="#8B5CF6"
                    fill="#8B5CF6"
                    fillOpacity={0.6}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, color: '#374151', fontWeight: 'bold' }} />
                  <Legend wrapperStyle={{ fontSize: 12, fontWeight: 'bold' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

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
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 'bold' }} />
                    <Line 
                      type="monotone" 
                      dataKey="present" 
                      stroke="#10B981" 
                      strokeWidth={3}
                      dot={{ fill: '#10B981', strokeWidth: 2, r: 4, stroke: '#fff' }}
                      activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2, fill: '#fff' }}
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
              {performanceData.pieThemeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData.pieThemeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Sélection des matchs</label>
                <div className="flex gap-2">
                  <button onClick={selectAllMatches} className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800">
                    Tout
                  </button>
                  <button onClick={clearMatchSelection} className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800">
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
                    <span className="text-xs text-gray-700 truncate">{match.title}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section de résumé */}
        <div className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-green-600 mb-1">{performanceData.matchSummary.victories}</div>
              <div className="text-sm text-gray-600">Victoires</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-yellow-600 mb-1">{performanceData.matchSummary.draws}</div>
              <div className="text-sm text-gray-600">Nuls</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-red-600 mb-1">{performanceData.matchSummary.defeats}</div>
              <div className="text-sm text-gray-600">Défaites</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">{performanceData.matchSummary.goalsScored}</div>
              <div className="text-sm text-gray-600">Buts marqués</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-3xl font-bold text-orange-600 mb-1">{performanceData.matchSummary.goalsConceded}</div>
              <div className="text-sm text-gray-600">Buts encaissés</div>
            </div>
          </div>
        </div>

        {/* Graphique de comparaison des buts par typologie */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg text-gray-900 font-semibold mb-4">Répartition des buts par typologie</h3>
            <div className="h-80">
              {performanceData.goalsByTypeDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData.goalsByTypeDistribution} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
                    />
                    <Legend />
                    <Bar dataKey="buts_marqués" name="Buts marqués" fill="#4CAF50" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="buts_encaissés" name="Buts encaissés" fill="#F44336" radius={[4, 4, 0, 0]} />
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
              {performanceData.goalsDistribution.scored.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData.goalsDistribution.scored} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
              {performanceData.goalsDistribution.conceded.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData.goalsDistribution.conceded} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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

