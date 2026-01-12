import { useState, useEffect } from 'react';
import { matchesService } from '@/lib/services';
import type { Match, MatchStats } from '@/types';

interface UseMatchesOptions {
  teamId?: string;
  autoFetch?: boolean;
}

export function useMatches(options: UseMatchesOptions = {}) {
  const { teamId, autoFetch = true } = options;
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
        matchesService.getMatchesByTeam(teamId),
        matchesService.getMatchStats(teamId)
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
    if (autoFetch && teamId) {
      fetchMatches();
    }
  }, [teamId, autoFetch]);

  return {
    matches,
    matchStats,
    loading,
    error,
    refetch: fetchMatches
  };
}




