import { useState, useEffect } from 'react';
import { playersService } from '@/lib/services';
import type { Player } from '@/types';

interface UsePlayersOptions {
  teamId?: string;
  autoFetch?: boolean;
}

export function usePlayers(options: UsePlayersOptions = {}) {
  const { teamId, autoFetch = true } = options;
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayers = async () => {
    if (!teamId) {
      setPlayers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await playersService.getPlayersByTeam(teamId);
      setPlayers(data);
    } catch (err) {
      console.error('Erreur lors du chargement des joueurs:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Sans équipe, rien à charger : on résout tout de suite, indépendamment
    // d'`autoFetch` (souvent passé en `!!teamId` par l'appelant, donc déjà
    // `false` ici). Sans ce court-circuit, `loading` restait bloqué à `true`
    // pour toujours quand il n'y a pas d'équipe active.
    if (!teamId) {
      setPlayers([]);
      setLoading(false);
      return;
    }
    if (autoFetch) {
      fetchPlayers();
    }
  }, [teamId, autoFetch]);

  return {
    players,
    loading,
    error,
    refetch: fetchPlayers
  };
}




