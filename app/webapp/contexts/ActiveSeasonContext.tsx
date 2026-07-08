'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
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
      const { data: clubId } = await supabase.rpc('get_user_club_id');
      let resolvedClubSeason = currentSeason();
      if (clubId) {
        const { data: clubRow } = await supabase
          .from('clubs')
          .select('current_season')
          .eq('id', clubId)
          .single();
        if (clubRow?.current_season) resolvedClubSeason = clubRow.current_season as string;
      }
      setClubSeason(resolvedClubSeason);

      // 2. Saisons présentes en base (scopées au club via les équipes -> RLS)
      const seasonSet = new Set<string>([resolvedClubSeason]);
      const teamIds = teams.map((t) => t.id);
      if (teamIds.length > 0) {
        const [matchSeasons, trainingSeasons] = await Promise.all([
          supabase.from('matches').select('season').in('team_id', teamIds),
          supabase.from('trainings').select('season').in('team_id', teamIds),
        ]);
        for (const row of matchSeasons.data ?? []) {
          if (row.season) seasonSet.add(row.season as string);
        }
        for (const row of trainingSeasons.data ?? []) {
          if (row.season) seasonSet.add(row.season as string);
        }
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
