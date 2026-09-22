'use client';

import { useState } from 'react';
import { Search, X, FileText } from 'lucide-react';
import type { TrainingProcedureRecord } from '@/lib/services/trainingProceduresService';

export interface ProcedurePickerDialogProps {
  open: boolean;
  procedures: TrainingProcedureRecord[];
  onSelect: (procedureId: string) => void;
  onClose: () => void;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Sélection du procédé lié à un bloc — même pattern de modale que le reste
 * du produit (fm-overlay/fm-modal, cf. OtherTeamPlayersModal.tsx). Pas de
 * Radix Dialog : la dépendance est installée mais non utilisée nulle part
 * dans le repo, autant suivre le pattern réel plutôt qu'en introduire un
 * second pour ce seul écran.
 */
export function ProcedurePickerDialog({ open, procedures, onSelect, onClose }: ProcedurePickerDialogProps) {
  const [search, setSearch] = useState('');

  if (!open) return null;

  const filtered = search.trim()
    ? procedures.filter((p) => norm(p.title).includes(norm(search)) || norm(p.theme || '').includes(norm(search)))
    : procedures;

  return (
    <div className="fm-overlay fm-overlay-top" onClick={onClose}>
      <div className="fm-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="fm-modal-header">
          <div className="fm-modal-title">
            <span className="fm-modal-title-bar" />
            Choisir un procédé
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
              placeholder="Rechercher un procédé…"
              autoFocus
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Aucun procédé ne correspond à cette recherche.</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); onClose(); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-left transition-colors"
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="w-10 h-7 object-cover rounded border border-gray-200 shrink-0" />
                  ) : (
                    <span className="w-10 h-7 rounded border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
                      <FileText className="h-3.5 w-3.5 text-gray-400" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{p.title || 'Sans titre'}</span>
                    <span className="block text-xs text-gray-500">
                      {p.theme}{p.duration_minutes ? ` · ${p.duration_minutes} min` : ''}
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
