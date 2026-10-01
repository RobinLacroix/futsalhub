/**
 * MatchMomentsView — momentum du match sur la sélection, décliné par
 * catégorie d'événement (global / buts / tirs cadrés / tirs totaux).
 * Réutilise tel quel le moteur et le rendu du momentum du bilan post-match
 * (`app/webapp/tracker/components/MatchMomentumChart.tsx`, lui-même sur
 * `lib/matchMomentum.ts`) : même calcul à décroissance causale, même
 * histogramme divergent — avec deux adaptations propres à cette vue agrégée
 * sur plusieurs matchs (voir `BuildMomentumOptions` dans `lib/matchMomentum.ts`) :
 *
 * 1. `maxPointsPerHalf` fixe le nombre de barres par mi-temps quel que soit le
 *    nombre/la durée des matchs sélectionnés, pour rester lisible en agrégat
 *    (contrairement au bilan d'UN match, qui garde une barre par minute).
 * 2. La déclinaison « Buts » désactive la décroissance (`decay: false`) : un
 *    but est un événement rare et net, une traînée qui s'étale sur plusieurs
 *    minutes autour n'apporterait rien, juste un pic isolé à l'instant T.
 *
 * Miroir de mobile/components/MatchMomentsView.tsx.
 */
'use client';

import { useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Card, EmptyState } from './ui';
import { MatchMomentumChart } from '../../tracker/components/MatchMomentumChart';
import type { MomentumEvent } from '@/lib/matchMomentum';
import { Filter } from 'lucide-react';
import type { Match, MatchEvent } from '@/types';

const MAX_POINTS_PER_HALF = 15;

type MetricKey = 'global' | 'goal' | 'shot_on_target' | 'total_shots';

const METRICS: { key: MetricKey; label: string; eventTypes: string[] | null; decay: boolean }[] = [
  { key: 'global', label: 'Global', eventTypes: null, decay: true },
  { key: 'goal', label: 'Buts', eventTypes: ['goal', 'opponent_goal'], decay: false },
  { key: 'shot_on_target', label: 'Tirs cadrés', eventTypes: ['shot_on_target', 'opponent_shot_on_target'], decay: true },
  { key: 'total_shots', label: 'Tirs totaux', eventTypes: ['shot', 'shot_on_target', 'opponent_shot', 'opponent_shot_on_target'], decay: true },
];

export type MatchMomentsViewProps = {
  matches: Match[];
  eventsByMatch: Record<string, MatchEvent[]>;
  filteredMatchIds: Set<string>;
};

export function MatchMomentsView({ eventsByMatch, filteredMatchIds }: MatchMomentsViewProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [metric, setMetric] = useState<MetricKey>('global');
  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  const momentumEvents: MomentumEvent[] = useMemo(() => {
    const out: MomentumEvent[] = [];
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      events.forEach((ev) => {
        if (active.eventTypes === null || active.eventTypes.includes(ev.event_type)) {
          out.push({ event_type: ev.event_type, match_time_seconds: ev.match_time_seconds, half: ev.half });
        }
      });
    });
    return out;
  }, [eventsByMatch, filteredMatchIds, active]);

  if (filteredMatchIds.size === 0) {
    return <EmptyState icon={Filter} title="Aucun match sélectionné" description="Aucun match ne correspond aux filtres en cours." compact />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.lg, paddingBottom: 24 }}>
      <Text variant="callout" tone="secondary">
        Momentum sur la sélection : qui domine, minute par minute, pour la catégorie choisie.
      </Text>

      <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 3, borderRadius: theme.radius.md, backgroundColor: c.bg.sunken }}>
        {METRICS.map((m) => {
          const isActive = metric === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setMetric(m.key)}
              style={{
                flex: '1 1 47%',
                minHeight: 36,
                borderRadius: theme.radius.sm,
                border: `1px solid ${isActive ? c.border.subtle : 'transparent'}`,
                backgroundColor: isActive ? c.bg.surface : 'transparent',
                cursor: 'pointer',
              }}
            >
              <Text variant="caption" weight={600} tone={isActive ? 'accent' : 'secondary'}>{m.label}</Text>
            </button>
          );
        })}
      </div>

      <Card variant="flat" padding="sm">
        <MatchMomentumChart
          events={momentumEvents}
          maxPointsPerHalf={MAX_POINTS_PER_HALF}
          decay={active.decay}
          height={180}
          usColor={c.chartSeries[0] ?? c.accent.default}
          opponentColor={c.chartSeries[3] ?? c.negative.default}
          gridColor={c.chartGrid}
          textColor={c.text.tertiary}
        />
      </Card>
    </div>
  );
}
