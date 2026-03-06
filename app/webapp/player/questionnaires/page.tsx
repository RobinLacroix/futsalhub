'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { MessageSquare, FileText, ExternalLink } from 'lucide-react';
import { getMyPendingFeedbackTokens, type MyPendingFeedbackRow } from '@/lib/services/playerConvocationsService';

export default function PlayerQuestionnairesPage() {
  const [pending, setPending] = useState<MyPendingFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMyPendingFeedbackTokens();
        if (!cancelled) setPending(data);
      } catch {
        if (!cancelled) setPending([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Questionnaires</h1>
          <p className="text-gray-600 text-sm">
            Répondez aux questionnaires de fin de séance pour aider l&apos;équipe à suivre votre ressenti.
          </p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p>Aucun questionnaire en attente.</p>
          <p className="text-sm mt-1">
            Les liens de questionnaire apparaissent après une séance (ou depuis le calendrier).
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {pending.map((row) => {
            const date = row.training_date
              ? format(new Date(row.training_date), "d MMMM yyyy", { locale: fr })
              : '';
            return (
              <li
                key={row.training_id + row.token}
                className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="font-semibold text-gray-900">{date}</p>
                  {row.theme && <p className="text-sm text-gray-600">{row.theme}</p>}
                </div>
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Remplir le questionnaire
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
