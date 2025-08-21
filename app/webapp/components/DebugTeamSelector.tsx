'use client';

import { useActiveTeam } from '../hooks/useActiveTeam';

export default function DebugTeamSelector() {
  const { activeTeam, teams, loading, changeActiveTeam } = useActiveTeam();

  // Debug complet
  console.log('🔍 DebugTeamSelector - Hook complet:', {
    activeTeam,
    teamsCount: teams.length,
    loading,
    teams: teams,
    activeTeamId: activeTeam?.id,
    activeTeamName: activeTeam?.name
  });

  return (
    <div className="w-full p-4 bg-purple-500 border-2 border-purple-700 rounded-lg shadow-lg">
      <div className="text-center text-white">
        <div className="text-lg font-bold mb-2">🔍 DEBUG HOOK</div>
        
        {/* État du hook */}
        <div className="text-sm mb-3 space-y-1">
          <div>Loading: {loading ? '🔄 OUI' : '✅ NON'}</div>
          <div>Teams count: {teams.length}</div>
          <div>Active team: {activeTeam ? '✅ OUI' : '❌ NON'}</div>
        </div>

        {/* Équipe active */}
        {activeTeam && (
          <div className="mb-3 p-2 bg-white text-purple-700 rounded text-xs">
            <div>🏆 Équipe active: {activeTeam.name}</div>
            <div>ID: {activeTeam.id}</div>
            <div>Catégorie: {activeTeam.category}</div>
            <div>Niveau: {activeTeam.level}</div>
            <div>Couleur: {activeTeam.color}</div>
          </div>
        )}

        {/* Liste des équipes */}
        {teams.length > 0 && (
          <div className="mb-3">
            <div className="text-sm font-bold mb-2">📋 Équipes disponibles:</div>
            <div className="space-y-1">
              {teams.map((team, index) => (
                <button
                  key={team.id}
                  onClick={() => changeActiveTeam(team.id)}
                  className={`w-full p-2 text-xs rounded transition-all ${
                    activeTeam?.id === team.id
                      ? 'bg-white text-purple-700 ring-2 ring-white'
                      : 'bg-purple-700 text-white hover:bg-purple-600'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: team.color }}
                    ></div>
                    {team.name} ({team.category} - {team.level})
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message d'erreur */}
        {teams.length === 0 && !loading && (
          <div className="text-red-200 text-xs">
            ❌ Aucune équipe trouvée - Vérifiez la migration SQL
          </div>
        )}

        {/* Bouton de test */}
        <button
          onClick={() => {
            console.log('🔍 DebugTeamSelector - Bouton test cliqué');
            console.log('🔍 État actuel du hook:', { activeTeam, teams, loading });
          }}
          className="mt-2 px-3 py-1 bg-yellow-400 text-black text-xs rounded hover:bg-yellow-300 font-bold"
        >
          🧪 Test Console
        </button>
      </div>
    </div>
  );
}
