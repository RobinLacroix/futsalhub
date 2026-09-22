'use client';

import type { SessionMeta, LearningPhase } from '@/lib/services/sessionsService';

const PHASE_OPTIONS: { value: LearningPhase | ''; label: string }[] = [
  { value: '', label: 'Non précisé' },
  { value: 'Phase 1', label: 'Phase 1 — structure contrainte' },
  { value: 'Phase 2', label: 'Phase 2 — jeu libre' },
  { value: 'Mix', label: 'Mix' },
];

export interface SessionHeaderFormProps {
  name: string;
  meta: SessionMeta;
  dureeTotaleMin: number;
  onNameChange: (name: string) => void;
  onMetaChange: (patch: Partial<SessionMeta>) => void;
}

/**
 * En-tête de séance : Principe servi / Moyen travaillé / Thème / Phase
 * d'apprentissage / Effectif. Durée totale affichée en lecture seule,
 * dérivée de la somme des blocs — jamais saisie ici.
 *
 * Phase d'apprentissage volontairement optionnelle et non mise en avant :
 * concept pas encore maîtrisé par le coach — un champ obligatoire
 * deviendrait une case cochée sans valeur réelle.
 */
export function SessionHeaderForm({ name, meta, dureeTotaleMin, onNameChange, onMetaChange }: SessionHeaderFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-800 mb-1.5">Nom de la séance</label>
        <input
          className="fm-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ex : Semaine 3 — sortie de pression"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">Principe servi</label>
          <input
            className="fm-input"
            value={meta.principe}
            onChange={(e) => onMetaChange({ principe: e.target.value })}
            placeholder="Ex : Supériorité collective offensive"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">
            Moyen travaillé <span className="font-normal text-gray-500">(optionnel)</span>
          </label>
          <input
            className="fm-input"
            value={meta.moyen || ''}
            onChange={(e) => onMetaChange({ moyen: e.target.value })}
            placeholder="Ex : Dualité meneur → ailier (parallèle)"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">
            Thème <span className="font-normal text-gray-500">(optionnel)</span>
          </label>
          <input
            className="fm-input"
            value={meta.theme || ''}
            onChange={(e) => onMetaChange({ theme: e.target.value })}
            placeholder="Titre libre de la séance"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">Effectif</label>
          <input
            className="fm-input"
            value={meta.effectif || ''}
            onChange={(e) => onMetaChange({ effectif: e.target.value })}
            placeholder="Ex : 12 joueurs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1.5">
            Phase d&apos;apprentissage <span className="font-normal text-gray-500">(optionnel)</span>
          </label>
          <select
            className="fm-select"
            value={meta.phase || ''}
            onChange={(e) => onMetaChange({ phase: (e.target.value || undefined) as LearningPhase | undefined })}
          >
            {PHASE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500 pb-2.5">
          Durée totale : <span className="font-semibold text-gray-800">{dureeTotaleMin} min</span> (calculée automatiquement)
        </p>
      </div>
    </div>
  );
}
