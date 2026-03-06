'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar, Check, X, Clock, FileText, Loader2 } from 'lucide-react';
import {
  getMyConvocations,
  setMyTrainingAttendance,
  type MyConvolutionRow
} from '@/lib/services/playerConvocationsService';

type AttendanceStatus = 'present' | 'absent' | 'late';

export default function PlayerCalendarPage() {
  const [convocations, setConvocations] = useState<MyConvolutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyConvocations();
      setConvocations(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
      setConvocations([]);
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
      setConvocations(prev =>
        prev.map(c =>
          c.training_id === trainingId ? { ...c, my_status: status } : c
        )
      );
    } else {
      setError(result.error ?? 'Erreur');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendrier / Présences</h1>
          <p className="text-gray-600 text-sm">
            Indiquez si vous serez présent aux prochaines séances.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
        </div>
      )}

      {convocations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p>Aucune convocation à venir pour le moment.</p>
          <p className="text-sm mt-1">Vos séances apparaîtront ici lorsque vous serez convoqué.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {convocations.map((c) => {
            const date = c.training_date ? format(new Date(c.training_date), 'EEEE d MMMM yyyy', { locale: fr }) : '';
            const time = c.training_date ? format(new Date(c.training_date), 'HH:mm', { locale: fr }) : '';
            const status = (c.my_status as AttendanceStatus) || null;
            const isUpdating = updatingId === c.training_id;

            return (
              <li
                key={c.training_id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
              >
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 capitalize">{date}</p>
                      {time && <p className="text-sm text-gray-500">{time}</p>}
                      {c.theme && <p className="text-sm text-gray-600 mt-1">Thème : {c.theme}</p>}
                      {c.team_name && (
                        <p className="text-xs text-gray-500 mt-0.5">Équipe : {c.team_name}</p>
                      )}
                      {c.location && <p className="text-xs text-gray-500">Lieu : {c.location}</p>}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 mr-2">Je serai :</span>
                    <button
                      onClick={() => handleSetAttendance(c.training_id, 'present')}
                      disabled={isUpdating}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        status === 'present'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-green-100'
                      }`}
                    >
                      {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Présent
                    </button>
                    <button
                      onClick={() => handleSetAttendance(c.training_id, 'late')}
                      disabled={isUpdating}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        status === 'late'
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-orange-100'
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      En retard
                    </button>
                    <button
                      onClick={() => handleSetAttendance(c.training_id, 'absent')}
                      disabled={isUpdating}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        status === 'absent'
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-amber-100'
                      }`}
                    >
                      <X className="h-4 w-4" />
                      Absent
                    </button>
                  </div>

                  {c.feedback_token && c.feedback_url && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <a
                        href={typeof window !== 'undefined' ? window.location.origin + c.feedback_url : c.feedback_url}
                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
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
