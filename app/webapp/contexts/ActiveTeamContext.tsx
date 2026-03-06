'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface Team {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
}

interface ActiveTeamContextValue {
  activeTeamId: string;
  activeTeam: Team | undefined;
  teams: Team[];
  loading: boolean;
  changeActiveTeam: (teamId: string) => void;
  fetchTeams: () => Promise<void>;
}

const ActiveTeamContext = createContext<ActiveTeamContextValue | null>(null);

export function ActiveTeamProvider({ children }: { children: React.ReactNode }) {
  const [activeTeamId, setActiveTeamId] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');
      if (error) throw error;
      setTeams(data || []);
    } catch (err) {
      console.error('ActiveTeamContext: erreur chargement équipes', err);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  useEffect(() => {
    const savedTeamId = localStorage.getItem('activeTeamId');
    if (savedTeamId && teams.some((t) => t.id === savedTeamId)) {
      setActiveTeamId(savedTeamId);
    } else if (teams.length > 0) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams]);

  const changeActiveTeam = useCallback((teamId: string) => {
    setActiveTeamId(teamId);
    localStorage.setItem('activeTeamId', teamId);
  }, []);

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  const value: ActiveTeamContextValue = {
    activeTeamId,
    activeTeam,
    teams,
    loading,
    changeActiveTeam,
    fetchTeams
  };

  return (
    <ActiveTeamContext.Provider value={value}>
      {children}
    </ActiveTeamContext.Provider>
  );
}

export function useActiveTeamContext(): ActiveTeamContextValue {
  const ctx = useContext(ActiveTeamContext);
  if (!ctx) {
    throw new Error('useActiveTeamContext must be used within ActiveTeamProvider');
  }
  return ctx;
}
