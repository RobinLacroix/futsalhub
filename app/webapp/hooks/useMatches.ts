import { useState, useEffect } from 'react';
import { matchesService } from '@/lib/services';
import type { Match, MatchStats } from '@/types';

interface UseMatchesOptions {
  teamId?: string;
  season?: string;
  autoFetch?: boolean;
}

export function useMatches(options: UseMatchesOptions = {}) {
  const { teamId, season, autoFetch = true } = options;
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = async () => {
    if (!teamId) {
      setMatches([]);
      setMatchStats([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [matchesData, statsData] = await Promise.all([
        matchesService.getMatchesByTeam(teamId, season),
        matchesService.getMatchStats(teamId, season)
      ]);
      setMatches(matchesData);
      setMatchStats(statsData);
    } catch (err) {
      console.error('Erreur lors du chargement des matchs:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      setMatches([]);
      setMatchStats([]);
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
      setMatches([]);
      setMatchStats([]);
      setLoading(false);
      return;
    }
    if (autoFetch) {
      fetchMatches();
    }
  }, [teamId, season, autoFetch]);

  return {
    matches,
    matchStats,
    loading,
    error,
    refetch: fetchMatches
  };
}




