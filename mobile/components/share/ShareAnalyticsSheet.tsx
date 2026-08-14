/**
 * ShareAnalyticsSheet — audience de la bibliothèque partagée (P0-7, P1-2)
 *
 * Extrait de `app/(tabs)/share/index.tsx` (1 107 lignes) avant restylage.
 * C'était à lui seul ~270 lignes de JSX inline, imbriquant deux niveaux de
 * `Pressable` superposés dans une même `Modal` pour simuler un second panneau.
 *
 * Corrections notables :
 *
 * - Le graphique passe de `react-native-chart-kit` au `LineChart` maison. La
 *   bibliothèque imposait un fond en dégradé clair (`backgroundGradientFrom`)
 *   qui produisait une carte blanche au milieu d'un écran sombre.
 * - Les deux sélecteurs (joueur, contenu) étaient un panneau superposé
 *   `StyleSheet.absoluteFill` **à l'intérieur** de la feuille : le geste de
 *   fermeture du panneau et celui de la feuille se disputaient le même
 *   toucher. Ils deviennent deux `Sheet` distinctes.
 * - Les cases à cocher de filtre étaient des `<View>` de 18 pt sans rôle ni
 *   état : ni annoncées, ni atteignables.
 */

import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { Text, Card, Button, Badge, Sheet, Stat, EmptyState, SkeletonList, ChipGroup, type ChipOption } from '../ui';
import { LineChart } from '../charts/LineChart';
import type { ContentAnalyticsRow } from '../../lib/services/sharedContent';

type DateRange = '7d' | '30d' | '90d' | 'all';

const RANGES: readonly ChipOption<DateRange>[] = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '3 mois' },
  { value: 'all', label: 'Tout' },
];

const RANGE_DAYS: Record<Exclude<DateRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

export interface ShareAnalyticsSheetProps {
  visible: boolean;
  onClose: () => void;
  rows: ContentAnalyticsRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function ShareAnalyticsSheet({
  visible,
  onClose,
  rows,
  loading,
  error,
  onRetry,
}: ShareAnalyticsSheetProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [range, setRange] = useState<DateRange>('30d');
  const [playerFilter, setPlayerFilter] = useState<string | null>(null);
  const [contentFilter, setContentFilter] = useState<string[]>([]);
  const [picker, setPicker] = useState<'player' | 'content' | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Dérivés ───────────────────────────────────────────────────────────────

  const players = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.player_id && r.player_name) map.set(r.player_id, r.player_name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [rows]);

  const contents = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.content_id && r.content_title) map.set(r.content_id, r.content_title);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows.filter((r) => r.viewed_at && r.player_id);
    if (range !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
      out = out.filter((r) => new Date(r.viewed_at!) >= cutoff);
    }
    if (playerFilter) out = out.filter((r) => r.player_id === playerFilter);
    if (contentFilter.length > 0) out = out.filter((r) => contentFilter.includes(r.content_id));
    return out;
  }, [rows, range, playerFilter, contentFilter]);

  const timeSeries = useMemo(() => {
    const map = new Map<string, number>();
    if (range !== 'all') {
      for (let i = RANGE_DAYS[range] - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        map.set(d.toISOString().slice(0, 10), 0);
      }
    }
    filtered.forEach((r) => {
      const key = r.viewed_at!.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, views]) => ({
        label: new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'short',
        }),
        views,
      }));
  }, [filtered, range]);

  const perPlayer = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      if (r.player_name) map.set(r.player_name, (map.get(r.player_name) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const perContent = useMemo(() => {
    type Row = {
      id: string;
      title: string;
      type: string;
      folder: string | null;
      totalViews: number;
      viewers: Set<string>;
      views: { name: string; at: string }[];
    };
    const map = new Map<string, Row>();
    rows.forEach((r) => {
      if (!map.has(r.content_id)) {
        map.set(r.content_id, {
          id: r.content_id,
          title: r.content_title,
          type: r.content_type,
          folder: r.folder_name,
          totalViews: 0,
          viewers: new Set(),
          views: [],
        });
      }
    });
    filtered.forEach((r) => {
      const row = map.get(r.content_id);
      if (!row) return;
      row.totalViews++;
      row.viewers.add(r.player_id!);
      row.views.push({ name: r.player_name!, at: r.viewed_at! });
    });
    const hasFilter = range !== 'all' || !!playerFilter || contentFilter.length > 0;
    return [...map.values()]
      .filter((r) => !hasFilter || r.totalViews > 0)
      .sort((a, b) => b.totalViews - a.totalViews);
  }, [rows, filtered, range, playerFilter, contentFilter]);

  const playerLabel = playerFilter
    ? players.find(([id]) => id === playerFilter)?.[1] ?? 'Joueur'
    : 'Tous les joueurs';

  const contentLabel =
    contentFilter.length === 0
      ? 'Tout le contenu'
      : contentFilter.length === 1
        ? contents.find(([id]) => id === contentFilter[0])?.[1] ?? '1 contenu'
        : `${contentFilter.length} contenus`;

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const dropdown = (label: string, active: boolean, onPress: () => void, a11y: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[
        styles.dropdown,
        {
          borderRadius: theme.radius.sm,
          borderColor: active ? c.accent.default : c.border.subtle,
          backgroundColor: active ? c.accent.subtle : c.bg.sunken,
        },
      ]}
    >
      <Text
        variant="callout"
        tone={active ? 'accent' : 'secondary'}
        weight="600"
        numberOfLines={1}
        style={styles.flex}
      >
        {label}
      </Text>
      <Ionicons name="chevron-down" size={13} color={active ? c.accent.default : c.text.tertiary} />
    </Pressable>
  );

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title="Audience" maxHeight="88%">
        {loading ? (
          <SkeletonList rows={6} />
        ) : error ? (
          <EmptyState
            icon="alert-circle-outline"
            tone="negative"
            title="Statistiques indisponibles"
            description={error}
            action={{ label: 'Réessayer', onPress: onRetry }}
            compact
          />
        ) : (
          <View style={{ gap: theme.space.lg }}>
            <ChipGroup label="Période" options={RANGES} value={range} onChange={setRange} />

            <View style={styles.dropdownRow}>
              {dropdown(playerLabel, !!playerFilter, () => setPicker('player'), `Filtrer par joueur, actuellement ${playerLabel}`)}
              {dropdown(contentLabel, contentFilter.length > 0, () => setPicker('content'), `Filtrer par contenu, actuellement ${contentLabel}`)}
            </View>

            <View style={styles.kpiRow}>
              <Card variant="flat" padding="sm" style={styles.flex}>
                <Stat value={String(filtered.length)} label="Ouvertures" size="compact" />
              </Card>
              <Card variant="flat" padding="sm" style={styles.flex}>
                <Stat
                  value={String(new Set(filtered.map((r) => r.player_id)).size)}
                  label="Joueurs"
                  size="compact"
                />
              </Card>
              <Card variant="flat" padding="sm" style={styles.flex}>
                <Stat
                  value={String(new Set(filtered.map((r) => r.content_id)).size)}
                  label="Contenus"
                  size="compact"
                />
              </Card>
            </View>

            {timeSeries.length > 1 && timeSeries.some((d) => d.views > 0) && (
              <View style={styles.block}>
                <Text variant="callout" tone="secondary" weight="600">
                  Ouvertures par jour
                </Text>
                <Card variant="flat" padding="sm">
                  <LineChart
                    labels={timeSeries.map((d) => d.label)}
                    series={[
                      {
                        key: 'views',
                        label: 'Ouvertures',
                        color: c.accent.default,
                        data: timeSeries.map((d) => d.views),
                      },
                    ]}
                    height={130}
                    fromZero
                    smooth={false}
                    accessibilityLabel={`Ouvertures par jour. ${timeSeries
                      .filter((d) => d.views > 0)
                      .map((d) => `${d.label} : ${d.views}`)
                      .join(', ')}`}
                  />
                </Card>
              </View>
            )}

            {perPlayer.length > 0 && (
              <View style={styles.block}>
                <Text variant="callout" tone="secondary" weight="600">
                  Ouvertures par joueur
                </Text>
                <Card variant="flat" padding="sm" style={styles.barList}>
                  {perPlayer.map(([name, count]) => {
                    const pct = perPlayer[0][1] > 0 ? count / perPlayer[0][1] : 0;
                    return (
                      <View key={name} accessible accessibilityLabel={`${name} : ${count} ouvertures`}>
                        <View style={styles.barHead}>
                          <Text variant="callout" numberOfLines={1} style={styles.flex}>
                            {name}
                          </Text>
                          <Text variant="callout" tone="accent" weight="700" numeric>
                            {count}
                          </Text>
                        </View>
                        <View style={[styles.barTrack, { backgroundColor: c.bg.sunken }]}>
                          <View
                            style={[
                              styles.barFill,
                              { width: `${Math.round(pct * 100)}%`, backgroundColor: c.accent.fill },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}

            {perContent.length === 0 ? (
              <EmptyState
                icon="eye-off-outline"
                title="Aucune ouverture sur cette période"
                description="Essayez une période plus longue."
                compact
              />
            ) : (
              <View style={styles.block}>
                <Text variant="callout" tone="secondary" weight="600">
                  Par contenu
                </Text>
                {perContent.map((row) => {
                  const isYt = row.type === 'youtube';
                  const expanded = expandedId === row.id;
                  return (
                    <Card key={row.id} variant="flat" padding="none">
                      <Pressable
                        onPress={() => setExpandedId((p) => (p === row.id ? null : row.id))}
                        disabled={row.totalViews === 0}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        accessibilityLabel={`${row.title}. ${row.totalViews} ouvertures par ${row.viewers.size} joueurs`}
                        style={styles.contentRow}
                      >
                        <View
                          style={[
                            styles.contentIcon,
                            { backgroundColor: c.bg.sunken, borderRadius: theme.radius.sm },
                          ]}
                        >
                          <Ionicons
                            name={isYt ? 'logo-youtube' : 'link-outline'}
                            size={16}
                            color={c.text.secondary}
                          />
                        </View>
                        <View style={styles.contentText}>
                          <Text variant="callout" weight="700" numberOfLines={1}>
                            {row.title}
                          </Text>
                          {row.folder && (
                            <Text variant="caption" tone="tertiary" numberOfLines={1}>
                              {row.folder}
                            </Text>
                          )}
                        </View>
                        <View style={styles.contentStats}>
                          <Text
                            variant="callout"
                            tone={row.totalViews > 0 ? 'accent' : 'tertiary'}
                            weight="700"
                            numeric
                          >
                            {row.totalViews}
                          </Text>
                          <Text variant="caption" tone="tertiary" numeric>
                            {row.viewers.size} j.
                          </Text>
                        </View>
                        {row.totalViews > 0 && (
                          <Ionicons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={15}
                            color={c.text.tertiary}
                          />
                        )}
                      </Pressable>

                      {expanded && row.views.length > 0 && (
                        <View
                          style={[
                            styles.viewList,
                            { backgroundColor: c.bg.sunken, borderTopColor: c.border.subtle },
                          ]}
                        >
                          {row.views.map((v, i) => (
                            <View key={i} style={styles.viewRow}>
                              <Ionicons name="checkmark-circle" size={14} color={c.positive.default} />
                              <Text variant="caption" weight="600" style={styles.flex} numberOfLines={1}>
                                {v.name}
                              </Text>
                              <Text variant="caption" tone="tertiary">
                                {new Date(v.at).toLocaleDateString('fr-FR', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </Sheet>

      {/* Sélecteurs en feuilles distinctes. Avant, c'était un panneau superposé
          à l'intérieur de la feuille d'audience, et les deux gestes de fermeture
          se disputaient le même toucher. */}
      <Sheet
        visible={picker === 'player'}
        onClose={() => setPicker(null)}
        title="Filtrer par joueur"
      >
        <View style={styles.pickList}>
          <PickRow
            label="Tous les joueurs"
            selected={!playerFilter}
            onPress={() => {
              setPlayerFilter(null);
              setPicker(null);
            }}
          />
          {players.map(([id, label]) => (
            <PickRow
              key={id}
              label={label}
              selected={playerFilter === id}
              onPress={() => {
                haptics.select();
                setPlayerFilter(playerFilter === id ? null : id);
                setPicker(null);
              }}
            />
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={picker === 'content'}
        onClose={() => setPicker(null)}
        title="Filtrer par contenu"
        subtitle="Sélection multiple."
      >
        <View style={{ gap: theme.space.md }}>
          <View style={styles.pickActions}>
            <Button
              label="Tout sélectionner"
              variant="ghost"
              size="sm"
              onPress={() => setContentFilter(contents.map(([id]) => id))}
            />
            {contentFilter.length > 0 && (
              <Button label="Effacer" variant="ghost" size="sm" onPress={() => setContentFilter([])} />
            )}
          </View>
          <View style={styles.pickList}>
            {contents.map(([id, label]) => {
              const selected = contentFilter.includes(id);
              return (
                <PickRow
                  key={id}
                  label={label}
                  selected={selected}
                  multi
                  onPress={() => {
                    haptics.select();
                    setContentFilter((prev) =>
                      selected ? prev.filter((x) => x !== id) : [...prev, id]
                    );
                  }}
                />
              );
            })}
          </View>
          <Button label="Appliquer" block onPress={() => setPicker(null)} />
        </View>
      </Sheet>
    </>
  );
}

function PickRow({
  label,
  selected,
  multi = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.pickRow,
        {
          borderRadius: theme.radius.sm,
          backgroundColor: selected ? c.accent.subtle : pressed ? c.bg.sunken : 'transparent',
        },
      ]}
    >
      <Ionicons
        name={selected ? (multi ? 'checkbox' : 'checkmark-circle') : multi ? 'square-outline' : 'ellipse-outline'}
        size={20}
        color={selected ? c.accent.default : c.text.tertiary}
      />
      <Text variant="body" tone={selected ? 'accent' : 'primary'} numberOfLines={2} style={styles.flex}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: 8 },
  dropdownRow: { flexDirection: 'row', gap: 8 },
  dropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kpiRow: { flexDirection: 'row', gap: 8 },
  barList: { gap: 10 },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },

  contentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 56 },
  contentIcon: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  contentText: { flex: 1, gap: 1 },
  contentStats: { alignItems: 'flex-end', gap: 1 },
  viewList: { paddingHorizontal: 14, paddingVertical: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  pickList: { gap: 2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 10 },
  pickActions: { flexDirection: 'row', gap: 8 },
});
