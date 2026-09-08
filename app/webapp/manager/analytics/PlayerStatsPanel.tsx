/**
 * PlayerStatsPanel — statistiques joueur. Miroir de
 * mobile/components/analytics/PlayerStatsPanel.tsx.
 *
 * Même principe que mobile : cartes joueur sous le seuil tablette (768px),
 * tableau avec colonne « Joueur » figée et défilement horizontal au-dessus.
 */
'use client';

import { useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { dataColor, deltaColor } from '@/lib/design/tokens';
import { useIsTablet } from '../../hooks/useIsTablet';
import { Text, Card, Button, Badge, Sheet, EmptyState } from './ui';
import { ArrowUpDown, Timer, ArrowUp, ArrowDown, Minus, BarChart3 } from 'lucide-react';
import {
  METRICS, SORT_OPTIONS, computeBenchmarks, density, deltaToMean, fmtMetric, fmtTime,
  normalizedMetric, rawMetric, sortRows, type MetricDef, type PlayerStats, type SortKey,
} from './playerStats';

const PRIMARY_KEYS = ['goals', 'assist', 'plusMinusGoals'] as const;

export interface PlayerStatsPanelProps {
  rows: PlayerStats[];
  emptyDescription?: string;
}

export function PlayerStatsPanel({ rows, emptyDescription }: PlayerStatsPanelProps) {
  const { theme } = useTheme();
  const isTablet = useIsTablet();
  const [sortKey, setSortKey] = useState<SortKey>('avgRating');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [normalized, setNormalized] = useState(false);
  const [sortSheet, setSortSheet] = useState(false);

  const benchmarks = useMemo(() => computeBenchmarks(rows, normalized), [rows, normalized]);
  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir, normalized), [rows, sortKey, sortDir, normalized]);

  if (rows.length === 0) {
    return <EmptyState icon={BarChart3} title="Aucune statistique" description={emptyDescription ?? 'Aucun match enregistré avec le Tracker.'} compact />;
  }

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? 'Trier';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.md }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm }}>
        <Button label={`${sortLabel} ${sortDir === 'desc' ? '↓' : '↑'}`} onPress={() => setSortSheet(true)} variant="secondary" size="sm" icon={ArrowUpDown} />
        <div style={{ flex: 1 }} />
        <Button label={normalized ? 'Par 20 min' : 'Totaux'} onPress={() => setNormalized((v) => !v)} variant={normalized ? 'primary' : 'secondary'} size="sm" icon={Timer} />
      </div>

      {normalized && (
        <Text variant="caption" tone="tertiary">
          Valeurs ramenées à 20 minutes de jeu. En futsal les rotations sont permanentes : les totaux bruts avantagent mécaniquement les joueurs les plus utilisés. Les joueurs sous 5 minutes cumulées affichent «&nbsp;—&nbsp;».
        </Text>
      )}

      {isTablet ? (
        <StatsTableTablet rows={sorted} normalized={normalized} benchmarks={benchmarks} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.md }}>
          {sorted.map((row, i) => (
            <PlayerStatCard key={row.playerId} row={row} rank={i + 1} normalized={normalized} benchmarks={benchmarks} />
          ))}
        </div>
      )}

      <Sheet visible={sortSheet} onClose={() => setSortSheet(false)} title="Trier le classement" subtitle="Touche un critère déjà actif pour inverser le sens">
        {SORT_OPTIONS.map((opt) => {
          const active = opt.key === sortKey;
          return (
            <Card
              key={opt.key}
              variant={active ? 'accent' : 'flat'}
              padding="sm"
              onPress={() => {
                if (active) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                else { setSortKey(opt.key); setSortDir(opt.key === 'playerName' ? 'asc' : 'desc'); }
                setSortSheet(false);
              }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}
            >
              <Text variant="body" tone={active ? 'accent' : 'primary'} style={{ flex: 1 } as React.CSSProperties}>{opt.label}</Text>
              {active && (sortDir === 'asc' ? <ArrowUp size={18} color={theme.colors.accent.default} /> : <ArrowDown size={18} color={theme.colors.accent.default} />)}
            </Card>
          );
        })}
      </Sheet>
    </div>
  );
}

// ─── Carte joueur (sous le seuil tablette) ─────────────────────────────────────

function PlayerStatCard({
  row, rank, normalized, benchmarks,
}: {
  row: PlayerStats; rank: number; normalized: boolean; benchmarks: ReturnType<typeof computeBenchmarks>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  const primary = METRICS.filter((m) => (PRIMARY_KEYS as readonly string[]).includes(m.key));
  const secondary = METRICS.filter((m) => !(PRIMARY_KEYS as readonly string[]).includes(m.key));

  return (
    <Card variant="raised" padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: theme.space.md }}>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
        <div style={{ minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center', display: 'flex', padding: '0 4px', backgroundColor: c.bg.sunken, borderRadius: theme.radius.sm }}>
          <Text variant="caption" tone="tertiary" numeric>{rank}</Text>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text variant="headline" numberOfLines={1}>{row.playerName}</Text>
          <Text variant="caption" tone="tertiary" numeric>
            {row.matchesPlayed} match{row.matchesPlayed > 1 ? 's' : ''} · {fmtTime(row.totalTimeSeconds)}
          </Text>
        </div>
        {row.avgRating != null && (
          <Badge label={row.avgRating.toFixed(1)} tone={row.avgRating >= 5.5 ? 'positive' : row.avgRating <= 4.5 ? 'negative' : 'neutral'} solid />
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', gap: theme.space.md }}>
        {primary.map((def) => (
          <MetricCell key={def.key} def={def} row={row} normalized={normalized} benchmarks={benchmarks} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md, borderTop: `1px solid ${c.border.subtle}`, paddingTop: theme.space.md }}>
        {secondary.map((def) => {
          const value = normalized && def.normalizable ? normalizedMetric(row, def.key) : rawMetric(row, def.key);
          return (
            <div key={def.key} style={{ minWidth: 78, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>{def.long}</Text>
              <Text variant="callout" numeric>{fmtMetric(value, normalized && def.normalizable, def.key)}</Text>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MetricCell({
  def, row, normalized, benchmarks,
}: {
  def: MetricDef; row: PlayerStats; normalized: boolean; benchmarks: ReturnType<typeof computeBenchmarks>;
}) {
  const { theme } = useTheme();
  const useNorm = normalized && def.normalizable;
  const value = useNorm ? normalizedMetric(row, def.key) : rawMetric(row, def.key);
  const bench = benchmarks[def.key];

  if (value == null) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: theme.space.xs }}>
        <Text variant="title" tone="tertiary">—</Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>{def.long}</Text>
      </div>
    );
  }

  const delta = deltaToMean(value, bench, def.higherIsBetter);
  const fill = density(value, bench, def.higherIsBetter);
  const color = dataColor(theme, def.higherIsBetter ? value : -value, def.higherIsBetter ? bench.mean : -bench.mean, Math.max(1, bench.max - bench.min));
  const DeltaIcon = delta > 0.05 ? ArrowUp : delta < -0.05 ? ArrowDown : Minus;
  const dColor = deltaColor(theme, Math.abs(delta) < 0.05 ? 0 : delta);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: theme.space.xs }}>
      <Text variant="title" numeric color={color}>{fmtMetric(value, useNorm, def.key)}</Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>{def.long}</Text>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <DeltaIcon size={10} color={dColor} />
        <Text variant="caption" numeric color={dColor}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}</Text>
        <Text variant="caption" tone="tertiary">moy.</Text>
      </div>
      <div style={{ height: 4, width: '100%', overflow: 'hidden', marginTop: 2, backgroundColor: theme.colors.bg.sunken, borderRadius: theme.radius.pill }}>
        <div style={{ width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%`, height: '100%', backgroundColor: color, borderRadius: theme.radius.pill }} />
      </div>
    </div>
  );
}

// ─── Tableau (seuil tablette et au-delà) ───────────────────────────────────────

const NAME_COL_WIDTH = 190;
const METRIC_COL_WIDTH = 74;

function StatsTableTablet({
  rows, normalized, benchmarks,
}: {
  rows: PlayerStats[]; normalized: boolean; benchmarks: ReturnType<typeof computeBenchmarks>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  const headerCell = (label: string, width: number, align: 'left' | 'center' = 'center') => (
    <div key={label} style={{ width, padding: `0 ${theme.space.sm}px` }}>
      <Text variant="tableHeader" tone="tertiary" numberOfLines={1} style={{ textAlign: align } as React.CSSProperties}>{label}</Text>
    </div>
  );

  return (
    <Card variant="flat" padding="none">
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        <div style={{ width: NAME_COL_WIDTH, flexShrink: 0, borderRight: `1px solid ${c.border.subtle}` }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', height: 40, borderBottom: `1px solid ${c.border.subtle}`, backgroundColor: c.bg.sunken }}>
            {headerCell('Joueur', NAME_COL_WIDTH, 'left')}
          </div>
          {rows.map((row, i) => (
            <div key={row.playerId} style={{
              display: 'flex', flexDirection: 'row', alignItems: 'center', height: 44,
              borderBottom: `1px solid ${c.border.subtle}`, paddingLeft: theme.space.sm, paddingRight: theme.space.sm, gap: theme.space.sm,
              backgroundColor: i % 2 === 1 ? c.bg.stripe : 'transparent',
            }}>
              <Text variant="caption" tone="tertiary" numeric style={{ width: 20 } as React.CSSProperties}>{i + 1}</Text>
              <Text variant="tableCell" numberOfLines={1} style={{ flex: 1 } as React.CSSProperties}>{row.playerName}</Text>
            </div>
          ))}
        </div>

        <div style={{ overflowX: 'auto', flex: 1 }}>
          <div style={{ width: 'max-content' }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', height: 40, borderBottom: `1px solid ${c.border.subtle}`, backgroundColor: c.bg.sunken }}>
              {headerCell('M', 48)}
              {headerCell('Temps', 74)}
              {METRICS.map((def) => headerCell(def.short, METRIC_COL_WIDTH))}
              {headerCell('Note', METRIC_COL_WIDTH)}
            </div>

            {rows.map((row, i) => (
              <div key={row.playerId} style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center', height: 44,
                borderBottom: `1px solid ${c.border.subtle}`,
                backgroundColor: i % 2 === 1 ? c.bg.stripe : 'transparent',
              }}>
                <div style={{ width: 48, display: 'flex', justifyContent: 'center' }}>
                  <Text variant="tableCell" tone="secondary" numeric>{row.matchesPlayed}</Text>
                </div>
                <div style={{ width: 74, display: 'flex', justifyContent: 'center' }}>
                  <Text variant="tableCell" tone="secondary" numeric>{fmtTime(row.totalTimeSeconds)}</Text>
                </div>
                {METRICS.map((def) => {
                  const useNorm = normalized && def.normalizable;
                  const value = useNorm ? normalizedMetric(row, def.key) : rawMetric(row, def.key);
                  const bench = benchmarks[def.key];
                  const color = value == null ? undefined : dataColor(theme, def.higherIsBetter ? value : -value, def.higherIsBetter ? bench.mean : -bench.mean, Math.max(1, bench.max - bench.min));
                  return (
                    <div key={def.key} style={{ width: METRIC_COL_WIDTH, display: 'flex', justifyContent: 'center' }}>
                      <Text variant="tableCell" numeric color={color}>{fmtMetric(value, useNorm, def.key)}</Text>
                    </div>
                  );
                })}
                <div style={{ width: METRIC_COL_WIDTH, display: 'flex', justifyContent: 'center' }}>
                  <Text variant="tableCell" numeric color={row.avgRating == null ? undefined : dataColor(theme, row.avgRating, 5, 3)}>
                    {row.avgRating != null ? row.avgRating.toFixed(1) : '—'}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
