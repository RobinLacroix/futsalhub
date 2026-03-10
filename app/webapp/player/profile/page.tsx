'use client';

import { useState, useEffect } from 'react';
import { UserCircle, Loader2 } from 'lucide-react';
import { usePlayerProfile } from '../../hooks/usePlayerProfile';
import { getMyPlayerTeamIds } from '@/lib/services/playerConvocationsService';
import { playersService } from '@/lib/services/playersService';

export default function PlayerProfilePage() {
  const { player } = usePlayerProfile();
  const [stats, setStats] = useState<{
    matches_played: number;
    goals: number;
    training_attendance: number;
    attendance_percentage: number;
    victories: number;
    draws: number;
    defeats: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!player?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const teamIds = await getMyPlayerTeamIds();
        const tid = teamIds[0];
        if (!cancelled && tid) {
          const s = await playersService.getPlayerStats(player.id, tid);
          if (!cancelled) setStats(s);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [player?.id]);

  if (!player) {
    return (
      <div className="p-4 md:p-6 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[40vh]">
        <UserCircle className="h-16 w-16 text-gray-300 mb-4" />
        <p className="text-gray-500 text-center">Profil joueur non disponible. Liez votre compte dans Paramètres.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <UserCircle className="h-8 w-8 text-[#16a34a]" />
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Ma fiche</h1>
          <p className="text-gray-600 text-sm">Votre profil joueur et statistiques</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border-l-4 border-[#16a34a] shadow-sm p-4 md:p-6 mb-4">
        <div className="flex items-center gap-4">
          {player.number != null && (
            <div className="w-12 h-12 rounded-full bg-[#16a34a] flex items-center justify-center text-white font-bold text-lg shrink-0">
              {player.number}
            </div>
          )}
          <div>
            <p className="text-lg md:text-xl font-bold text-gray-900">
              {player.first_name} {player.last_name}
            </p>
            <p className="text-sm text-gray-600">{player.position} · Pied {player.strong_foot}</p>
            {player.age != null && <p className="text-sm text-gray-600">{player.age} ans</p>}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-[#16a34a]" />
        </div>
      ) : stats ? (
        <div className="bg-white rounded-xl border-l-4 border-[#16a34a] shadow-sm p-4 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Statistiques</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.matches_played}</p>
              <p className="text-xs text-gray-500 mt-1">Matchs</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.goals}</p>
              <p className="text-xs text-gray-500 mt-1">Buts</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-gray-900">{stats.attendance_percentage}%</p>
              <p className="text-xs text-gray-500 mt-1">Assiduité</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-[#16a34a]">{stats.victories}</p>
              <p className="text-xs text-gray-500 mt-1">Victoires</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-amber-600">{stats.draws}</p>
              <p className="text-xs text-gray-500 mt-1">Nuls</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-red-600">{stats.defeats}</p>
              <p className="text-xs text-gray-500 mt-1">Défaites</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
