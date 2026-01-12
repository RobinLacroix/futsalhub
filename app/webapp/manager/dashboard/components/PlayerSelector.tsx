'use client';

import type { Player } from '@/types';

interface PlayerSelectorProps {
  players: Player[];
  selectedPlayers: string[];
  onToggle: (playerId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export function PlayerSelector({ 
  players, 
  selectedPlayers, 
  onToggle, 
  onSelectAll, 
  onClear 
}: PlayerSelectorProps) {
  return (
    <div className="mb-6 bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Sélection des joueurs</h3>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
          >
            Tout sélectionner
          </button>
          <button
            onClick={onClear}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
          >
            Tout désélectionner
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2">
        {players.map(player => (
          <button
            key={player.id}
            onClick={() => onToggle(player.id)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              selectedPlayers.includes(player.id)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {player.first_name} {player.last_name}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-sm text-gray-500">
          {selectedPlayers.length === 0 
            ? 'Tous les joueurs sont sélectionnés' 
            : `${selectedPlayers.length} joueur(s) sélectionné(s)`
          }
        </p>
      </div>
    </div>
  );
}




