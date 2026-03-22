import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCoachCalendarData } from '../lib/services/calendar';
import { supabase } from '../lib/supabase';
import type { Team, Training, Match } from '../types';

const ACTIVE_TEAM_KEY = '@futsalhub_active_team_id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ActiveTeamContextValue {
  activeTeamId: string;
  activeTeam: Team | undefined;
  teams: Team[];
  calendarTrainings: Training[];
  calendarMatches: Match[];
  loading: boolean;
  calendarLoading: boolean;
  setActiveTeamId: (teamId: string) => Promise<void>;
  refetchTeams: () => Promise<void>;
  refetchCalendar: () => Promise<void>;
}

const ActiveTeamContext = createContext<ActiveTeamContextValue | null>(null);

export function ActiveTeamProvider({ children }: { children: React.ReactNode }) {
  const [activeTeamId, setActiveTeamIdState] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [calendarTrainings, setCalendarTrainings] = useState<Training[]>([]);
  const [calendarMatches, setCalendarMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);

  const loadCalendarForTeam = useCallback(async (teamId: string | null) => {
    const data = await getCoachCalendarData(teamId);
    return data;
  }, []);

  const setActiveTeamId = useCallback(async (teamId: string) => {
    setActiveTeamIdState(teamId);
    await AsyncStorage.setItem(ACTIVE_TEAM_KEY, teamId);
  }, []);

  // Un seul appel RPC pour équipes + calendrier (1 round-trip au lieu de 3).
  // activeTeamId défini dès AsyncStorage lu (optimiste) pour débloquer l'UI.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const savedId = await AsyncStorage.getItem(ACTIVE_TEAM_KEY);
      const teamId = savedId && UUID_RE.test(savedId) ? savedId : null;
      if (teamId) setActiveTeamIdState(teamId); // optimiste, avant le RPC
      try {
        setLoading(true);
        setCalendarLoading(true);
        const data = await loadCalendarForTeam(teamId);
        if (!mounted) return;
        setTeams(data.teams);
        setCalendarTrainings(data.trainings);
        setCalendarMatches(data.matches);
        const valid = data.teams.some((t) => t.id === teamId);
        if (teamId && valid) {
          setActiveTeamIdState(teamId);
        } else if (data.teams.length > 0) {
          const firstId = data.teams[0].id;
          setActiveTeamIdState(firstId);
          AsyncStorage.setItem(ACTIVE_TEAM_KEY, firstId);
        }
      } catch (err) {
        console.error('ActiveTeamContext: erreur chargement', err);
        if (mounted) {
          setTeams([]);
          setCalendarTrainings([]);
          setCalendarMatches([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setCalendarLoading(false);
        }
      }
    };
    load();
    return () => { mounted = false; };
  }, [loadCalendarForTeam]);

  const refetchCalendar = useCallback(async () => {
    if (!activeTeamId) return;
    try {
      setCalendarLoading(true);
      const data = await loadCalendarForTeam(activeTeamId);
      setTeams(data.teams);
      setCalendarTrainings(data.trainings);
      setCalendarMatches(data.matches);
      const valid = data.teams.some((t) => t.id === activeTeamId);
      if (!valid && data.teams.length > 0) {
        setActiveTeamIdState(data.teams[0].id);
        await AsyncStorage.setItem(ACTIVE_TEAM_KEY, data.teams[0].id);
      }
    } catch (err) {
      console.error('ActiveTeamContext refetchCalendar', err);
    } finally {
      setCalendarLoading(false);
    }
  }, [activeTeamId, loadCalendarForTeam]);

  const refetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      const data = await loadCalendarForTeam(activeTeamId || null);
      setTeams(data.teams);
      setCalendarTrainings(data.trainings);
      setCalendarMatches(data.matches);
      const valid = data.teams.some((t) => t.id === activeTeamId);
      if (!valid && data.teams.length > 0) {
        setActiveTeamIdState(data.teams[0].id);
        await AsyncStorage.setItem(ACTIVE_TEAM_KEY, data.teams[0].id);
      }
    } catch (err) {
      console.error('ActiveTeamContext: erreur chargement', err);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, [activeTeamId, loadCalendarForTeam]);

  // Recharger les équipes après connexion (au premier chargement on peut ne pas avoir de session)
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        try {
          if (session) refetchTeams();
        } catch (err) {
          console.error('ActiveTeamContext onAuthStateChange', err);
        }
      });
      subscription = data.subscription;
    } catch (err) {
      console.error('ActiveTeamContext onAuthStateChange setup', err);
    }
    return () => subscription?.unsubscribe();
  }, [refetchTeams]);

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  const value: ActiveTeamContextValue = {
    activeTeamId,
    activeTeam,
    teams,
    calendarTrainings,
    calendarMatches,
    loading,
    calendarLoading,
    setActiveTeamId,
    refetchTeams,
    refetchCalendar,
  };

  return (
    <ActiveTeamContext.Provider value={value}>
      {children}
    </ActiveTeamContext.Provider>
  );
}

export function useActiveTeam(): ActiveTeamContextValue {
  const ctx = useContext(ActiveTeamContext);
  if (!ctx) throw new Error('useActiveTeam must be used within ActiveTeamProvider');
  return ctx;
}
