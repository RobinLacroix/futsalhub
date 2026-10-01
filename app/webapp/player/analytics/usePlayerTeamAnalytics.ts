/**
 * Données d'analyse pour l'espace joueur — équivalent lecture seule de
 * useMatchAnalytics (manager/analytics), mais scopé sur l'équipe du joueur
 * connecté (get_my_player_team_ids) plutôt que sur l'activeTeamId du coach,
 * qui n'existe pas pour un compte joueur pur (cf. isPlayerOnly, app/webapp/layout.tsx).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useActiveSeasonContext } from '../../contexts/ActiveSeasonContext';
import { matchesService, matchEventsService } from '@/lib/services';
import { getMyPlayerTeamIds } from '@/lib/services/playerConvocationsService';
import type { Match, MatchEvent } from '@/types';

export interface PlayerTeamAnalyticsData {
  teamId: string | null;
  matches: Match[];
  eventsByMatch: Record<string, MatchEvent[]>;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
}

export function usePlayerTeamAnalytics(): PlayerTeamAnalyticsData {
  const { activeSeason } = useActiveSeasonContext();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [eventsByMatch, setEventsByMatch] = useState<Record<string, MatchEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const teamIds = await getMyPlayerTeamIds();
      const tid = teamIds[0] ?? null;
      setTeamId(tid);
      if (!tid) {
        setMatches([]);
        setEventsByMatch({});
        return;
      }

      const matchData = await matchesService.getMatchesByTeam(tid, activeSeason);
      setMatches(matchData);

      const evMap: Record<string, MatchEvent[]> = {};
      await Promise.all(
        matchData.map(async (m) => {
          evMap[m.id] = await matchEventsService.getEventsByMatch(m.id);
        })
      );
      setEventsByMatch(evMap);
    } catch {
      setTeamId(null);
      setMatches([]);
      setEventsByMatch({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeSeason]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return { teamId, matches, eventsByMatch, loading, refreshing, refresh };
}
