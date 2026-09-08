/**
 * MatchMomentsView — répartition des événements par quart de match.
 * Miroir de mobile/components/MatchMomentsView.tsx.
 */
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Card, EmptyState } from './ui';
import { LineChart, SeriesToggle, type LineSeries } from './LineChart';
import { Filter, BarChart3, EyeOff } from 'lucide-react';
import type { Match, MatchEvent } from '@/types';

const DEFAULT_HALF_DURATION_SEC = 20 * 60;
const QUARTERS_PER_HALF = 4;
const QUARTERS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

type SeriesKey = string;

const EVENT_SERIES: { key: SeriesKey; label: string; seriesIndex: number; opponent: boolean }[] = [
  { key: 'goal', label: 'Buts', seriesIndex: 0, opponent: false },
  { key: 'total_shots', label: 'Tirs', seriesIndex: 2, opponent: false },
  { key: 'shot_on_target', label: 'Tirs cadrés', seriesIndex: 1, opponent: false },
  { key: 'shot', label: 'Tirs non cadrés', seriesIndex: 5, opponent: false },
  { key: 'opponent_goal', label: 'Buts adverses', seriesIndex: 3, opponent: true },
  { key: 'opponent_total_shots', label: 'Tirs adverses', seriesIndex: 4, opponent: true },
  { key: 'opponent_shot_on_target', label: 'Tirs cadrés adv.', seriesIndex: 4, opponent: true },
  { key: 'opponent_shot', label: 'Tirs non cadrés adv.', seriesIndex: 5, opponent: true },
];

function halfDurations(events: MatchEvent[]): { h1: number; h2: number } {
  const max = (half: number) => {
    const list = events.filter((e) => e.half === half);
    return list.length > 0 ? Math.max(...list.map((e) => e.match_time_seconds)) : 0;
  };
  const m1 = max(1);
  const m2 = max(2);
  return { h1: m1 > 0 ? m1 : DEFAULT_HALF_DURATION_SEC, h2: m2 > 0 ? m2 : DEFAULT_HALF_DURATION_SEC };
}

function quarterOf(ev: MatchEvent, d: { h1: number; h2: number }): number {
  const duration = ev.half === 1 ? d.h1 : d.h2;
  const q = Math.max(0, Math.min(Math.floor((ev.match_time_seconds / duration) * QUARTERS_PER_HALF), QUARTERS_PER_HALF - 1));
  return ev.half === 1 ? q : QUARTERS_PER_HALF + q;
}

const quarterLabel = (q: number) => `MT${Math.floor(q / QUARTERS_PER_HALF) + 1} Q${(q % QUARTERS_PER_HALF) + 1}`;

export type MatchMomentsViewProps = {
  matches: Match[];
  eventsByMatch: Record<string, MatchEvent[]>;
  filteredMatchIds: Set<string>;
};

export function MatchMomentsView({ eventsByMatch, filteredMatchIds }: MatchMomentsViewProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [visible, setVisible] = useState<Set<SeriesKey>>(
    () => new Set(EVENT_SERIES.filter((e) => !e.opponent).map((e) => e.key))
  );

  const toggle = useCallback((key: SeriesKey) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const { byQuarter, totalEvents } = useMemo(() => {
    const acc: Record<number, Record<string, number>> = {};
    QUARTERS.forEach((q) => { acc[q] = {}; });

    let total = 0;
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      const d = halfDurations(events);
      events.forEach((ev) => {
        const q = quarterOf(ev, d);
        if (q >= 0 && q < 8) {
          acc[q][ev.event_type] = (acc[q][ev.event_type] ?? 0) + 1;
          total++;
        }
      });
    });

    QUARTERS.forEach((q) => {
      acc[q].total_shots = (acc[q].shot ?? 0) + (acc[q].shot_on_target ?? 0);
      acc[q].opponent_total_shots = (acc[q].opponent_shot ?? 0) + (acc[q].opponent_shot_on_target ?? 0);
    });

    return { byQuarter: acc, totalEvents: total };
  }, [eventsByMatch, filteredMatchIds]);

  const series: LineSeries[] = useMemo(
    () =>
      EVENT_SERIES.filter((e) => visible.has(e.key)).map((e) => ({
        key: e.key,
        label: e.label,
        color: c.chartSeries[e.seriesIndex] ?? c.accent.default,
        data: QUARTERS.map((q) => byQuarter[q][e.key] ?? 0),
      })),
    [byQuarter, visible, c]
  );

  const a11y = useMemo(
    () => series.map((s) => `${s.label} : ${s.data.map((v, i) => `${quarterLabel(i)} ${v}`).join(', ')}`).join('. '),
    [series]
  );

  if (filteredMatchIds.size === 0) {
    return <EmptyState icon={Filter} title="Aucun match sélectionné" description="Aucun match ne correspond aux filtres en cours." compact />;
  }

  if (totalEvents === 0) {
    return <EmptyState icon={BarChart3} title="Aucun événement" description="Les matchs sélectionnés n'ont pas d'événement enregistré." compact />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.lg, paddingBottom: 24 }}>
      <Text variant="callout" tone="secondary">
        Répartition des événements par quart de match : quatre quarts par mi-temps, huit au total.
      </Text>

      <Card variant="flat" padding="sm">
        {series.length > 0 ? (
          <LineChart labels={QUARTERS.map(quarterLabel)} series={series} height={180} fromZero smooth={false} accessibilityLabel={`Événements par quart. ${a11y}`} />
        ) : (
          <EmptyState icon={EyeOff} title="Aucune courbe affichée" description="Activez au moins un type d'événement ci-dessous." compact />
        )}
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Text variant="callout" tone="secondary" weight={600}>Afficher ou masquer</Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {EVENT_SERIES.map((e) => {
            const hasData = QUARTERS.some((q) => (byQuarter[q][e.key] ?? 0) > 0);
            return (
              <SeriesToggle
                key={e.key}
                label={e.label}
                color={c.chartSeries[e.seriesIndex] ?? c.accent.default}
                active={visible.has(e.key)}
                disabled={!hasData}
                onPress={() => toggle(e.key)}
              />
            );
          })}
        </div>
      </div>

      <Card variant="flat" padding="sm" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="callout" tone="secondary" style={{ flex: 1 } as React.CSSProperties}>Total sur la sélection</Text>
        <Text variant="headline" numeric>{totalEvents}</Text>
      </Card>
    </div>
  );
}
