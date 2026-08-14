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
  /** Équipes que l'utilisateur peut modifier (admin => toutes ; coach => ses équipes). */
  writableTeamIds: string[];
  /** L'équipe active est-elle modifiable par l'utilisateur ? */
  canEditActiveTeam: boolean;
  /** Une équipe donnée est-elle modifiable par l'utilisateur ? */
  canEditTeam: (teamId: string) => boolean;
}

const ActiveTeamContext = createContext<ActiveTeamContextValue | null>(null);

export function ActiveTeamProvider({ children }: { children: React.ReactNode }) {
  const [activeTeamId, setActiveTeamId] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [writableTeamIds, setWritableTeamIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      const [teamsRes, writableRes] = await Promise.all([
        supabase.from('teams').select('*').order('name'),
        supabase.rpc('get_my_writable_team_ids'),
      ]);
      if (teamsRes.error) throw teamsRes.error;
      setTeams(teamsRes.data || []);
      setWritableTeamIds((writableRes.data as string[] | null) || []);
    } catch (err) {
      console.error('ActiveTeamContext: erreur chargement équipes', err);
      setTeams([]);
      setWritableTeamIds([]);
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

  const canEditTeam = useCallback(
    (teamId: string) => writableTeamIds.includes(teamId),
    [writableTeamIds],
  );
  const canEditActiveTeam = !!activeTeamId && writableTeamIds.includes(activeTeamId);

  const value: ActiveTeamContextValue = {
    activeTeamId,
    activeTeam,
    teams,
    loading,
    changeActiveTeam,
    fetchTeams,
    writableTeamIds,
    canEditActiveTeam,
    canEditTeam,
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
