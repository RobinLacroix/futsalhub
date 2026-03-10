'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { usePlayerProfile } from '../hooks/usePlayerProfile';

export default function SimpleTeamSelector() {
  const { activeTeam, teams, loading, changeActiveTeam } = useActiveTeam();
  const { player } = usePlayerProfile();
  const [playerClubName, setPlayerClubName] = useState<string | null>(null);

  useEffect(() => {
    if (!player?.id) {
      setPlayerClubName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: pt } = await supabase
        .from('player_teams')
        .select('team_id')
        .eq('player_id', player.id)
        .limit(1)
        .maybeSingle();
      if (!pt?.team_id || cancelled) return;
      const { data: team } = await supabase
        .from('teams')
        .select('club_id')
        .eq('id', pt.team_id)
        .maybeSingle();
      if (!team?.club_id || cancelled) return;
      const { data: club } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', team.club_id)
        .maybeSingle();
      if (!cancelled && club?.name) setPlayerClubName(club.name);
    })();
    return () => { cancelled = true; };
  }, [player?.id]);

  // Debug: afficher les informations du hook
  console.log('SimpleTeamSelector - Hook data:', {
    activeTeam,
    teamsCount: teams.length,
    loading,
    teams: teams
  });

  if (loading) {
    return (
      <div className="w-full p-4 bg-blue-500 border-2 border-blue-700 rounded-lg shadow-lg">
        <div className="text-center text-white">
          <div className="text-lg font-bold mb-2">🔄 CHARGEMENT...</div>
          <div className="text-sm">Chargement des équipes...</div>
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="w-full p-4 bg-gray-100 border border-gray-200 rounded-lg">
        <div className="text-left text-gray-600 text-sm">Aucune équipe</div>
        {player && (
          <div className="text-left mt-2 text-xs">
            <div className="text-gray-800 font-medium">
              Joueur : {player.first_name} {player.last_name}
            </div>
            {playerClubName && (
              <div className="text-gray-600 mt-0.5">[{playerClubName}]</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full p-2 bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="text-center">
        {/* Équipe active actuelle */}
        {activeTeam ? (
          <div className="mb-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div 
                className="w-3 h-3 rounded-full border border-gray-300"
                style={{ backgroundColor: activeTeam.color }}
              ></div>
              <span className="text-sm font-medium text-gray-700">{activeTeam.name}</span>
            </div>
            <div className="text-xs text-gray-600">
              {activeTeam.category} - {activeTeam.level}
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-600 mb-2">Aucune équipe</div>
        )}

        {/* Sélecteur compact */}
        <div className="space-y-1">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => changeActiveTeam(team.id)}
              className={`w-full px-2 py-2 min-h-[44px] text-xs rounded transition-all touch-manipulation flex items-center justify-center ${
                activeTeam?.id === team.id
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <div className="flex items-center justify-center gap-1 w-full">
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: team.color }}
                ></div>
                <span className="truncate">{team.name}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
