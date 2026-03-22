/**
 * Affiche la répartition des événements par quart de mi-temps (8 quarts au total).
 * Graphique à courbes avec possibilité d'afficher/masquer chaque type d'événement.
 */
import { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import LineChart from 'react-native-chart-kit/dist/line-chart';
import type { Match, MatchEvent } from '../types';
import type { MatchEventType } from '../types';

const DEFAULT_HALF_DURATION_SEC = 20 * 60;
const QUARTERS_PER_HALF = 4;

/** Calcule la durée de chaque mi-temps à partir des événements du match.
 * match_time_seconds = temps écoulé depuis le début de la mi-temps (par mi-temps).
 * Ex: 48min MT1 + 56min MT2 → quarts MT1: 12min chacun, quarts MT2: 14min chacun.
 */
function getHalfDurationsFromEvents(events: MatchEvent[]): { durationHalf1: number; durationHalf2: number } {
  const half1 = events.filter((e) => e.half === 1);
  const half2 = events.filter((e) => e.half === 2);
  const max1 = half1.length > 0 ? Math.max(...half1.map((e) => e.match_time_seconds)) : 0;
  const max2 = half2.length > 0 ? Math.max(...half2.map((e) => e.match_time_seconds)) : 0;

  const durationHalf1 = max1 > 0 ? max1 : DEFAULT_HALF_DURATION_SEC;
  const durationHalf2 = max2 > 0 ? max2 : DEFAULT_HALF_DURATION_SEC;

  return { durationHalf1, durationHalf2 };
}

/** Attribue un événement au quart (0-7) en fonction des durées réelles des mi-temps.
 * match_time_seconds est relatif au début de chaque mi-temps.
 */
function getQuarterFromEvent(
  ev: MatchEvent,
  durations: { durationHalf1: number; durationHalf2: number }
): number {
  const t = ev.match_time_seconds;
  const half = ev.half;
  const duration = half === 1 ? durations.durationHalf1 : durations.durationHalf2;

  const quarterInHalf = Math.min(
    Math.floor((t / duration) * QUARTERS_PER_HALF),
    QUARTERS_PER_HALF - 1
  );
  const q = Math.max(0, quarterInHalf);
  return half === 1 ? q : QUARTERS_PER_HALF + q;
}

const EVENT_TYPES: { key: MatchEventType; label: string; color: string }[] = [
  { key: 'goal', label: 'But', color: '#3b82f6' },
  { key: 'shot_on_target', label: 'Tir cadré', color: '#22c55e' },
  { key: 'shot', label: 'Tir', color: '#eab308' },
  { key: 'opponent_goal', label: 'But adv', color: '#dc2626' },
  { key: 'opponent_shot_on_target', label: 'TC adv', color: '#94a3b8' },
  { key: 'opponent_shot', label: 'Tir adv', color: '#64748b' },
];

function formatQuarterLabel(q: number): string {
  const half = Math.floor(q / QUARTERS_PER_HALF) + 1;
  const quarterInHalf = (q % QUARTERS_PER_HALF) + 1;
  return `MT${half} Q${quarterInHalf}`;
}

export type MatchMomentsViewProps = {
  matches: Match[];
  eventsByMatch: Record<string, MatchEvent[]>;
  filteredMatchIds: Set<string>;
};

const getDefaultVisible = () =>
  Object.fromEntries(EVENT_TYPES.map((e) => [e.key, true]));

export function MatchMomentsView({
  matches,
  eventsByMatch,
  filteredMatchIds,
}: MatchMomentsViewProps) {
  const [chartWidth, setChartWidth] = useState(300);
  const chartHeight = 220;

  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>(getDefaultVisible);

  const onChartLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setChartWidth(w - 24);
  }, []);

  const toggleType = useCallback((key: string) => {
    setVisibleTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const { quartersData, totalEvents } = useMemo(() => {
    const byQuarter: Record<number, { byType: Record<string, number>; total: number }> = {};
    for (let q = 0; q < 8; q++) {
      byQuarter[q] = { byType: {}, total: 0 };
    }

    let total = 0;
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      const durations = getHalfDurationsFromEvents(events);
      events.forEach((ev) => {
        const q = getQuarterFromEvent(ev, durations);
        if (q >= 0 && q < 8) {
          byQuarter[q].byType[ev.event_type] = (byQuarter[q].byType[ev.event_type] ?? 0) + 1;
          byQuarter[q].total++;
          total++;
        }
      });
    });

    return { quartersData: byQuarter, totalEvents: total };
  }, [eventsByMatch, filteredMatchIds]);

  const chartData = useMemo(() => {
    const labels = [0, 1, 2, 3, 4, 5, 6, 7].map((q) => formatQuarterLabel(q));
    const datasets = EVENT_TYPES
      .filter((e) => visibleTypes[e.key])
      .map((e) => ({
        data: [0, 1, 2, 3, 4, 5, 6, 7].map((q) => quartersData[q].byType[e.key] ?? 0),
        color: (opacity = 1) => {
          const hex = e.color.replace('#', '');
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        },
      }));
    return { labels, datasets };
  }, [quartersData, visibleTypes]);

  const chartConfig = {
    backgroundColor: '#fff',
    backgroundGradientFrom: '#f8fafc',
    backgroundGradientTo: '#f1f5f9',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    style: { borderRadius: 12 },
    propsForLabels: { fontSize: 10 },
    useShadowColorFromDataset: true,
  };

  if (filteredMatchIds.size === 0) {
    return (
      <Text style={styles.emptyText}>Aucun match ne correspond aux filtres sélectionnés.</Text>
    );
  }

  if (totalEvents === 0) {
    return (
      <Text style={styles.emptyText}>
        Aucun événement enregistré pour les matchs sélectionnés.
      </Text>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.legend}>
        Répartition des événements par quart (4 quarts par mi-temps, 8 au total)
      </Text>

      {chartData.datasets.length > 0 ? (
        <View style={styles.chartCard} onLayout={onChartLayout}>
          <LineChart
            data={chartData}
            width={chartWidth}
            height={chartHeight}
            chartConfig={chartConfig}
            style={styles.chart}
            bezier
            withDots
            withInnerLines
            fromZero
          />
        </View>
      ) : (
        <Text style={styles.noSeries}>Sélectionnez au moins un type d'événement</Text>
      )}

      <View style={styles.legendSection}>
        <Text style={styles.legendTitle}>Afficher / masquer les courbes</Text>
        <View style={styles.legendChips}>
          {EVENT_TYPES.map((e) => {
            const isVisible = visibleTypes[e.key];
            const hasData = [0, 1, 2, 3, 4, 5, 6, 7].some((q) => (quartersData[q].byType[e.key] ?? 0) > 0);
            return (
              <TouchableOpacity
                key={e.key}
                style={[
                  styles.legendChip,
                  isVisible && styles.legendChipActive,
                  !hasData && styles.legendChipInactive,
                ]}
                onPress={() => toggleType(e.key)}
              >
                <View style={[styles.legendDot, { backgroundColor: e.color }]} />
                <Text style={[styles.legendChipText, isVisible && styles.legendChipTextActive]}>
                  {e.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total :</Text>
        <Text style={styles.summaryValue}>{totalEvents} événements</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24, alignSelf: 'stretch' },
  legend: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 24,
  },
  noSeries: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginVertical: 16,
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  chart: { borderRadius: 8 },
  legendSection: {
    marginBottom: 16,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 10,
  },
  legendChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  legendChipActive: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  legendChipInactive: {
    opacity: 0.6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendChipText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  legendChipTextActive: {
    color: '#1e293b',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  summaryLabel: { fontSize: 14, color: '#64748b', marginRight: 8 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
});
