'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  User,
  Calendar,
  Trophy,
  Activity,
  Footprints,
  Check,
  X,
  AlertTriangle,
  MessageSquare,
  Stethoscope,
  Ban,
  Plus,
  Trash2,
  Clock,
  Link2,
  Copy
} from 'lucide-react';
import { useActiveTeam } from '../../../hooks/useActiveTeam';
import { playersService } from '@/lib/services/playersService';
import { trainingsService } from '@/lib/services/trainingsService';
import { playerEventsService } from '@/lib/services/playerEventsService';
import { getPlayerTrainingFeedback, type PlayerTrainingFeedbackRow } from '@/lib/services/trainingFeedbackService';
import { createPlayerLinkCode } from '@/lib/services/playerConvocationsService';
import { supabase } from '@/lib/supabaseClient';
import type { Player, PlayerEvent, PlayerEventType } from '@/types';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

const ATTENDANCE_COLORS = {
  present: '#22c55e',
  late: '#ea580c',
  absent: '#f59e0b',
  injured: '#ef4444'
};

const MATCH_RESULT_COLORS = {
  victories: '#22c55e',
  draws: '#eab308',
  defeats: '#ef4444'
};

type TrainingSessionStatus = 'present' | 'late' | 'absent' | 'injured' | 'not_recorded';

export default function PlayerProfilePage() {
  const params = useParams();
  const { activeTeam } = useActiveTeam();
  const playerId = params.playerId as string;

  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recentSessions, setRecentSessions] = useState<{ date: string; status: TrainingSessionStatus; theme?: string }[]>([]);
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventFormType, setEventFormType] = useState<PlayerEventType>('interview');
  const [eventForm, setEventForm] = useState({
    event_date: format(new Date(), 'yyyy-MM-dd'),
    report: '',
    injury_type: '',
    unavailability_days: '',
    matches_suspended: ''
  });
  const [savingEvent, setSavingEvent] = useState(false);

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
    late_count: number;
    absent_count: number;
    injured_count: number;
    total_sessions: number;
    attendance_rate: number;
  } | null>(null);

  const [feedbackHistory, setFeedbackHistory] = useState<PlayerTrainingFeedbackRow[]>([]);
  const [feedbackMetric, setFeedbackMetric] = useState<'auto_evaluation' | 'rpe' | 'physical_form' | 'pleasure'>('auto_evaluation');

  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeLoading, setLinkCodeLoading] = useState(false);
  const [linkCodeError, setLinkCodeError] = useState<string | null>(null);
  const [linkCodeCopied, setLinkCodeCopied] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

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

        const [trainingsData, eventsData] = await Promise.all([
          trainingsService.getTrainingsByTeam(activeTeam.id),
          playerEventsService.getByPlayerId(playerId)
        ]);

        setEvents(eventsData);

        const allStats = trainingsService.calculateAttendanceStats(trainingsData);
        const playerAttendanceStats = allStats.find(s => s.player_id === playerId);

        if (playerAttendanceStats) {
          setAttendanceDetail({
            present_count: playerAttendanceStats.present_count,
            late_count: playerAttendanceStats.late_count,
            absent_count: playerAttendanceStats.absent_count,
            injured_count: playerAttendanceStats.injured_count,
            total_sessions: playerAttendanceStats.total_sessions,
            attendance_rate: playerAttendanceStats.attendance_rate
          });
        } else {
          setAttendanceDetail({
            present_count: 0,
            late_count: 0,
            absent_count: 0,
            injured_count: 0,
            total_sessions: 0,
            attendance_rate: 0
          });
        }

        // Dernières séances d'entraînement (les 15 plus récentes, plus récentes en premier)
        const sorted = [...(trainingsData || [])].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const last15 = sorted.slice(0, 15).map(t => {
          const status = (t.attendance as Record<string, string>)?.[playerId] as TrainingSessionStatus | undefined;
          return {
            date: t.date,
            status: (status || 'not_recorded') as TrainingSessionStatus,
            theme: t.theme
          };
        });
        setRecentSessions(last15);

        try {
          const feedback = await getPlayerTrainingFeedback(playerId);
          setFeedbackHistory(feedback);
        } catch {
          setFeedbackHistory([]);
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

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId) return;
    setSavingEvent(true);
    try {
      const newEvent = await playerEventsService.create({
        player_id: playerId,
        event_type: eventFormType,
        event_date: eventForm.event_date,
        report: eventFormType === 'interview' ? eventForm.report || null : null,
        injury_type: eventFormType === 'injury' ? eventForm.injury_type || null : null,
        unavailability_days: eventFormType === 'injury' && eventForm.unavailability_days ? parseInt(eventForm.unavailability_days, 10) : null,
        matches_suspended: eventFormType === 'suspension' && eventForm.matches_suspended ? parseInt(eventForm.matches_suspended, 10) : null
      });
      setEvents(prev => [newEvent, ...prev]);
      setShowEventForm(false);
      setEventForm({ event_date: format(new Date(), 'yyyy-MM-dd'), report: '', injury_type: '', unavailability_days: '', matches_suspended: '' });
    } catch (err) {
      console.error('Erreur création événement:', err);
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await playerEventsService.delete(id);
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      console.error('Erreur suppression événement:', err);
    }
  };

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
        { name: 'En retard', value: attendanceDetail.late_count, color: ATTENDANCE_COLORS.late },
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
                  <> ({attendanceDetail.present_count + attendanceDetail.late_count}/{attendanceDetail.total_sessions} séances)</>
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

            {recentSessions.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-3">Dynamique récente (15 dernières séances)</p>
                <div className="flex flex-wrap gap-2">
                  {recentSessions.map((s, i) => {
                    const title = `${format(new Date(s.date), 'd MMM yyyy', { locale: fr })}${s.theme ? ` - ${s.theme}` : ''}`;
                    const statusLabel = s.status === 'present' ? 'Présent' : s.status === 'late' ? 'En retard' : s.status === 'absent' ? 'Absent' : s.status === 'injured' ? 'Blessé' : 'Non renseigné';
                    return (
                      <div
                        key={i}
                        title={`${title} : ${statusLabel}`}
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          s.status === 'present'
                            ? 'bg-green-500 text-white'
                            : s.status === 'late'
                              ? 'bg-orange-500 text-white'
                              : s.status === 'absent'
                                ? 'bg-amber-500 text-white'
                                : s.status === 'injured'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-gray-300 text-gray-600'
                        }`}
                      >
                        {s.status === 'present' ? (
                          <Check className="h-4 w-4" />
                        ) : s.status === 'late' ? (
                          <Clock className="h-4 w-4" />
                        ) : s.status === 'absent' ? (
                          <X className="h-4 w-4" />
                        ) : s.status === 'injured' ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <span className="text-xs">?</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-600 flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Présent</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> En retard</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Absent</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Blessé</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Non renseigné</span>
                </div>
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

      {/* Évolution des indicateurs d'entraînement */}
      <div className="mt-8 bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Résultats des questionnaires d&apos;entraînement</h3>
          <select
            value={feedbackMetric}
            onChange={e => setFeedbackMetric(e.target.value as typeof feedbackMetric)}
            className="rounded-lg border-2 border-gray-400 bg-white text-gray-900 text-sm font-medium px-3 py-1.5"
          >
            <option value="auto_evaluation">Auto-évaluation globale</option>
            <option value="pleasure">Plaisir</option>
            <option value="rpe">RPE (intensité perçue)</option>
            <option value="physical_form">Forme physique ressentie</option>
          </select>
        </div>
        <div className="p-6">
          {feedbackHistory.length === 0 ? (
            <p className="text-gray-500 text-center py-12">Aucune donnée de questionnaire pour l&apos;instant. Les réponses apparaîtront ici après que le joueur ait rempli des questionnaires de fin de séance.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={feedbackHistory.map((row, i) => ({
                    session: format(new Date(row.date), 'd MMM yy', { locale: fr }),
                    index: i + 1,
                    value: row[feedbackMetric] ?? 0
                  }))}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                  <YAxis domain={[1, 10]} tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number) => [value, { auto_evaluation: 'Auto-éval.', rpe: 'RPE', physical_form: 'Forme', pleasure: 'Plaisir' }[feedbackMetric]]}
                    labelFormatter={label => `Séance : ${label}`}
                  />
                  <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name="Valeur" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
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

      {/* Compte joueur */}
      <div className="mt-8 bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-600" />
            Compte joueur
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Permet au joueur d&apos;accéder au calendrier (présences) et aux questionnaires depuis son compte.
          </p>
        </div>
        <div className="p-6">
          {linkCodeError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {linkCodeError}
            </div>
          )}
          {player.user_id ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-100 text-green-800 text-sm font-medium">
                <Check className="h-4 w-4" />
                Compte lié
              </span>
              <button
                type="button"
                disabled={unlinkLoading}
                onClick={async () => {
                  setLinkCodeError(null);
                  setUnlinkLoading(true);
                  const { error } = await supabase.from('players').update({ user_id: null }).eq('id', playerId);
                  setUnlinkLoading(false);
                  if (error) {
                    setLinkCodeError(error.message);
                    return;
                  }
                  setPlayer((p: Player | null) => p ? { ...p, user_id: undefined } : null);
                }}
                className="text-sm text-amber-600 hover:text-amber-800 font-medium disabled:opacity-50"
              >
                {unlinkLoading ? 'Déliage...' : 'Délier le compte'}
              </button>
            </div>
          ) : linkCode ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Code à transmettre au joueur (valide 24 h) :</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="px-4 py-2 bg-gray-100 rounded-lg text-lg font-mono tracking-wider">
                  {linkCode}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(linkCode);
                    setLinkCodeCopied(true);
                    setTimeout(() => setLinkCodeCopied(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                >
                  {linkCodeCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  {linkCodeCopied ? 'Copié' : 'Copier'}
                </button>
              </div>
              <p className="text-sm text-gray-600">
                Le joueur doit se connecter puis aller dans <strong>Paramètres</strong> → <strong>Lier mon compte joueur</strong> et saisir ce code.
              </p>
              <button
                type="button"
                onClick={() => { setLinkCode(null); setLinkCodeError(null); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Fermer
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-3">Aucun compte lié. Générez un code que le joueur saisira dans Paramètres.</p>
              <button
                type="button"
                disabled={linkCodeLoading}
                onClick={async () => {
                  setLinkCodeError(null);
                  setLinkCodeLoading(true);
                  const result = await createPlayerLinkCode(playerId);
                  setLinkCodeLoading(false);
                  if (result.ok && result.code) {
                    setLinkCode(result.code);
                  } else {
                    setLinkCodeError(result.error ?? 'Erreur');
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {linkCodeLoading ? 'Génération...' : 'Générer un code de liaison'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Événements marquants */}
      <div className="mt-8 bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Événements marquants</h3>
          <button
            type="button"
            onClick={() => {
              setShowEventForm(!showEventForm);
              setEventFormType('interview');
              setEventForm({ event_date: format(new Date(), 'yyyy-MM-dd'), report: '', injury_type: '', unavailability_days: '', matches_suspended: '' });
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg"
          >
            <Plus className="h-4 w-4" />
            Ajouter un événement
          </button>
        </div>

        {showEventForm && (
          <form onSubmit={handleAddEvent} className="p-4 bg-blue-50/50 border-b border-gray-100">
            <div className="flex flex-wrap gap-2 mb-4">
              {(['interview', 'injury', 'suspension'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEventFormType(t)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                    eventFormType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t === 'interview' && <MessageSquare className="h-4 w-4" />}
                  {t === 'injury' && <Stethoscope className="h-4 w-4" />}
                  {t === 'suspension' && <Ban className="h-4 w-4" />}
                  {t === 'interview' ? 'Entretien individuel' : t === 'injury' ? 'Blessure' : 'Suspension'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={eventForm.event_date}
                  onChange={e => setEventForm(f => ({ ...f, event_date: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg text-gray-900 bg-white"
                />
              </div>
              {eventFormType === 'interview' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-800 mb-1">Compte rendu</label>
                  <textarea
                    value={eventForm.report}
                    onChange={e => setEventForm(f => ({ ...f, report: e.target.value }))}
                    rows={3}
                    placeholder="Résumé de l'entretien..."
                    className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                  />
                </div>
              )}
              {eventFormType === 'injury' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Type de blessure</label>
                    <input
                      type="text"
                      value={eventForm.injury_type}
                      onChange={e => setEventForm(f => ({ ...f, injury_type: e.target.value }))}
                      placeholder="Ex: entorse cheville, claquage..."
                      className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Durée indisponibilité (jours)</label>
                    <input
                      type="number"
                      min="1"
                      value={eventForm.unavailability_days}
                      onChange={e => setEventForm(f => ({ ...f, unavailability_days: e.target.value }))}
                      placeholder="Ex: 14"
                      className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                    />
                  </div>
                </>
              )}
              {eventFormType === 'suspension' && (
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">Nombre de matchs</label>
                  <input
                    type="number"
                    min="1"
                    value={eventForm.matches_suspended}
                    onChange={e => setEventForm(f => ({ ...f, matches_suspended: e.target.value }))}
                    placeholder="Ex: 2"
                    className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={savingEvent}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {savingEvent ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={() => setShowEventForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm font-medium"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        <div className="p-4">
          {events.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Aucun événement enregistré. Ajoutez un entretien, une blessure ou une suspension.</p>
          ) : (
            <ul className="space-y-3">
              {events.map(ev => (
                <li key={ev.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 mt-0.5">
                    {ev.event_type === 'interview' && <MessageSquare className="h-5 w-5 text-blue-600" />}
                    {ev.event_type === 'injury' && <Stethoscope className="h-5 w-5 text-red-600" />}
                    {ev.event_type === 'suspension' && <Ban className="h-5 w-5 text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">
                      {ev.event_type === 'interview' && 'Entretien individuel'}
                      {ev.event_type === 'injury' && `Blessure${ev.injury_type ? ` - ${ev.injury_type}` : ''}`}
                      {ev.event_type === 'suspension' && `Suspension - ${ev.matches_suspended} match${ev.matches_suspended && ev.matches_suspended > 1 ? 's' : ''}`}
                    </p>
                    <p className="text-sm text-gray-600">{format(new Date(ev.event_date), 'd MMMM yyyy', { locale: fr })}</p>
                    {ev.report && <p className="text-sm text-gray-700 mt-1">{ev.report}</p>}
                    {ev.event_type === 'injury' && ev.unavailability_days && (
                      <p className="text-sm text-gray-600">Indisponible {ev.unavailability_days} jour{ev.unavailability_days > 1 ? 's' : ''}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(ev.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
