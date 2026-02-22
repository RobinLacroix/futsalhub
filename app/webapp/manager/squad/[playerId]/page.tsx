'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Calendar,
  Trophy,
  Activity,
  Footprints
} from 'lucide-react';
import { useActiveTeam } from '../../../hooks/useActiveTeam';
import { playersService } from '@/lib/services/playersService';
import { trainingsService } from '@/lib/services/trainingsService';
import type { Player } from '@/types';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const ATTENDANCE_COLORS = {
  present: '#22c55e',
  absent: '#f59e0b',
  injured: '#ef4444'
};

const MATCH_RESULT_COLORS = {
  victories: '#22c55e',
  draws: '#eab308',
  defeats: '#ef4444'
};

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const playerId = params.playerId as string;

  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<{
    matches_played: number;
    goals: number;
    training_attendance: number;
    attendance_percentage: number;
    victories: number;
    draws: number;
    defeats: number;
  } | null>(null);

  const [attendanceDetail, setAttendanceDetail] = useState<{
    present_count: number;
    absent_count: number;
    injured_count: number;
    total_sessions: number;
    attendance_rate: number;
  } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!playerId || !activeTeam) {
        if (!activeTeam) setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [playerData, playerStats] = await Promise.all([
          playersService.getPlayerById(playerId),
          playersService.getPlayerStats(playerId, activeTeam.id)
        ]);

        if (!playerData) {
          setError('Joueur introuvable');
          setLoading(false);
          return;
        }

        setPlayer(playerData);
        setStats(playerStats);

        const trainingsData = await trainingsService.getTrainingsByTeam(activeTeam.id);
        const allStats = trainingsService.calculateAttendanceStats(trainingsData);
        const playerAttendanceStats = allStats.find(s => s.player_id === playerId);

        if (playerAttendanceStats) {
          setAttendanceDetail({
            present_count: playerAttendanceStats.present_count,
            absent_count: playerAttendanceStats.absent_count,
            injured_count: playerAttendanceStats.injured_count,
            total_sessions: playerAttendanceStats.total_sessions,
            attendance_rate: playerAttendanceStats.attendance_rate
          });
        } else {
          setAttendanceDetail({
            present_count: 0,
            absent_count: 0,
            injured_count: 0,
            total_sessions: 0,
            attendance_rate: 0
          });
        }
      } catch (err) {
        console.error('Erreur chargement profil joueur:', err);
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [playerId, activeTeam]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!activeTeam) {
    return (
      <div className="p-8">
        <Link
          href="/webapp/manager/squad"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l&apos;effectif
        </Link>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <p className="text-amber-800 font-medium">Veuillez sélectionner une équipe pour voir le profil du joueur.</p>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="p-8">
        <Link
          href="/webapp/manager/squad"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l&apos;effectif
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-800 font-medium">{error || 'Joueur introuvable'}</p>
        </div>
      </div>
    );
  }

  const initials = `${player.first_name?.[0] || ''}${player.last_name?.[0] || ''}`.toUpperCase();
  const attendanceChartData = attendanceDetail
    ? [
        { name: 'Présent', value: attendanceDetail.present_count, color: ATTENDANCE_COLORS.present },
        { name: 'Absent', value: attendanceDetail.absent_count, color: ATTENDANCE_COLORS.absent },
        { name: 'Blessé', value: attendanceDetail.injured_count, color: ATTENDANCE_COLORS.injured }
      ].filter(d => d.value > 0)
    : [];

  const matchResultsChartData = stats
    ? [
        { name: 'Victoires', value: stats.victories, fill: MATCH_RESULT_COLORS.victories },
        { name: 'Nuls', value: stats.draws, fill: MATCH_RESULT_COLORS.draws },
        { name: 'Défaites', value: stats.defeats, fill: MATCH_RESULT_COLORS.defeats }
      ].filter(d => d.value > 0)
    : [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link
        href="/webapp/manager/squad"
        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à l&apos;effectif
      </Link>

      {/* Carte du joueur - style Football Manager */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8 border border-gray-200">
        <div className="flex flex-col md:flex-row">
          <div className="md:w-64 bg-gradient-to-br from-slate-800 to-slate-900 p-8 flex flex-col items-center justify-center text-white">
            <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center text-2xl font-bold mb-4 ring-4 ring-slate-600">
              {initials || <User className="h-12 w-12 text-slate-400" />}
            </div>
            <p className="text-xl font-bold">{player.first_name} {player.last_name}</p>
            {player.number != null && (
              <p className="text-3xl font-black text-slate-300 mt-1">#{player.number}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-700">
                {player.position}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  player.status === 'Non-muté'
                    ? 'bg-emerald-600'
                    : player.status === 'Muté'
                      ? 'bg-amber-600'
                      : 'bg-amber-800'
                }`}
              >
                {player.status}
              </span>
            </div>
          </div>

          <div className="flex-1 p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Activity className="h-6 w-6 text-blue-600" />
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide">Âge</p>
                <p className="text-lg font-semibold text-gray-900">{player.age} ans</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Footprints className="h-6 w-6 text-amber-600" />
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide">Pied fort</p>
                <p className="text-lg font-semibold text-gray-900">{player.strong_foot}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Trophy className="h-6 w-6 text-emerald-600" />
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide">Poste préféré</p>
                <p className="text-lg font-semibold text-gray-900">{player.position}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center">
                <span className="text-xs font-bold text-slate-700">S</span>
              </div>
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-wide">Statut</p>
                <p className="text-lg font-semibold text-gray-900">{player.status}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Présence à l'entraînement */}
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Présence à l&apos;entraînement
            </h3>
            {attendanceDetail && (
              <p className="text-sm text-gray-600 mt-1">
                Taux de présence : <strong>{attendanceDetail.attendance_rate}%</strong>
                {attendanceDetail.total_sessions > 0 && (
                  <> ({attendanceDetail.present_count}/{attendanceDetail.total_sessions} séances)</>
                )}
              </p>
            )}
          </div>
          <div className="p-6">
            {attendanceChartData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={attendanceChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {attendanceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-gray-500">
                <p>Aucune donnée de présence disponible</p>
              </div>
            )}
          </div>
        </div>

        {/* Résultats en matchs */}
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-600" />
              Résultats en matchs
            </h3>
            {stats && (
              <p className="text-sm text-gray-600 mt-1">
                {stats.matches_played} match{stats.matches_played > 1 ? 's' : ''} joué
                {stats.matches_played > 1 ? 's' : ''} · {stats.goals} but{stats.goals > 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="p-6">
            {matchResultsChartData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={matchResultsChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {matchResultsChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : stats && stats.matches_played === 0 ? (
              <div className="h-72 flex items-center justify-center text-gray-500">
                <p>Aucun match joué</p>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-gray-500">
                <p>Aucune donnée de match disponible</p>
              </div>
            )}

            {stats && (stats.victories > 0 || stats.draws > 0 || stats.defeats > 0) && (
              <div className="mt-4 flex gap-4 justify-center">
                <div className="text-center">
                  <span className="block text-2xl font-bold text-green-600">{stats.victories}</span>
                  <span className="text-xs text-gray-600">Victoires</span>
                </div>
                <div className="text-center">
                  <span className="block text-2xl font-bold text-amber-500">{stats.draws}</span>
                  <span className="text-xs text-gray-600">Nuls</span>
                </div>
                <div className="text-center">
                  <span className="block text-2xl font-bold text-red-600">{stats.defeats}</span>
                  <span className="text-xs text-gray-600">Défaites</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Résumé stats */}
      {stats && (
        <div className="mt-8 bg-white rounded-xl shadow border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Résumé des statistiques</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.matches_played}</p>
              <p className="text-sm text-gray-600">Matchs joués</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.goals}</p>
              <p className="text-sm text-gray-600">Buts</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.training_attendance}</p>
              <p className="text-sm text-gray-600">Présences entraînement</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.attendance_percentage}%</p>
              <p className="text-sm text-gray-600">Taux présence</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
