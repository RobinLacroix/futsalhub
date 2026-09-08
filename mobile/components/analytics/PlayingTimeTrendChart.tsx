/**
 * Analyse > Joueurs — Évolution du temps de jeu d'un joueur, match par match.
 * Miroir de app/webapp/manager/analytics/PlayingTimeTrendChart.tsx.
 */

import { View } from 'react-native';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Text, EmptyState } from '../ui';
import { LineChart } from '../charts/LineChart';
import { computePlayingTimeByMatch } from './aggregate';
import type { Match, MatchEvent } from '../../types';

export function PlayingTimeTrendChart({
  matches, eventsByMatch, filteredMatchIds, playerId,
}: {
  matches: Match[];
  eventsByMatch: Record<string, MatchEvent[]>;
  filteredMatchIds: Set<string>;
  playerId: string;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const points = computePlayingTimeByMatch(playerId, matches, eventsByMatch, filteredMatchIds);

  if (points.length === 0) {
    return (
      <EmptyState
        icon="time-outline"
        title="Aucune donnée"
        description="Aucun match suivi au tracker avec ce joueur sur le terrain."
        compact
      />
    );
  }

  return (
    <View>
      <Text variant="caption" tone="tertiary" style={s.note}>
        Minutes jouées par match
      </Text>
      <View style={s.chartWrap}>
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
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  note: { paddingHorizontal: t.space.lg, marginBottom: t.space.sm },
  chartWrap: { paddingHorizontal: t.space.lg },
}));
