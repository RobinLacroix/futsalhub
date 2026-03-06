'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  getFeedbackSessionByToken,
  submitTrainingFeedback
} from '@/lib/services/trainingFeedbackService';

type FeedbackKeys = 'auto_evaluation' | 'rpe' | 'physical_form' | 'pleasure';
const LABELS: Record<FeedbackKeys, string> = {
  auto_evaluation: 'Auto-évaluation globale',
  rpe: 'Intensité d\'effort perçu (RPE)',
  physical_form: 'Forme physique ressentie',
  pleasure: 'Plaisir'
};

const INITIAL = 5;
const MIN = 1;
const MAX = 10;

export default function FeedbackSessionPage() {
  const params = useParams();
  const token = params.token as string;
  const [session, setSession] = useState<Awaited<ReturnType<typeof getFeedbackSessionByToken>>>(undefined);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({
    auto_evaluation: INITIAL,
    rpe: INITIAL,
    physical_form: INITIAL,
    pleasure: INITIAL
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getFeedbackSessionByToken(token);
      if (!cancelled) {
        setSession(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitTrainingFeedback(token, values);
    setSubmitting(false);
    if (result.success) setSubmitted(true);
    else setSubmitError(result.error || 'Erreur lors de l\'envoi');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 safe-area-padding">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-white border-t-transparent" />
      </div>
    );
  }

  if (session == null || 'error' in session) {
    const message =
      session && 'error' in session
        ? session.error === 'expired'
          ? 'Ce lien a expiré.'
          : session.error === 'already_used'
            ? 'Vous avez déjà répondu à ce questionnaire.'
            : 'Lien invalide.'
        : 'Lien invalide.';
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg">{message}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="rounded-full bg-green-500/20 p-4 mb-4">
          <svg className="w-12 h-12 text-green-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold mb-2">Merci !</h1>
        <p className="text-slate-300">Vos réponses ont bien été enregistrées.</p>
      </div>
    );
  }

  const trainingDate = session.training_date
    ? format(new Date(session.training_date), 'EEEE d MMMM yyyy', { locale: fr })
    : '';

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-8 safe-area-padding">
      <div className="max-w-md mx-auto px-4 pt-6">
        <h1 className="text-xl font-bold mb-1">Questionnaire de fin de séance</h1>
        <p className="text-slate-400 text-sm mb-6">
          {session.player_name && <span>{session.player_name} · </span>}
          {trainingDate}
          {session.theme && ` · ${session.theme}`}
        </p>

        <p className="text-slate-300 text-sm mb-6">
          Indiquez votre ressenti pour cette séance (1 = très faible, 10 = très élevé). Curseur par défaut : 5.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {(Object.keys(LABELS) as FeedbackKeys[]).map(key => (
            <div key={key}>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor={key} className="text-sm font-medium text-slate-200">
                  {LABELS[key]}
                </label>
                <span className="text-lg font-bold tabular-nums">{values[key]}/10</span>
              </div>
              <input
                id={key}
                type="range"
                min={MIN}
                max={MAX}
                value={values[key]}
                onChange={e => setValues(v => ({ ...v, [key]: Number(e.target.value) }))}
                className="w-full h-3 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-blue-500"
              />
            </div>
          ))}

          {submitError && (
            <p className="text-red-400 text-sm">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-xl bg-blue-600 text-white font-semibold text-lg active:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Envoi en cours...' : 'Envoyer mes réponses'}
          </button>
        </form>
      </div>
    </div>
  );
}
