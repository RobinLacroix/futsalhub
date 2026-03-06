'use client';

import { useActiveTeam } from '../hooks/useActiveTeam';

export default function ActiveTeamIndicator() {
  const { activeTeam } = useActiveTeam();

  if (!activeTeam) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-lg">
      <span className="text-sm font-medium text-gray-700">
        {activeTeam.name}
      </span>
    </div>
  );
}
