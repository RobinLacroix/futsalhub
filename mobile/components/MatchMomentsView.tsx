/**
 * MatchMomentsView — répartition des événements par quart de match (P0-7, P1-2)
 *
 * Passe de `react-native-chart-kit` au `LineChart` maison sur `react-native-svg`.
 *
 * Deux corrections de lecture, au-delà du changement de bibliothèque :
 *
 * 1. **La courbe était lissée en Bézier (`bezier`) alors qu'elle affiche des
 *    COMPTAGES par quart.** Le lissage inventait des valeurs intermédiaires —
 *    la courbe passait par 1,4 tir entre deux quarts — et pouvait descendre
 *    sous zéro entre deux points. Sur une donnée discrète, l'interpolation
 *    ment : les segments sont maintenant droits.
 * 2. **Huit séries étaient activées par défaut**, toutes superposées sur un
 *    graphique de 220 pt de haut. Le défaut passe aux quatre séries de l'équipe ;
 *    celles de l'adversaire s'ajoutent à la demande.
 *
 * Le code de calcul des quarts est repris à l'identique.
 */

import { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { haptics } from '../lib/design/haptics';
import { Text, Card, EmptyState } from './ui';
import { LineChart, SeriesToggle, type LineSeries } from './charts/LineChart';
import type { Match, MatchEvent, MatchEventType } from '../types';

const DEFAULT_HALF_DURATION_SEC = 20 * 60;
const QUARTERS_PER_HALF = 4;
const QUARTERS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

type SeriesKey = MatchEventType | 'total_shots' | 'opponent_total_shots';

/**
 * `seriesIndex` pointe dans `chartSeries` du thème. `opponent` détermine ce qui
 * est affiché par défaut : montrer huit courbes d'emblée rendait le graphique
 * illisible.
 */
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
  return {
    h1: m1 > 0 ? m1 : DEFAULT_HALF_DURATION_SEC,
    h2: m2 > 0 ? m2 : DEFAULT_HALF_DURATION_SEC,
  };
}

function quarterOf(ev: MatchEvent, d: { h1: number; h2: number }): number {
  const duration = ev.half === 1 ? d.h1 : d.h2;
  const q = Math.max(
    0,
    Math.min(Math.floor((ev.match_time_seconds / duration) * QUARTERS_PER_HALF), QUARTERS_PER_HALF - 1)
  );
  return ev.half === 1 ? q : QUARTERS_PER_HALF + q;
}

const quarterLabel = (q: number) =>
  `MT${Math.floor(q / QUARTERS_PER_HALF) + 1} Q${(q % QUARTERS_PER_HALF) + 1}`;

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
    haptics.select();
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const { byQuarter, totalEvents } = useMemo(() => {
    const acc: Record<number, Record<string, number>> = {};
    QUARTERS.forEach((q) => {
      acc[q] = {};
    });

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

    // Les tirs totaux sont dérivés, pas un type d'événement brut.
    QUARTERS.forEach((q) => {
      acc[q].total_shots = (acc[q].shot ?? 0) + (acc[q].shot_on_target ?? 0);
      acc[q].opponent_total_shots =
        (acc[q].opponent_shot ?? 0) + (acc[q].opponent_shot_on_target ?? 0);
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
    () =>
      series
        .map((s) => `${s.label} : ${s.data.map((v, i) => `${quarterLabel(i)} ${v}`).join(', ')}`)
        .join('. '),
    [series]
  );

  if (filteredMatchIds.size === 0) {
    return (
      <EmptyState
        icon="filter-outline"
        title="Aucun match sélectionné"
        description="Aucun match ne correspond aux filtres en cours."
        compact
      />
    );
  }

  if (totalEvents === 0) {
    return (
      <EmptyState
        icon="stats-chart-outline"
        title="Aucun événement"
        description="Les matchs sélectionnés n'ont pas d'événement enregistré."
        compact
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { gap: theme.space.lg }]}>
      <Text variant="callout" tone="secondary">
        Répartition des événements par quart de match : quatre quarts par mi-temps, huit au total.
      </Text>

      <Card variant="flat" padding="sm">
        {series.length > 0 ? (
          <LineChart
            labels={QUARTERS.map(quarterLabel)}
            series={series}
            height={180}
            fromZero
            // Comptages par quart : le lissage inventerait des valeurs
            // intermédiaires qui n'existent pas.
            smooth={false}
            accessibilityLabel={`Événements par quart. ${a11y}`}
          />
        ) : (
          <EmptyState
            icon="eye-off-outline"
            title="Aucune courbe affichée"
            description="Activez au moins un type d'événement ci-dessous."
            compact
          />
        )}
      </Card>

      <View style={styles.legendBlock}>
        <Text variant="callout" tone="secondary" weight="600">
          Afficher ou masquer
        </Text>
        <View style={styles.chips}>
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
        </View>
      </View>

      <Card variant="flat" padding="sm" style={styles.totalRow}>
        <Text variant="callout" tone="secondary" style={styles.flex}>
          Total sur la sélection
        </Text>
        <Text variant="headline" numeric>
          {totalEvents}
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 24 },
  legendBlock: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
