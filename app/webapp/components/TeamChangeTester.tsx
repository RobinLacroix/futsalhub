'use client';

import { useActiveTeam } from '../hooks/useActiveTeam';
import { useState, useEffect } from 'react';

export default function TeamChangeTester() {
  const { activeTeam, teams, loading, changeActiveTeam } = useActiveTeam();
  const [changeCount, setChangeCount] = useState(0);
  const [lastChange, setLastChange] = useState<string>('');

  // Tester le changement d'équipe
  const testTeamChange = (teamId: string) => {
    console.log('🧪 TestTeamChangeTester - Changement d\'équipe vers:', teamId);
    setChangeCount(prev => prev + 1);
    setLastChange(new Date().toISOString());
    changeActiveTeam(teamId);
  };

  // Log des changements
  useEffect(() => {
    if (activeTeam) {
      console.log('🧪 TestTeamChangeTester - Équipe active changée vers:', activeTeam.name);
    }
  }, [activeTeam]);

  if (loading) {
    return (
      <div className="w-full p-4 bg-yellow-500 border-2 border-yellow-700 rounded-lg">
        <div className="text-center text-white">
          <div className="text-lg font-bold mb-2">🔄 CHARGEMENT...</div>
          <div className="text-sm">Chargement des équipes...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4 bg-orange-500 border-2 border-orange-700 rounded-lg">
      <div className="text-center text-white">
        <div className="text-lg font-bold mb-2">🧪 TESTEUR DE CHANGEMENT</div>
        
        {/* État actuel */}
        <div className="mb-3 p-2 bg-white text-orange-700 rounded text-xs">
          <div>🏆 Équipe active: {activeTeam ? activeTeam.name : 'Aucune'}</div>
          <div>ID: {activeTeam?.id || 'N/A'}</div>
          <div>Compteur de changements: {changeCount}</div>
          <div>Dernier changement: {lastChange ? new Date(lastChange).toLocaleTimeString() : 'Aucun'}</div>
        </div>

        {/* Boutons de test */}
        <div className="space-y-2">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => testTeamChange(team.id)}
              className={`w-full p-2 text-xs rounded font-bold transition-all ${
                activeTeam?.id === team.id
                  ? 'bg-white text-orange-700 ring-2 ring-white'
                  : 'bg-orange-700 text-white hover:bg-orange-600'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: team.color }}
                ></div>
                {team.name} - CLICK POUR TESTER
              </div>
            </button>
          ))}
        </div>

        {/* Bouton de reset */}
        <button
          onClick={() => {
            setChangeCount(0);
            setLastChange('');
            console.log('🧪 TestTeamChangeTester - Reset des compteurs');
          }}
          className="mt-3 px-3 py-1 bg-red-400 text-white text-xs rounded hover:bg-red-300 font-bold"
        >
          🔄 Reset Compteurs
        </button>
      </div>
    </div>
  );
}
