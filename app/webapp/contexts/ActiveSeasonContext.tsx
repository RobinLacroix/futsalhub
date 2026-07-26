'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clubsService } from '@/lib/services/clubsService';
import { matchesService } from '@/lib/services/matchesService';
import { trainingsService } from '@/lib/services/trainingsService';
import { currentSeason } from '@/lib/utils/season';
import { useActiveTeamContext } from './ActiveTeamContext';

interface ActiveSeasonContextValue {
  /** Saison sélectionnée pour le filtrage des matchs / entraînements. */
  activeSeason: string;
  /** Saison active du club (celle sur laquelle sont taggées les nouvelles données). */
  clubSeason: string;
  /** Saisons disponibles (présentes en base + saison active), triées desc. */
  availableSeasons: string[];
  loading: boolean;
  changeActiveSeason: (season: string) => void;
  refresh: () => Promise<void>;
}

const ActiveSeasonContext = createContext<ActiveSeasonContextValue | null>(null);

export function ActiveSeasonProvider({ children }: { children: React.ReactNode }) {
  const { teams, loading: teamsLoading } = useActiveTeamContext();
  const [clubSeason, setClubSeason] = useState<string>(currentSeason());
  const [activeSeason, setActiveSeason] = useState<string>(currentSeason());
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([currentSeason()]);
  const [loading, setLoading] = useState(true);
  // Tant que l'utilisateur n'a pas choisi manuellement, on suit la saison active du club.
  const [userPicked, setUserPicked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Saison active du club
      const clubId = await clubsService.getUserClubId();
      let resolvedClubSeason = currentSeason();
      if (clubId) {
        const clubSeasonValue = await clubsService.getCurrentSeason(clubId);
        if (clubSeasonValue) resolvedClubSeason = clubSeasonValue;
      }
      setClubSeason(resolvedClubSeason);

      // 2. Saisons présentes en base (scopées au club via les équipes -> RLS)
      const seasonSet = new Set<string>([resolvedClubSeason]);
      const teamIds = teams.map((t) => t.id);
      if (teamIds.length > 0) {
        const [matchSeasons, trainingSeasons] = await Promise.all([
          matchesService.getSeasonsForTeams(teamIds),
          trainingsService.getSeasonsForTeams(teamIds),
        ]);
        for (const s of matchSeasons) seasonSet.add(s);
        for (const s of trainingSeasons) seasonSet.add(s);
      }
      const sorted = Array.from(seasonSet).sort().reverse();
      setAvailableSeasons(sorted);

      // 3. Par défaut, on suit la saison active du club (sauf choix manuel)
      if (!userPicked) setActiveSeason(resolvedClubSeason);
    } catch (err) {
      console.error('ActiveSeasonContext: erreur chargement saisons', err);
    } finally {
      setLoading(false);
    }
  }, [teams, userPicked]);

  useEffect(() => {
    if (!teamsLoading) refresh();
  }, [teamsLoading, refresh]);

  const changeActiveSeason = useCallback((season: string) => {
    setUserPicked(true);
    setActiveSeason(season);
  }, []);

  const value: ActiveSeasonContextValue = {
    activeSeason,
    clubSeason,
    availableSeasons,
    loading,
    changeActiveSeason,
    refresh,
  };

  return (
    <ActiveSeasonContext.Provider value={value}>
      {children}
    </ActiveSeasonContext.Provider>
  );
}

export function useActiveSeasonContext(): ActiveSeasonContextValue {
  const ctx = useContext(ActiveSeasonContext);
  if (!ctx) {
    throw new Error('useActiveSeasonContext must be used within ActiveSeasonProvider');
  }
  return ctx;
}
