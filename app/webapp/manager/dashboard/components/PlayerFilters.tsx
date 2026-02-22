'use client';

import { RefreshCw } from 'lucide-react';
import type { PlayerFilterState } from '@/types';

interface PlayerFiltersProps {
  filters: PlayerFilterState;
  onFilterChange: (field: keyof PlayerFilterState, value: string | string[]) => void;
  onReset: () => void;
}

export function PlayerFilters({ filters, onFilterChange, onReset }: PlayerFiltersProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex gap-4">
        <select
          value={filters.position}
          onChange={(e) => onFilterChange('position', e.target.value)}
          className="rounded-md border-gray-400 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
        >
          <option value="">Tous les postes</option>
          <option value="Meneur">Meneur</option>
          <option value="Ailier">Ailier</option>
          <option value="Pivot">Pivot</option>
        </select>

        <select
          value={filters.strongFoot}
          onChange={(e) => onFilterChange('strongFoot', e.target.value)}
          className="rounded-md border-gray-400 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
        >
          <option value="">Tous les pieds</option>
          <option value="Droit">Droit</option>
          <option value="Gauche">Gauche</option>
          <option value="Ambidextre">Ambidextre</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => onFilterChange('status', e.target.value)}
          className="rounded-md border-gray-400 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
        >
          <option value="">Tous les statuts</option>
          <option value="Non-muté">Non-muté</option>
          <option value="Muté">Muté</option>
          <option value="Muté HP">Muté HP</option>
        </select>
      </div>

      <button
        onClick={onReset}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-400 rounded-md hover:bg-gray-50 transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Réinitialiser
      </button>
    </div>
  );
}




