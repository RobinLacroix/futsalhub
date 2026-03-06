'use client';

import { useActiveTeamContext } from '../contexts/ActiveTeamContext';

export function useActiveTeam() {
  return useActiveTeamContext();
}
