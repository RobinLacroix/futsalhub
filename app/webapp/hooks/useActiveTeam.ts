'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Team {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
}

export function useActiveTeam() {
  const [activeTeamId, setActiveTeamId] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    // Récupérer l'équipe active depuis le localStorage
    const savedTeamId = localStorage.getItem('activeTeamId');
    if (savedTeamId && teams.some(team => team.id === savedTeamId)) {
      setActiveTeamId(savedTeamId);
    } else if (teams.length > 0) {
      // Par défaut, sélectionner la première équipe
      setActiveTeamId(teams[0].id);
    }
  }, [teams]);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      console.log('useActiveTeam: Chargement des équipes...');
      
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');

      if (error) {
        console.error('useActiveTeam: Erreur Supabase:', error);
        throw error;
      }
      
      console.log('useActiveTeam: Équipes chargées:', data);
      console.log('useActiveTeam: Nombre d\'équipes:', data?.length || 0);
      
      if (data && data.length > 0) {
        console.log('useActiveTeam: Première équipe:', data[0]);
      }
      
      setTeams(data || []);
    } catch (err) {
      console.error('useActiveTeam: Erreur lors du chargement des équipes:', err);
      console.error('useActiveTeam: Détails de l\'erreur:', {
        message: err instanceof Error ? err.message : 'Erreur inconnue',
        error: err
      });
    } finally {
      setLoading(false);
    }
  };

  const changeActiveTeam = (teamId: string) => {
    console.log('useActiveTeam: Changement d\'équipe vers:', teamId);
    setActiveTeamId(teamId);
    localStorage.setItem('activeTeamId', teamId);
  };

  const activeTeam = teams.find(team => team.id === activeTeamId);

  return {
    activeTeamId,
    activeTeam,
    teams,
    loading,
    changeActiveTeam,
    fetchTeams
  };
}
