/**
 * Données de l'onglet Matchs — miroir de
 * mobile/components/analytics/MatchAnalyticsContext.tsx, sans la couche
 * Context/Provider : sur web, AnalyticsView est l'unique consommateur (pas de
 * TrackerAnalyticsView à alimenter en parallèle), donc un hook suffit.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { useActiveSeasonContext } from '../../contexts/ActiveSeasonContext';
import { useUserClub } from '../../hooks/useUserClub';
import { matchesService, matchEventsService, matchRatingsService, playersService } from '@/lib/services';
import type { Match, MatchEvent, Player, MatchPlayerRatingRow } from '@/types';

export interface MatchAnalyticsData {
  matches: Match[];
  eventsByMatch: Record<string, MatchEvent[]>;
  /** Effectif du club entier : un match peut faire jouer un joueur d'une autre équipe. */
  clubPlayers: Player[];
  clubPlayerIds: Set<string>;
  ratingRows: MatchPlayerRatingRow[];
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
}

export function useMatchAnalytics(): MatchAnalyticsData {
  const { activeTeamId } = useActiveTeam();
  const { activeSeason } = useActiveSeasonContext();
  const { club } = useUserClub();
  const clubId = club?.id;

  const [matches, setMatches] = useState<Match[]>([]);
  const [eventsByMatch, setEventsByMatch] = useState<Record<string, MatchEvent[]>>({});
  const [clubPlayers, setClubPlayers] = useState<Player[]>([]);
  const [clubPlayerIds, setClubPlayerIds] = useState<Set<string>>(new Set());
  const [ratingRows, setRatingRows] = useState<MatchPlayerRatingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const reset = useCallback(() => {
    setMatches([]);
    setEventsByMatch({});
    setClubPlayers([]);
    setClubPlayerIds(new Set());
    setRatingRows([]);
  }, []);

  const load = useCallback(async () => {
    if (!activeTeamId || !clubId) {
      reset();
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [matchData, clubData] = await Promise.all([
        matchesService.getMatchesByTeam(activeTeamId, activeSeason),
        playersService.getPlayersByClubWithTeams(clubId),
      ]);
      setMatches(matchData);
      setClubPlayers(clubData.map(({ player }) => player));
      setClubPlayerIds(new Set(clubData.map(({ player }) => player.id)));

      const evMap: Record<string, MatchEvent[]> = {};
      await Promise.all(
        matchData.map(async (m) => {
          evMap[m.id] = await matchEventsService.getEventsByMatch(m.id);
        })
      );
      setEventsByMatch(evMap);

      // Les notes sont calculées en RPC. Leur échec ne doit pas vider l'écran :
      // tout le reste de l'analyse reste exploitable sans elles.
      try {
        setRatingRows(await matchRatingsService.getRatingsForMatches(matchData.map((m) => m.id)));
      } catch {
        setRatingRows([]);
      }
    } catch {
      reset();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTeamId, clubId, activeSeason, reset]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return { matches, eventsByMatch, clubPlayers, clubPlayerIds, ratingRows, loading, refreshing, refresh };
}
