'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Users, ChevronDown } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  category: string;
  level: string;
  color: string;
}

interface TeamSelectorProps {
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
  className?: string;
}

export default function TeamSelector({ selectedTeamId, onTeamChange, className = '' }: TeamSelectorProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');

      if (error) throw error;
      setTeams(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des équipes:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedTeam = teams.find(team => team.id === selectedTeamId);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg ${className}`}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm text-gray-600">Chargement...</span>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg ${className}`}>
        <Users className="h-4 w-4 text-gray-600" />
        <span className="text-sm text-gray-600">Aucune équipe</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors w-full"
      >
        {selectedTeam && (
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: selectedTeam.color }}
          ></div>
        )}
        <span className="text-sm font-medium text-gray-900 truncate flex-1 text-left">
          {selectedTeam ? selectedTeam.name : 'Sélectionner une équipe'}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-600 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[200px]">
          <div className="py-1">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => {
                  onTeamChange(team.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: team.color }}
                ></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{team.name}</div>
                  <div className="text-xs text-gray-600 truncate">
                    {team.category} - Niveau {team.level}
                  </div>
                </div>
                {selectedTeamId === team.id && (
                  <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overlay pour fermer le dropdown en cliquant à l'extérieur */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
