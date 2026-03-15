'use client';

import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar, Check, X, Clock, FileText, Loader2, Bandage } from 'lucide-react';
import {
  getMyCalendarEvents,
  setMyTrainingAttendance,
  type MyConvolutionRow,
  type MyUpcomingMatchRow
} from '@/lib/services/playerConvocationsService';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'injured';

type CalendarItem =
  | { type: 'training'; data: MyConvolutionRow }
  | { type: 'match'; data: MyUpcomingMatchRow };

function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => {
    const dateA = a.type === 'training' ? a.data.training_date : a.data.match_date;
    const dateB = b.type === 'training' ? b.data.training_date : b.data.match_date;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });
}

export default function PlayerCalendarPage() {
  const [trainings, setTrainings] = useState<MyConvolutionRow[]>([]);
  const [matches, setMatches] = useState<MyUpcomingMatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calendarItems = useMemo(
    () =>
      sortItems([
        ...trainings.map((c) => ({ type: 'training' as const, data: c })),
        ...matches.map((m) => ({ type: 'match' as const, data: m })),
      ]),
    [trainings, matches]
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { trainings: t, matches: m } = await getMyCalendarEvents();
      setTrainings(t);
      setMatches(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
      setTrainings([]);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSetAttendance = async (trainingId: string, status: AttendanceStatus) => {
    setUpdatingId(trainingId);
    setError(null);
    const result = await setMyTrainingAttendance(trainingId, status);
    setUpdatingId(null);
    if (result.ok) {
      setTrainings((prev) =>
        prev.map((c) => (c.training_id === trainingId ? { ...c, my_status: status } : c))
      );
    } else {
      setError(result.error ?? 'Erreur');
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#16a34a]" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="h-8 w-8 text-[#16a34a]" />
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Calendrier</h1>
          <p className="text-gray-600 text-sm">
            Vos convocations (entraînements et matchs). Indiquez votre présence aux séances.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
          {error}
        </div>
      )}

      {calendarItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 shadow-sm">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Aucune convocation à venir.</p>
          <p className="text-sm mt-1">Vos séances et matchs apparaîtront ici lorsque vous serez convoqué.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {calendarItems.map((item) => {
            if (item.type === 'match') {
              const m = item.data;
              const matchDate = m.match_date ? format(new Date(m.match_date), 'EEEE d MMMM yyyy', { locale: fr }) : '';
              const matchTime = m.match_date ? format(new Date(m.match_date), 'HH:mm', { locale: fr }) : '';
              const otherTeam = !!m.is_other_team;
              return (
                <li
                  key={`m-${m.match_id}`}
                  className={`rounded-xl border overflow-hidden shadow-sm ${
                    otherTeam
                      ? 'bg-amber-50/80 border-amber-400 border-l-4 border-l-amber-500'
                      : 'bg-white border-l-4 border-blue-500 border border-gray-200'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-500 text-white">
                        Match
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900 capitalize">{matchDate}</p>
                    {matchTime && <p className="text-sm text-gray-500">{matchTime}</p>}
                    <p className="text-sm text-gray-700 mt-1">{m.title ?? 'Match'}</p>
                    {m.opponent_team && <p className="text-sm text-gray-600">vs {m.opponent_team}</p>}
                    {m.team_name && <p className="text-xs text-gray-500 mt-0.5">Équipe : {m.team_name}</p>}
                    {m.location && <p className="text-xs text-gray-500">Lieu : {m.location}</p>}
                    {m.competition && <p className="text-xs text-gray-500">Compétition : {m.competition}</p>}
                  </div>
                </li>
              );
            }

            const c = item.data;
            const date = c.training_date ? format(new Date(c.training_date), 'EEEE d MMMM yyyy', { locale: fr }) : '';
            const time = c.training_date ? format(new Date(c.training_date), 'HH:mm', { locale: fr }) : '';
            const status = (c.my_status as AttendanceStatus) || null;
            const isUpdating = updatingId === c.training_id;
            const otherTeam = !!c.is_other_team;

            return (
              <li
                key={`t-${c.training_id}`}
                className={`rounded-xl border overflow-hidden shadow-sm ${
                  otherTeam
                    ? 'bg-violet-50/80 border-violet-400 border-l-4 border-l-violet-500'
                    : 'bg-white border-l-4 border-[#16a34a] border border-gray-200'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${otherTeam ? 'bg-violet-500 text-white' : 'bg-[#16a34a] text-white'}`}>
                      Entraînement{otherTeam ? ' (autre équipe)' : ''}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 capitalize">{date}</p>
                  {time && <p className="text-sm text-gray-500">{time}</p>}
                  {c.team_name && <p className="text-xs text-gray-500 mt-0.5">Équipe : {c.team_name}</p>}
                  {c.location && <p className="text-xs text-gray-500">Lieu : {c.location}</p>}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 w-full md:w-auto">Je serai :</span>
                    <button
                      onClick={() => handleSetAttendance(c.training_id, 'present')}
                      disabled={isUpdating}
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] touch-manipulation transition ${
                        status === 'present' ? 'bg-[#16a34a] text-white' : 'bg-gray-100 text-gray-700 hover:bg-green-100'
                      }`}
                    >
                      {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Présent
                    </button>
                    <button
                      onClick={() => handleSetAttendance(c.training_id, 'late')}
                      disabled={isUpdating}
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] touch-manipulation transition ${
                        status === 'late' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-orange-100'
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      En retard
                    </button>
                    <button
                      onClick={() => handleSetAttendance(c.training_id, 'absent')}
                      disabled={isUpdating}
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] touch-manipulation transition ${
                        status === 'absent' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-amber-100'
                      }`}
                    >
                      <X className="h-4 w-4" />
                      Absent
                    </button>
                    <button
                      onClick={() => handleSetAttendance(c.training_id, 'injured')}
                      disabled={isUpdating}
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] touch-manipulation transition ${
                        status === 'injured' ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-rose-100'
                      }`}
                    >
                      <Bandage className="h-4 w-4" />
                      Blessé
                    </button>
                  </div>

                  {c.feedback_token && c.feedback_url && !otherTeam && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <a
                        href={
                          typeof window !== 'undefined' ? window.location.origin + c.feedback_url : c.feedback_url
                        }
                        className="inline-flex items-center gap-2 text-sm text-[#16a34a] hover:text-[#15803d] font-medium min-h-[44px] items-center touch-manipulation"
                      >
                        <FileText className="h-4 w-4" />
                        Remplir le questionnaire de la séance
                      </a>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
