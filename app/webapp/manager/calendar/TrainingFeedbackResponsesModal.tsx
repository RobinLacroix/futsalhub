'use client';

/**
 * Réponses au questionnaire d'une séance — vue staff, web.
 *
 * N'existait nulle part côté web non plus (cf. mobile/components/training/
 * TrainingFeedbackResponsesSheet.tsx, même RPC get_training_feedback_responses).
 * Composant autonome plutôt qu'ajouté au corps de calendar/page.tsx (3700+ lignes,
 * cf. CLAUDE.md « pièges connus ») : sa propre logique de fetch, rien à décomposer
 * dans le monolithe pour l'y brancher.
 */

import { useEffect, useState } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { getTrainingFeedbackResponses, type TrainingFeedbackResponse } from '@/lib/services';

export interface TrainingFeedbackResponsesModalProps {
  trainingId: string;
  onClose: () => void;
}

const SCORES: { key: keyof TrainingFeedbackResponse; label: string }[] = [
  { key: 'auto_evaluation', label: 'Auto-éval' },
  { key: 'rpe', label: 'RPE' },
  { key: 'physical_form', label: 'Forme' },
  { key: 'pleasure', label: 'Plaisir' },
];

export function TrainingFeedbackResponsesModal({ trainingId, onClose }: TrainingFeedbackResponsesModalProps) {
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<TrainingFeedbackResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getTrainingFeedbackResponses(trainingId)
      .then(setResponses)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [trainingId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <h3 className="text-xl font-bold text-gray-900">Réponses au questionnaire</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800 transition-colors p-1 rounded-lg hover:bg-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-3">
          {loading && <p className="text-sm text-gray-500">Chargement…</p>}
          {!loading && error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && responses.length === 0 && (
            <p className="text-sm text-gray-500">Aucune réponse pour l&apos;instant.</p>
          )}
          {!loading &&
            !error &&
            responses.map((r) => (
              <div key={r.player_id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-gray-900">{r.player_name}</span>
                  {r.is_guest && (
                    <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      Invité·e{r.team_name ? ` · ${r.team_name}` : ''}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {SCORES.map(({ key, label }) => (
                    <div key={key} className="text-center">
                      <div className="text-lg font-bold text-gray-900">{(r[key] as number | null) ?? '—'}</div>
                      <div className="text-xs text-gray-500">{label}</div>
                    </div>
                  ))}
                </div>
                {r.comment && (
                  <p className="text-sm text-gray-700 italic flex items-start gap-1.5 mt-2">
                    <MessageCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                    « {r.comment} »
                  </p>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
