/**
 * PlayerStatsPanel — statistiques joueur (P0-3)
 *
 * Remplace le `StatsTable` de `AnalyticsView`, qui était l'élément le plus mal
 * traité de l'app alors qu'il porte la promesse centrale du produit :
 * en-têtes à `fontSize: 8`, cellules à 10, 13 colonnes écrasées dans une
 * largeur d'iPhone (environ 19 pt par colonne), tri par des en-têtes
 * pratiquement inatteignables au doigt.
 *
 * Trois décisions structurantes :
 *
 * 1. **Sur iPhone, plus de tableau.** Une liste de cartes joueur, où chaque
 *    métrique dispose de la place nécessaire pour afficher sa valeur, son écart
 *    à la moyenne de l'effectif et une barre de densité. Le tableau était une
 *    tentative d'afficher 13 colonnes sur 390 points : c'était perdu d'avance.
 * 2. **Sur iPad, le tableau reste**, mais avec colonne « Joueur » figée et
 *    défilement horizontal sur les métriques. Le refus du scroll horizontal
 *    était la décision fautive d'origine : elle a forcé la compression, donc la
 *    police minuscule, donc l'illisibilité, sans rien préserver.
 * 3. **Tri explicite** par un bouton, plus par des en-têtes de 19 points.
 */

import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { dataColor, deltaColor } from '../../lib/design/tokens';
import { haptics } from '../../lib/design/haptics';
import { useIsTablet } from '../../hooks/useIsTablet';
import { Text, Card, Button, Badge, Sheet, EmptyState } from '../ui';
import {
  METRICS,
  SORT_OPTIONS,
  computeBenchmarks,
  density,
  deltaToMean,
  fmtMetric,
  fmtTime,
  normalizedMetric,
  rawMetric,
  sortRows,
  type MetricDef,
  type PlayerStats,
  type SortKey,
} from './playerStats';

/** Métriques mises en avant sur la carte téléphone. Les autres passent en pied. */
const PRIMARY_KEYS = ['goals', 'assist', 'plusMinusGoals'] as const;

export interface PlayerStatsPanelProps {
  rows: PlayerStats[];
  /** Message affiché quand il n'y a rien à montrer. */
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
  const sorted = useMemo(
    () => sortRows(rows, sortKey, sortDir, normalized),
    [rows, sortKey, sortDir, normalized],
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="stats-chart-outline"
        title="Aucune statistique"
        description={emptyDescription ?? 'Aucun match enregistré avec le Tracker.'}
        compact
      />
    );
  }

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? 'Trier';

  return (
    <View style={{ gap: theme.space.md }}>
      {/* Contrôles : tri explicite et normalisation au temps de jeu. */}
      <View style={[styles.controls, { gap: theme.space.sm }]}>
        <Button
          label={`${sortLabel} ${sortDir === 'desc' ? '↓' : '↑'}`}
          onPress={() => setSortSheet(true)}
          variant="secondary"
          size="sm"
          icon="swap-vertical-outline"
          accessibilityHint="Choisir le critère de tri du classement"
        />
        <View style={{ flex: 1 }} />
        <Button
          label={normalized ? 'Par 20 min' : 'Totaux'}
          onPress={() => {
            haptics.select();
            setNormalized((v) => !v);
          }}
          variant={normalized ? 'primary' : 'secondary'}
          size="sm"
          icon="timer-outline"
          accessibilityHint="Basculer entre totaux bruts et valeurs ramenées à 20 minutes de jeu"
        />
      </View>

      {normalized ? (
        <Text variant="caption" tone="tertiary">
          Valeurs ramenées à 20 minutes de jeu. En futsal les rotations sont
          permanentes : les totaux bruts avantagent mécaniquement les joueurs les
          plus utilisés. Les joueurs sous 5 minutes cumulées affichent «&nbsp;—&nbsp;».
        </Text>
      ) : null}

      {isTablet ? (
        <StatsTableTablet rows={sorted} normalized={normalized} benchmarks={benchmarks} />
      ) : (
        <View style={{ gap: theme.space.md }}>
          {sorted.map((row, i) => (
            <PlayerStatCard
              key={row.playerId}
              row={row}
              rank={i + 1}
              normalized={normalized}
              benchmarks={benchmarks}
            />
          ))}
        </View>
      )}

      <Sheet
        visible={sortSheet}
        onClose={() => setSortSheet(false)}
        title="Trier le classement"
        subtitle="Touche un critère déjà actif pour inverser le sens"
      >
        {SORT_OPTIONS.map((opt) => {
          const active = opt.key === sortKey;
          return (
            <Card
              key={opt.key}
              variant={active ? 'accent' : 'flat'}
              padding="sm"
              onPress={() => {
                if (active) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                else {
                  setSortKey(opt.key);
                  setSortDir(opt.key === 'playerName' ? 'asc' : 'desc');
                }
                setSortSheet(false);
              }}
              accessibilityLabel={`Trier par ${opt.label}`}
              style={styles.sortRow}
            >
              <Text variant="body" tone={active ? 'accent' : 'primary'} style={{ flex: 1 }}>
                {opt.label}
              </Text>
              {active ? (
                <Ionicons
                  name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}
                  size={18}
                  color={theme.colors.accent.default}
                />
              ) : null}
            </Card>
          );
        })}
      </Sheet>
    </View>
  );
}

// ─── Carte joueur (iPhone) ───────────────────────────────────────────────────

function PlayerStatCard({
  row,
  rank,
  normalized,
  benchmarks,
}: {
  row: PlayerStats;
  rank: number;
  normalized: boolean;
  benchmarks: ReturnType<typeof computeBenchmarks>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  const primary = METRICS.filter((m) =>
    (PRIMARY_KEYS as readonly string[]).includes(m.key),
  );
  const secondary = METRICS.filter(
    (m) => !(PRIMARY_KEYS as readonly string[]).includes(m.key),
  );

  return (
    <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
      {/* En-tête : rang, nom complet, note data */}
      <View style={[styles.cardHeader, { gap: theme.space.md }]}>
        <View
          style={[
            styles.rank,
            { backgroundColor: c.bg.sunken, borderRadius: theme.radius.sm },
          ]}
        >
          <Text variant="caption" tone="tertiary" numeric>
            {rank}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="headline" numberOfLines={1}>
            {row.playerName}
          </Text>
          <Text variant="caption" tone="tertiary" numeric>
            {row.matchesPlayed} match{row.matchesPlayed > 1 ? 's' : ''} · {fmtTime(row.totalTimeSeconds)}
          </Text>
        </View>
        {row.avgRating != null ? (
          <Badge
            label={row.avgRating.toFixed(1)}
            tone={row.avgRating >= 5.5 ? 'positive' : row.avgRating <= 4.5 ? 'negative' : 'neutral'}
            solid
          />
        ) : null}
      </View>

      {/* Métriques principales : valeur, écart à la moyenne, barre de densité */}
      <View style={[styles.primaryRow, { gap: theme.space.md }]}>
        {primary.map((def) => (
          <MetricCell
            key={def.key}
            def={def}
            row={row}
            normalized={normalized}
            benchmarks={benchmarks}
          />
        ))}
      </View>

      {/* Métriques secondaires, en une ligne compacte mais lisible */}
      <View
        style={[
          styles.secondaryRow,
          { gap: theme.space.md, borderTopColor: c.border.subtle, paddingTop: theme.space.md },
        ]}
      >
        {secondary.map((def) => {
          const value = normalized && def.normalizable
            ? normalizedMetric(row, def.key)
            : rawMetric(row, def.key);
          return (
            <View key={def.key} style={styles.secondaryItem}>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {def.long}
              </Text>
              <Text variant="callout" numeric>
                {fmtMetric(value, normalized && def.normalizable, def.key)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/** Une métrique mise en perspective : valeur, delta à la moyenne, densité. */
function MetricCell({
  def,
  row,
  normalized,
  benchmarks,
}: {
  def: MetricDef;
  row: PlayerStats;
  normalized: boolean;
  benchmarks: ReturnType<typeof computeBenchmarks>;
}) {
  const { theme } = useTheme();
  const useNorm = normalized && def.normalizable;
  const value = useNorm ? normalizedMetric(row, def.key) : rawMetric(row, def.key);
  const bench = benchmarks[def.key];

  if (value == null) {
    return (
      <View style={{ flex: 1, gap: theme.space.xs }}>
        <Text variant="title" tone="tertiary">
          —
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {def.long}
        </Text>
      </View>
    );
  }

  const delta = deltaToMean(value, bench, def.higherIsBetter);
  const fill = density(value, bench, def.higherIsBetter);
  const color = dataColor(theme, def.higherIsBetter ? value : -value,
    def.higherIsBetter ? bench.mean : -bench.mean,
    Math.max(1, bench.max - bench.min));

  return (
    <View style={{ flex: 1, gap: theme.space.xs }}>
      <Text variant="title" numeric color={color}>
        {fmtMetric(value, useNorm, def.key)}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {def.long}
      </Text>
      <View style={[styles.deltaRow, { gap: 3 }]}>
        <Ionicons
          name={delta > 0.05 ? 'arrow-up' : delta < -0.05 ? 'arrow-down' : 'remove'}
          size={10}
          color={deltaColor(theme, Math.abs(delta) < 0.05 ? 0 : delta)}
        />
        <Text
          variant="caption"
          numeric
          color={deltaColor(theme, Math.abs(delta) < 0.05 ? 0 : delta)}
        >
          {delta > 0 ? '+' : ''}
          {delta.toFixed(1)}
        </Text>
        <Text variant="caption" tone="tertiary">
          moy.
        </Text>
      </View>
      <View
        style={[
          styles.densityTrack,
          { backgroundColor: theme.colors.bg.sunken, borderRadius: theme.radius.pill },
        ]}
      >
        <View
          style={{
            width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: theme.radius.pill,
          }}
        />
      </View>
    </View>
  );
}

// ─── Tableau (iPad) ──────────────────────────────────────────────────────────

const NAME_COL_WIDTH = 190;
const METRIC_COL_WIDTH = 74;

function StatsTableTablet({
  rows,
  normalized,
  benchmarks,
}: {
  rows: PlayerStats[];
  normalized: boolean;
  benchmarks: ReturnType<typeof computeBenchmarks>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  const headerCell = (label: string, width: number, align: 'left' | 'center' = 'center') => (
    <View key={label} style={{ width, paddingHorizontal: theme.space.sm }}>
      <Text
        variant="tableHeader"
        tone="tertiary"
        numberOfLines={1}
        style={{ textAlign: align }}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <Card variant="flat" padding="none">
      <View style={styles.tableRoot}>
        {/* Colonne figée : le nom reste visible pendant le défilement */}
        <View style={{ width: NAME_COL_WIDTH, borderRightWidth: 1, borderRightColor: c.border.subtle }}>
          <View
            style={[
              styles.tableHeaderRow,
              { backgroundColor: c.bg.sunken, borderBottomColor: c.border.subtle },
            ]}
          >
            {headerCell('Joueur', NAME_COL_WIDTH, 'left')}
          </View>
          {rows.map((row, i) => (
            <View
              key={row.playerId}
              style={[
                styles.tableRow,
                {
                  backgroundColor: i % 2 === 1 ? c.bg.stripe : 'transparent',
                  borderBottomColor: c.border.subtle,
                  paddingHorizontal: theme.space.sm,
                  gap: theme.space.sm,
                },
              ]}
            >
              <Text variant="caption" tone="tertiary" numeric style={{ width: 20 }}>
                {i + 1}
              </Text>
              <Text variant="tableCell" numberOfLines={1} style={{ flex: 1 }}>
                {row.playerName}
              </Text>
            </View>
          ))}
        </View>

        {/* Métriques : défilement horizontal assumé plutôt que compression */}
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
          <View>
            <View
              style={[
                styles.tableHeaderRow,
                { backgroundColor: c.bg.sunken, borderBottomColor: c.border.subtle },
              ]}
            >
              {headerCell('M', 48)}
              {headerCell('Temps', 74)}
              {METRICS.map((def) => headerCell(def.short, METRIC_COL_WIDTH))}
              {headerCell('Note', METRIC_COL_WIDTH)}
            </View>

            {rows.map((row, i) => (
              <View
                key={row.playerId}
                style={[
                  styles.tableRow,
                  {
                    backgroundColor: i % 2 === 1 ? c.bg.stripe : 'transparent',
                    borderBottomColor: c.border.subtle,
                  },
                ]}
              >
                <View style={{ width: 48, alignItems: 'center' }}>
                  <Text variant="tableCell" tone="secondary" numeric>
                    {row.matchesPlayed}
                  </Text>
                </View>
                <View style={{ width: 74, alignItems: 'center' }}>
                  <Text variant="tableCell" tone="secondary" numeric>
                    {fmtTime(row.totalTimeSeconds)}
                  </Text>
                </View>
                {METRICS.map((def) => {
                  const useNorm = normalized && def.normalizable;
                  const value = useNorm ? normalizedMetric(row, def.key) : rawMetric(row, def.key);
                  const bench = benchmarks[def.key];
                  const color =
                    value == null
                      ? undefined
                      : dataColor(
                          theme,
                          def.higherIsBetter ? value : -value,
                          def.higherIsBetter ? bench.mean : -bench.mean,
                          Math.max(1, bench.max - bench.min),
                        );
                  return (
                    <View key={def.key} style={{ width: METRIC_COL_WIDTH, alignItems: 'center' }}>
                      <Text variant="tableCell" numeric color={color}>
                        {fmtMetric(value, useNorm, def.key)}
                      </Text>
                    </View>
                  );
                })}
                <View style={{ width: METRIC_COL_WIDTH, alignItems: 'center' }}>
                  <Text
                    variant="tableCell"
                    numeric
                    color={
                      row.avgRating == null
                        ? undefined
                        : dataColor(theme, row.avgRating, 5, 3)
                    }
                  >
                    {row.avgRating != null ? row.avgRating.toFixed(1) : '—'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rank: {
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  primaryRow: {
    flexDirection: 'row',
  },
  secondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
  },
  secondaryItem: {
    minWidth: 78,
    gap: 2,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  densityTrack: {
    height: 4,
    width: '100%',
    overflow: 'hidden',
    marginTop: 2,
  },
  tableRoot: {
    flexDirection: 'row',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
