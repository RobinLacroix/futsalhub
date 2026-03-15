import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getPlayerByUserId } from '../lib/services/players';
import { getTeams } from '../lib/services/teams';
import type { Player } from '../types';
import type { Team } from '../types';
import type { Session } from '@supabase/supabase-js';

const ROLE_KEY = '@futsalhub_app_role';

export type AppRole = 'coach' | 'player';

interface AppRoleContextValue {
  session: Session | null;
  player: Player | null;
  teams: Team[];
  isPlayer: boolean;
  isCoach: boolean;
  loading: boolean;
  appRole: AppRole | null;
  setAppRole: (role: AppRole) => Promise<void>;
  refetch: () => Promise<void>;
}

const AppRoleContext = createContext<AppRoleContextValue | null>(null);

export function AppRoleProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [appRole, setAppRoleState] = useState<AppRole | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
      if (!s) {
        setPlayer(null);
        setTeams([]);
        setAppRoleState(null);
        setLoading(false);
        return;
      }
      const [playerData, teamsData] = await Promise.all([
        getPlayerByUserId(s.user.id),
        getTeams(),
      ]);
      setPlayer(playerData ?? null);
      setTeams(teamsData ?? []);
      const saved = await AsyncStorage.getItem(ROLE_KEY);
      if (saved === 'coach' || saved === 'player') {
        setAppRoleState(saved);
      } else {
        setAppRoleState(null);
      }
    } catch (e) {
      console.error('AppRoleContext load', e);
      setSession(null);
      setPlayer(null);
      setTeams([]);
      setAppRoleState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) load();
      else {
        setSession(null);
        setPlayer(null);
        setTeams([]);
        setAppRoleState(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [load]);

  const setAppRole = useCallback(async (role: AppRole) => {
    setAppRoleState(role);
    await AsyncStorage.setItem(ROLE_KEY, role);
  }, []);

  const isPlayer = !!player;
  const isCoach = teams.length > 0;

  const value: AppRoleContextValue = {
    session,
    player: player ?? null,
    teams,
    isPlayer,
    isCoach,
    loading,
    appRole,
    setAppRole,
    refetch: load,
  };

  return <AppRoleContext.Provider value={value}>{children}</AppRoleContext.Provider>;
}

export function useAppRole(): AppRoleContextValue {
  const ctx = useContext(AppRoleContext);
  if (!ctx) throw new Error('useAppRole must be used within AppRoleProvider');
  return ctx;
}
