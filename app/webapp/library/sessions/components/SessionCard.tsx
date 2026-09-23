'use client';

import { Trash2, Link2, X, Calendar } from 'lucide-react';
import type { TrainingSessionRecord } from '@/lib/services/sessionsService';
import type { Training } from '@/types';
import { SessionTimeline } from './SessionTimeline';

export interface SessionCardProps {
  session: TrainingSessionRecord;
  attachedTrainings: Training[];
  teamNameById: Map<string, string>;
  onOpen: () => void;
  onDelete: () => void;
  onAttach: () => void;
  onDetach: (trainingId: string) => void;
}

function formatShortDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/** Carte de la grille — remplace la ligne verticale : timeline miniature, statut de rattachement, actions. */
export function SessionCard({ session, attachedTrainings, teamNameById, onOpen, onDelete, onAttach, onDetach }: SessionCardProps) {
  return (
    <div className="fm-card p-3.5 space-y-2.5" style={{ marginBottom: 0 }}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 text-left flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{session.name || 'Sans titre'}</p>
          <p className="text-xs text-gray-500 truncate">
            {session.meta?.principe || session.meta?.theme || 'Aucun principe précisé'}
          </p>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Supprimer la séance"
          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <button onClick={onOpen} className="block w-full text-left">
        <SessionTimeline blocks={session.blocks} />
      </button>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {attachedTrainings.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full pl-2 pr-1 py-0.5"
          >
            <Calendar className="h-3 w-3" />
            {formatShortDate(t.date)} · {teamNameById.get(t.team_id || '') || '—'}
            <button
              onClick={(e) => { e.stopPropagation(); onDetach(t.id); }}
              aria-label="Détacher cet entraînement"
              className="p-0.5 rounded-full hover:bg-blue-100"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); onAttach(); }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 border border-dashed border-gray-300 rounded-full px-2 py-0.5 hover:border-gray-400 hover:text-gray-700"
        >
          <Link2 className="h-3 w-3" /> Rattacher
        </button>
      </div>
    </div>
  );
}
