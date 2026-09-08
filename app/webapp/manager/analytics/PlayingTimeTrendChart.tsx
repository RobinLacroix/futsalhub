/**
 * Évolution du temps de jeu d'un joueur, match par match. Miroir de
 * mobile/components/analytics/PlayingTimeTrendChart.tsx.
 */
'use client';

import { useTheme } from '../../contexts/ThemeContext';
import { Text, EmptyState } from './ui';
import { Clock } from 'lucide-react';
import { LineChart } from './LineChart';
import { computePlayingTimeByMatch } from './aggregate';
import type { Match, MatchEvent } from '@/types';

export function PlayingTimeTrendChart({
  matches, eventsByMatch, filteredMatchIds, playerId,
}: {
  matches: Match[];
  eventsByMatch: Record<string, MatchEvent[]>;
  filteredMatchIds: Set<string>;
  playerId: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  const points = computePlayingTimeByMatch(playerId, matches, eventsByMatch, filteredMatchIds);

  if (points.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Aucune donnée"
        description="Aucun match suivi au tracker avec ce joueur sur le terrain."
        compact
      />
    );
  }

  return (
    <div>
      <Text
        variant="caption"
        tone="tertiary"
        style={{ paddingLeft: theme.space.lg, paddingRight: theme.space.lg, marginBottom: theme.space.sm } as React.CSSProperties}
      >
        Minutes jouées par match
      </Text>
      <div style={{ paddingLeft: theme.space.lg, paddingRight: theme.space.lg }}>
        <LineChart
          labels={points.map((p) => p.label)}
          series={[{
            key: 'playingTime',
            label: 'Temps de jeu',
            color: c.chartSeries[0] ?? c.accent.default,
            data: points.map((p) => Math.round(p.seconds / 60)),
          }]}
          fromZero
          smooth={false}
          accessibilityLabel="Temps de jeu par match, en minutes"
        />
      </div>
    </div>
  );
}
