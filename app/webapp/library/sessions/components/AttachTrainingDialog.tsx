'use client';

import { useState } from 'react';
import { Search, X, Calendar } from 'lucide-react';
import type { Training } from '@/types';

export interface AttachTrainingDialogProps {
  open: boolean;
  trainings: Training[];
  teamNameById: Map<string, string>;
  onSelect: (trainingId: string) => void;
  onClose: () => void;
}

function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Rattache la séance à un entraînement existant (trainings.session_id) —
 * toutes équipes du club confondues. N'affiche que les entraînements pas
 * encore rattachés à une autre séance : une séance peut servir à plusieurs
 * entraînements (template réutilisé), mais un entraînement n'a qu'une seule
 * séance à la fois.
 */
export function AttachTrainingDialog({ open, trainings, teamNameById, onSelect, onClose }: AttachTrainingDialogProps) {
  const [search, setSearch] = useState('');

  if (!open) return null;

  const available = trainings.filter((t) => !t.session_id);
  const filtered = search.trim()
    ? available.filter((t) => {
        const q = search.toLowerCase();
        return (
          (t.theme || '').toLowerCase().includes(q) ||
          (teamNameById.get(t.team_id || '') || '').toLowerCase().includes(q) ||
          formatDate(t.date).toLowerCase().includes(q)
        );
      })
    : available;

  return (
    <div className="fm-overlay fm-overlay-top" onClick={onClose}>
      <div className="fm-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="fm-modal-header">
          <div className="fm-modal-title">
            <span className="fm-modal-title-bar" />
            Rattacher à un entraînement
          </div>
          <button className="fm-modal-close" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="fm-modal-body">
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="search"
              className="fm-input pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une date, un thème, une équipe…"
              autoFocus
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {available.length === 0
                ? 'Tous les entraînements ont déjà une séance rattachée.'
                : 'Aucun entraînement ne correspond à cette recherche.'}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onSelect(t.id); onClose(); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-left transition-colors"
                >
                  <span className="w-8 h-8 rounded bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate capitalize">{formatDate(t.date)}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {teamNameById.get(t.team_id || '') || 'Équipe inconnue'}{t.theme ? ` · ${t.theme}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
