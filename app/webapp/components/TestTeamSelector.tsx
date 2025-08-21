'use client';

import { useState } from 'react';

// Données de test
const testTeams = [
  { id: '1', name: 'Équipe A', category: 'Senior', level: 'A', color: '#3B82F6' },
  { id: '2', name: 'Équipe B', category: 'Senior', level: 'B', color: '#10B981' },
  { id: '3', name: 'U19', category: 'U19', level: 'A', color: '#F59E0B' },
];

export default function TestTeamSelector() {
  const [selectedTeamId, setSelectedTeamId] = useState('1');
  const [isOpen, setIsOpen] = useState(false);

  const selectedTeam = testTeams.find(team => team.id === selectedTeamId);
  
  console.log('TestTeamSelector: Rendu avec selectedTeamId:', selectedTeamId);
  console.log('TestTeamSelector: selectedTeam:', selectedTeam);

  return (
    <div className="relative w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors w-full"
      >
        {selectedTeam && (
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: selectedTeam.color }}
          ></div>
        )}
        <span className="text-sm font-medium text-gray-900 truncate flex-1 text-left">
          {selectedTeam ? selectedTeam.name : 'Sélectionner une équipe'}
        </span>
        <div className={`h-4 w-4 text-gray-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[200px]">
          <div className="py-1">
            {testTeams.map((team) => (
              <button
                key={team.id}
                onClick={() => {
                  setSelectedTeamId(team.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: team.color }}
                ></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{team.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {team.category} - Niveau {team.level}
                  </div>
                </div>
                {selectedTeamId === team.id && (
                  <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overlay pour fermer le dropdown en cliquant à l'extérieur */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
