/**
 * Sélecteur de type de but, ouvert après chaque "But" / "But adverse".
 *
 * Miroir du choix fait par mobile/app/(tabs)/tracker/record.tsx : le type
 * (phase offensive / transition / CPA / supériorité) est optionnel mais
 * alimente le graphique "Évolution des buts par type" côté Analyse. Sans lui,
 * tout but saisi depuis le web reste avec `goal_type = null`.
 */
'use client';

import { GOAL_TYPES } from '../recorderModel';
import type { GoalType } from '@/types';

interface GoalTypeModalProps {
  /** Titre contextuel : "But" ou "But adverse". */
  title: string;
  onSelect: (type: GoalType) => void;
  onSkip: () => void;
}

export default function GoalTypeModal({ title, onSelect, onSkip }: GoalTypeModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onSkip}>
      <div
        className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-bold text-gray-900 dark:text-white">{title}</h3>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Quel type de but ? (optionnel)
        </p>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => onSelect(t.value)}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 py-3 text-gray-800 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-gray-600 active:scale-95 transition-colors"
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-semibold">{t.label}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={onSkip}
          className="mt-4 w-full rounded-lg py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Passer, sans préciser le type
        </button>
      </div>
    </div>
  );
}
