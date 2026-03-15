import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTeams } from '../lib/services/teams';
import { supabase } from '../lib/supabase';
import type { Team } from '../types';

const ACTIVE_TEAM_KEY = '@futsalhub_active_team_id';

interface ActiveTeamContextValue {
  activeTeamId: string;
  activeTeam: Team | undefined;
  teams: Team[];
  loading: boolean;
  setActiveTeamId: (teamId: string) => Promise<void>;
  refetchTeams: () => Promise<void>;
}

const ActiveTeamContext = createContext<ActiveTeamContextValue | null>(null);

export function ActiveTeamProvider({ children }: { children: React.ReactNode }) {
  const [activeTeamId, setActiveTeamIdState] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const refetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getTeams();
      setTeams(data);
    } catch (err) {
      console.error('ActiveTeamContext: erreur chargement équipes', err);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const setActiveTeamId = useCallback(async (teamId: string) => {
    setActiveTeamIdState(teamId);
    await AsyncStorage.setItem(ACTIVE_TEAM_KEY, teamId);
  }, []);

  useEffect(() => {
    refetchTeams();
  }, [refetchTeams]);

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

  useEffect(() => {
    if (teams.length === 0) return;
    const currentSelectionValid = teams.some((t) => t.id === activeTeamId);
    if (currentSelectionValid) return; // ne pas écraser une sélection utilisateur valide
    let mounted = true;
    AsyncStorage.getItem(ACTIVE_TEAM_KEY).then((savedId) => {
      if (!mounted) return;
      if (savedId && teams.some((t) => t.id === savedId)) {
        setActiveTeamIdState(savedId);
      } else {
        setActiveTeamIdState(teams[0].id);
        AsyncStorage.setItem(ACTIVE_TEAM_KEY, teams[0].id);
      }
    });
    return () => { mounted = false; };
  }, [teams, activeTeamId]);

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  const value: ActiveTeamContextValue = {
    activeTeamId,
    activeTeam,
    teams,
    loading,
    setActiveTeamId,
    refetchTeams,
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
