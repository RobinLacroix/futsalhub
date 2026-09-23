'use client';

import { useMemo, useState } from 'react';
import { Search, X, FileText, SlidersHorizontal } from 'lucide-react';
import type {
  TrainingProcedureRecord,
  TrainingProcedureType,
  TrainingProcedureTheme,
  TrainingProcedureIntensite,
} from '@/lib/services/trainingProceduresService';

export interface ProcedurePickerDialogProps {
  open: boolean;
  procedures: TrainingProcedureRecord[];
  onSelect: (procedureId: string) => void;
  onClose: () => void;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const TYPES: TrainingProcedureType[] = ['Echauffement', 'Exercice', 'Situation', 'Jeu', 'Rondo/Toro'];
const THEMES: TrainingProcedureTheme[] = ['Offensif', 'Defensif', 'Transition', 'CPA', 'Powerplay'];
const INTENSITES: TrainingProcedureIntensite[] = ['Légère', 'Modérée', 'Haute'];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs border transition-colors whitespace-nowrap"
      style={
        active
          ? { backgroundColor: '#EFF6FF', color: 'var(--fh-accent, #2563EB)', borderColor: 'var(--fh-accent, #2563EB)', fontWeight: 600 }
          : { backgroundColor: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }
      }
    >
      {label}
    </button>
  );
}

/**
 * Sélection du procédé lié à un bloc — même pattern de modale que le reste
 * du produit (fm-overlay/fm-modal, cf. OtherTeamPlayersModal.tsx). Filtres
 * avancés repliés par défaut (type / thème / principes / intensité) pour ne
 * pas surcharger le cas courant (recherche texte suffit la plupart du temps).
 */
export function ProcedurePickerDialog({ open, procedures, onSelect, onClose }: ProcedurePickerDialogProps) {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [types, setTypes] = useState<TrainingProcedureType[]>([]);
  const [themes, setThemes] = useState<TrainingProcedureTheme[]>([]);
  const [intensites, setIntensites] = useState<TrainingProcedureIntensite[]>([]);
  const [principes, setPrincipes] = useState<string[]>([]);

  const availablePrincipes = useMemo(() => {
    const set = new Set<string>();
    procedures.forEach((p) => (p.principes || []).forEach((x) => x && set.add(x)));
    return Array.from(set).sort();
  }, [procedures]);

  const activeFilterCount = types.length + themes.length + intensites.length + principes.length;

  if (!open) return null;

  const filtered = procedures.filter((p) => {
    if (types.length && !types.includes(p.type)) return false;
    if (themes.length && !themes.includes(p.theme)) return false;
    if (intensites.length && (!p.intensite || !intensites.includes(p.intensite))) return false;
    if (principes.length && !(p.principes || []).some((x) => principes.includes(x))) return false;
    if (search.trim()) {
      const q = norm(search);
      if (!norm(p.title).includes(q) && !norm(p.theme || '').includes(q)) return false;
    }
    return true;
  });

  const resetFilters = () => { setTypes([]); setThemes([]); setIntensites([]); setPrincipes([]); };

  return (
    <div className="fm-overlay fm-overlay-top" onClick={onClose}>
      <div className="fm-modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
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
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
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
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="relative shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtres
              {activeFilterCount > 0 && (
                <span
                  style={{ backgroundColor: 'var(--fh-accent, #2563EB)' }}
                  className="ml-0.5 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="mb-3 p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Type</p>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((t) => (
                    <FilterChip key={t} label={t} active={types.includes(t)} onClick={() => setTypes(toggle(types, t))} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Thème</p>
                <div className="flex flex-wrap gap-1.5">
                  {THEMES.map((t) => (
                    <FilterChip key={t} label={t} active={themes.includes(t)} onClick={() => setThemes(toggle(themes, t))} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Intensité</p>
                <div className="flex flex-wrap gap-1.5">
                  {INTENSITES.map((t) => (
                    <FilterChip key={t} label={t} active={intensites.includes(t)} onClick={() => setIntensites(toggle(intensites, t))} />
                  ))}
                </div>
              </div>
              {availablePrincipes.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Principes</p>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {availablePrincipes.map((p) => (
                      <FilterChip key={p} label={p} active={principes.includes(p)} onClick={() => setPrincipes(toggle(principes, p))} />
                    ))}
                  </div>
                </div>
              )}
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-700 underline">
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              Aucun procédé ne correspond à cette recherche. Essaie d&apos;élargir les filtres.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
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
                      {p.theme}{p.duration_minutes ? ` · ${p.duration_minutes} min` : ''}{p.intensite ? ` · ${p.intensite}` : ''}
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
