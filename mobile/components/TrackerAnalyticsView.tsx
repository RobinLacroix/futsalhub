/**
 * Analyse → Matchs
 *
 * Liste des matchs suivis au recorder, tableau de statistiques joueur triable,
 * et vue « Moments du match ».
 *
 * ## Ce que cette version change
 *
 * **Le calcul est parti.** L'écran reconstruisait lui-même les statistiques
 * joueur à partir des événements — ~180 lignes strictement identiques à celles
 * d'`AnalyticsView`, le segment voisin du même onglet. Tout vit désormais dans
 * `analytics/aggregate.ts`, et les données dans `MatchAnalyticsContext`, qui
 * charge une seule fois pour les deux segments au lieu de deux.
 *
 * **Les couleurs aussi.** L'écran portait trois couleurs de marque à lui seul :
 * un bleu `#3b82f6` pour les filtres actifs, les scores et les flèches de tri,
 * un vert `#16a34a` pour le bouton principal — alors que l'action principale de
 * tout le reste de l'app est sur l'accent — et un rouge/vert pour les `+/-`.
 * Cette dernière paire est celle que la deutéranopie détruit : la rampe
 * sémantique (`deltaColor`) la remplace, pôle haut en teal.
 *
 * **Le tableau était muet.** Les en-têtes de colonne sont des boutons de tri,
 * sans rôle ni état d'accessibilité : un lecteur d'écran annonçait « TC »
 * sans dire que c'était actionnable, ni dans quel sens la colonne était triée.
 * Les libellés courts sont maintenant développés à l'annonce — « Tirs cadrés »
 * plutôt que « TC », que rien ne permettait de deviner sans lire la légende en
 * bas d'écran.
 */

import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { deltaColor } from '../lib/design/tokens';
import { haptics } from '../lib/design/haptics';
import { MatchMomentsView } from './MatchMomentsView';
import { useMatchAnalytics } from './analytics/MatchAnalyticsContext';
import { buildPlayerStats, totalShots } from './analytics/aggregate';
import type { PlayerStats } from './analytics/playerStats';
import { Screen, Text, Card, Button, EmptyState, SkeletonTable } from './ui';

const normalizeForCompare = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const LOCATION_FILTERS = ['all', 'Domicile', 'Extérieur'] as const;
const COMPETITION_FILTERS = ['all', 'Championnat', 'Coupe', 'Amical'] as const;

const MIN_TABLE_WIDTH = 546;
const COL_FLEX_NAME = 3;
const COL_FLEX_TIME = 1.2;
const COL_FLEX_STAT = 1;

/** Clé de tri : un champ de `PlayerStats`, ou le total de tirs qui se dérive. */
type SortKey =
  | 'playerName'
  | 'totalTimeSeconds'
  | 'goals'
  | 'plusMinusGoals'
  | 'shot_on_target'
  | 'totalShots'
  | 'plusMinusShots'
  | 'recovery'
  | 'ball_loss'
  | 'assist';

/**
 * Colonnes du tableau. `long` n'est jamais affiché : il sert à l'annonce
 * VoiceOver, pour qu'un lecteur d'écran ne bute pas sur « PdB ».
 */
const STATS_COLUMNS: { key: SortKey; label: string; long: string; flex: number }[] = [
  { key: 'playerName',       label: 'Joueur', long: 'Joueur',            flex: COL_FLEX_NAME },
  { key: 'totalTimeSeconds', label: 'Temps',  long: 'Temps de jeu',      flex: COL_FLEX_TIME },
  { key: 'goals',            label: 'B',      long: 'Buts',              flex: COL_FLEX_STAT },
  { key: 'plusMinusGoals',   label: '+/-B',   long: 'Plus-minus buts',   flex: COL_FLEX_STAT },
  { key: 'shot_on_target',   label: 'TC',     long: 'Tirs cadrés',       flex: COL_FLEX_STAT },
  { key: 'totalShots',       label: 'TT',     long: 'Tirs totaux',       flex: COL_FLEX_STAT },
  { key: 'plusMinusShots',   label: '+/-T',   long: 'Plus-minus tirs',   flex: COL_FLEX_STAT },
  { key: 'recovery',         label: 'R',      long: 'Récupérations',     flex: COL_FLEX_STAT },
  { key: 'ball_loss',        label: 'PdB',    long: 'Pertes de balle',   flex: COL_FLEX_STAT },
  { key: 'assist',           label: 'Pdec',   long: 'Passes décisives',  flex: COL_FLEX_STAT },
];

function sortValue(row: PlayerStats, key: SortKey): number {
  return key === 'totalShots' ? totalShots(row) : (row[key] as number);
}

function formatPlayingTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export type TrackerAnalyticsViewProps = {
  title: string;
  showRecordButton?: boolean;
  showMatchList?: boolean;
};

export function TrackerAnalyticsView({
  title,
  showRecordButton = true,
  showMatchList = true,
}: TrackerAnalyticsViewProps) {
  const router = useRouter();
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, activeTeam } = useActiveTeam();
  const { matches, eventsByMatch, clubPlayers, clubPlayerIds, loading, refreshing, refresh } =
    useMatchAnalytics();

  const [sortBy, setSortBy] = useState<SortKey>('playerName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterCompetition, setFilterCompetition] = useState<string>('all');
  const [analyticsView, setAnalyticsView] = useState<'stats' | 'moments'>('stats');
  const [tableWidth, setTableWidth] = useState<number>(0);

  const filteredMatchIds = useMemo(() => {
    const ids = new Set<string>();
    matches.forEach((m) => {
      const locOk =
        filterLocation === 'all' ||
        normalizeForCompare(m.location || '') === normalizeForCompare(filterLocation);
      const compOk =
        filterCompetition === 'all' ||
        normalizeForCompare(m.competition || '') === normalizeForCompare(filterCompetition);
      if (locOk && compOk) ids.add(m.id);
    });
    return ids;
  }, [matches, filterLocation, filterCompetition]);

  const playerStatsList = useMemo(
    () =>
      buildPlayerStats({
        eventsByMatch,
        matches,
        filteredMatchIds,
        players: clubPlayers,
        clubPlayerIds,
      }),
    [eventsByMatch, matches, filteredMatchIds, clubPlayers, clubPlayerIds]
  );

  const sortedPlayerStatsList = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...playerStatsList].sort((a, b) =>
      sortBy === 'playerName'
        ? dir * a.playerName.localeCompare(b.playerName)
        : dir * (sortValue(a, sortBy) - sortValue(b, sortBy))
    );
  }, [playerStatsList, sortBy, sortDir]);

  const handleSort = useCallback((key: SortKey) => {
    haptics.select();
    setSortBy((prev) => {
      setSortDir((prevDir) => (prev === key ? (prevDir === 'asc' ? 'desc' : 'asc') : 'desc'));
      return key;
    });
  }, []);

  const matchesWithEventCount = useMemo(
    () => matches.map((m) => ({ ...m, eventCount: (eventsByMatch[m.id] ?? []).length })),
    [matches, eventsByMatch]
  );

  // ── États non nominaux ────────────────────────────────────────────────────

  if (!activeTeamId || !activeTeam) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="bar-chart-outline"
          title="Aucune équipe sélectionnée"
          description="Choisissez une équipe pour accéder aux statistiques."
        />
      </Screen>
    );
  }

  if (loading && matches.length === 0) {
    return (
      <Screen>
        <SkeletonTable />
      </Screen>
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const renderFilterRow = (
    label: string,
    values: readonly string[],
    value: string,
    onChange: (v: string) => void,
    allLabel: string
  ) => (
    <View
      style={s.filtersRow}
      accessibilityRole="radiogroup"
      accessibilityLabel={`Filtrer par ${label.toLowerCase()}`}
    >
      <Text variant="callout" tone="secondary">
        {label}
      </Text>
      <View style={s.filterChips}>
        {values.map((v) => {
          const active = value === v;
          const chipLabel = v === 'all' ? allLabel : v;
          return (
            <Pressable
              key={v}
              onPress={() => {
                haptics.select();
                onChange(v);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, checked: active }}
              accessibilityLabel={chipLabel}
              style={({ pressed }) => [
                s.filterChip,
                {
                  backgroundColor: active ? c.accent.fill : c.bg.sunken,
                  borderColor: active ? c.accent.fill : c.border.subtle,
                },
                pressed && s.pressed,
              ]}
            >
              <Text variant="caption" tone={active ? 'onFill' : 'secondary'} weight="600">
                {chipLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Text variant="title">{title}</Text>
      <Text variant="callout" tone="secondary" style={s.subtitle}>
        {activeTeam.name}
      </Text>

      {showRecordButton && (
        <Button
          label="Enregistrer un match"
          icon="videocam"
          onPress={() => router.push('/(tabs)/tracker/record')}
          block
          style={s.recordBtn}
        />
      )}

      {showMatchList && (
        <>
          <Text variant="title" style={s.sectionTitle}>
            Matchs suivis
          </Text>
          {matchesWithEventCount.length === 0 ? (
            <EmptyState
              icon="videocam-outline"
              title="Aucun match"
              description="Créez un match dans le Calendrier pour pouvoir le suivre en direct."
              compact
            />
          ) : (
            <View style={s.matchList}>
              {matchesWithEventCount.slice(0, 15).map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => router.push(`/(tabs)/tracker/record?matchId=${m.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.title || m.opponent_team || 'Match'}, ${m.score_team} à ${m.score_opponent}`}
                  style={({ pressed }) => [pressed && s.pressed]}
                >
                  <Card style={s.matchCard}>
                    <View style={s.flex}>
                      <Text variant="headline" numberOfLines={1}>
                        {m.title || m.opponent_team || 'Match'}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {m.competition} · {m.eventCount} événement{m.eventCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Text variant="headline" tone="accent" numeric style={s.matchScore}>
                      {m.score_team} - {m.score_opponent}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color={c.text.tertiary} />
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      {matches.length > 0 && (
        <>
          <View style={[s.viewTabs, { backgroundColor: c.bg.sunken }]} accessibilityRole="tablist">
            {(
              [
                { key: 'stats', label: 'Stats joueurs' },
                { key: 'moments', label: 'Moments du match' },
              ] as const
            ).map((tab) => {
              const active = analyticsView === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    if (active) return;
                    haptics.select();
                    setAnalyticsView(tab.key);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tab.label}
                  style={[
                    s.viewTab,
                    active && { backgroundColor: c.bg.surface, borderColor: c.border.subtle },
                  ]}
                >
                  <Text
                    variant="callout"
                    weight="600"
                    tone={active ? 'primary' : 'secondary'}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {renderFilterRow('Lieu', LOCATION_FILTERS, filterLocation, setFilterLocation, 'Tous')}
          {renderFilterRow(
            'Compétition',
            COMPETITION_FILTERS,
            filterCompetition,
            setFilterCompetition,
            'Toutes'
          )}

          {analyticsView === 'stats' ? (
            playerStatsList.length > 0 ? (
              <Card
                padding="none"
                style={s.statsCard}
                onLayout={(e) => setTableWidth(e.nativeEvent.layout.width)}
              >
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View
                    style={[
                      s.statsTableInner,
                      { width: Math.max(tableWidth || 0, MIN_TABLE_WIDTH), minWidth: MIN_TABLE_WIDTH },
                    ]}
                  >
                    <View
                      style={[
                        s.statsHeader,
                        { backgroundColor: c.bg.sunken, borderBottomColor: c.border.subtle },
                      ]}
                    >
                      {STATS_COLUMNS.map((col) => {
                        const sorted = sortBy === col.key;
                        return (
                          <Pressable
                            key={col.key}
                            onPress={() => handleSort(col.key)}
                            accessibilityRole="button"
                            accessibilityLabel={
                              sorted
                                ? `${col.long}, trié ${sortDir === 'asc' ? 'par ordre croissant' : 'par ordre décroissant'}`
                                : `${col.long}, trier`
                            }
                            style={({ pressed }) => [
                              col.key === 'playerName' ? s.headerNameCell : s.headerStatCell,
                              { flex: col.flex },
                              pressed && s.pressed,
                            ]}
                          >
                            <Text
                              variant="tableHeader"
                              tone={sorted ? 'accent' : 'secondary'}
                              style={col.key === 'playerName' ? undefined : s.center}
                            >
                              {col.label}
                            </Text>
                            <View style={s.sortIcons}>
                              <Ionicons
                                name="chevron-up"
                                size={10}
                                color={sorted && sortDir === 'asc' ? c.accent.default : c.text.tertiary}
                              />
                              <Ionicons
                                name="chevron-down"
                                size={10}
                                color={sorted && sortDir === 'desc' ? c.accent.default : c.text.tertiary}
                              />
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>

                    {sortedPlayerStatsList.map((row, i) => (
                      <View
                        key={row.playerId}
                        style={[
                          s.statsRow,
                          {
                            borderBottomColor: c.border.subtle,
                            backgroundColor: i % 2 === 1 ? c.bg.stripe : 'transparent',
                          },
                        ]}
                      >
                        <View style={[s.nameCell, { flex: COL_FLEX_NAME }]}>
                          <Text variant="tableCell" numberOfLines={1} ellipsizeMode="tail">
                            {row.playerName}
                          </Text>
                        </View>
                        <Cell flex={COL_FLEX_TIME}>{formatPlayingTime(row.totalTimeSeconds)}</Cell>
                        <Cell flex={COL_FLEX_STAT}>{row.goals}</Cell>
                        <Cell flex={COL_FLEX_STAT} color={deltaColor(theme, row.plusMinusGoals)}>
                          {row.plusMinusGoals}
                        </Cell>
                        <Cell flex={COL_FLEX_STAT}>{row.shot_on_target}</Cell>
                        <Cell flex={COL_FLEX_STAT}>{totalShots(row)}</Cell>
                        <Cell flex={COL_FLEX_STAT} color={deltaColor(theme, row.plusMinusShots)}>
                          {row.plusMinusShots}
                        </Cell>
                        <Cell flex={COL_FLEX_STAT}>{row.recovery}</Cell>
                        <Cell flex={COL_FLEX_STAT}>{row.ball_loss}</Cell>
                        <Cell flex={COL_FLEX_STAT}>{row.assist}</Cell>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </Card>
            ) : (
              <EmptyState
                icon="stats-chart-outline"
                title={
                  filteredMatchIds.size === 0
                    ? 'Aucun match ne correspond aux filtres'
                    : 'Aucun match enregistré au recorder'
                }
                description={
                  filteredMatchIds.size === 0
                    ? 'Élargissez le filtre de lieu ou de compétition.'
                    : 'Suivez un match en direct pour voir apparaître les statistiques joueur.'
                }
                compact
              />
            )
          ) : (
            <MatchMomentsView
              matches={matches}
              eventsByMatch={eventsByMatch}
              filteredMatchIds={filteredMatchIds}
            />
          )}

          {playerStatsList.length > 0 && analyticsView === 'stats' && (
            <Text variant="caption" tone="tertiary" style={s.legend}>
              B = buts · +/-B = plus-minus buts · TC = tirs cadrés · TT = tirs totaux ·
              +/-T = plus-minus tirs · R = récupérations · PdB = pertes de balle ·
              Pdec = passes décisives · Temps = temps de jeu cumulé
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}

/** Cellule numérique. `color` n'est passé que pour les valeurs signées. */
function Cell({
  flex,
  color,
  children,
}: {
  flex: number;
  color?: string;
  children: React.ReactNode;
}) {
  const s = useStyles();
  return (
    <Text
      variant="tableCell"
      tone="secondary"
      color={color}
      numeric
      style={[s.center, { flex }]}
    >
      {children}
    </Text>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.7 },

  subtitle: { marginTop: 2, marginBottom: t.space.xl },
  recordBtn: { marginBottom: t.space.xxl },
  sectionTitle: { marginBottom: t.space.md },

  matchList: { gap: t.space.sm, marginBottom: t.space.xxl },
  matchCard: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  matchScore: { marginRight: t.space.sm },

  viewTabs: {
    flexDirection: 'row',
    marginBottom: t.space.md,
    borderRadius: t.radius.md,
    padding: t.space.xs,
    gap: t.space.xs,
  },
  viewTab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },

  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: t.space.sm,
    flexWrap: 'wrap',
    gap: t.space.sm,
  },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.pill,
    borderWidth: 1,
  },

  statsCard: { overflow: 'hidden' },
  statsTableInner: { flexDirection: 'column', alignSelf: 'stretch' },
  statsHeader: {
    flexDirection: 'row',
    paddingHorizontal: t.space.md,
    borderBottomWidth: 1,
  },
  headerNameCell: {
    minHeight: 44,
    paddingHorizontal: t.space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerStatCell: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  sortIcons: { flexDirection: 'row' },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.md,
    borderBottomWidth: 1,
  },
  nameCell: { paddingHorizontal: t.space.sm, justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },

  legend: { marginTop: t.space.sm },
}));
