import { useCallback, useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ScrollView, Alert, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { useTheme } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../../contexts/ActiveSeasonContext';
import {
  getPlayersByTeam,
  deletePlayer,
  getSquadBulkStats,
  type MatchTypeFilter,
  type PlayerSquadStat,
} from '../../../lib/services/players';
import { getFeedbackPlayerIds, markPlayerFeedbackRead } from '../../../lib/services/notifications';
import { haptics } from '../../../lib/design/haptics';
import { Text, Button, ChipGroup, EmptyState, SkeletonTable, type ChipOption } from '../../../components/ui';
import { positionRank, positionStyle } from '../../../components/players/positions';
import type { Player } from '../../../types';

// ─── Modèle de tri ────────────────────────────────────────────────────────────

type SortKey = 'name' | 'position' | 'seances' | 'matches' | 'goals';
type SortDir = 'asc' | 'desc';

const FILTERS: readonly ChipOption<MatchTypeFilter>[] = [
  { value: 'all', label: 'Tous' },
  { value: 'Championnat', label: 'Championnat' },
  { value: 'Coupe', label: 'Coupe' },
  { value: 'Amical', label: 'Amical' },
];

/** Colonnes chiffrées du tableau. `label` reste court : la largeur est de 52 pt. */
const STAT_COLUMNS: { key: Extract<SortKey, 'seances' | 'matches' | 'goals'>; label: string; full: string }[] = [
  { key: 'seances', label: 'SÉA', full: 'séances' },
  { key: 'matches', label: 'MAT', full: 'matchs' },
  { key: 'goals', label: 'BUT', full: 'buts' },
];

const COL_NUM = 38;
const COL_POS = 54;
const COL_STAT = 52;
const ROW_HEIGHT = 56;

export default function SquadScreen() {
  const router = useRouter();
  const isTablet = useIsTablet();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, canEditActiveTeam } = useActiveTeam();
  const { activeSeason } = useActiveSeason();

  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<Record<string, PlayerSquadStat>>({});
  const [filter, setFilter] = useState<MatchTypeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackPlayerIds, setFeedbackPlayerIds] = useState<Set<string>>(new Set());

  // ── Chargement ────────────────────────────────────────────────────────────

  const loadPlayers = useCallback(async () => {
    if (!activeTeamId) {
      setPlayers([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const roster = await getPlayersByTeam(activeTeamId);
      // Les joueurs partis quittent l'effectif affiché mais gardent leur historique.
      setPlayers(roster.filter((p) => p.status !== 'left'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
      setPlayers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTeamId]);

  const loadStats = useCallback(async () => {
    if (!activeTeamId) return;
    setStatsLoading(true);
    try {
      setStats(await getSquadBulkStats(activeTeamId, filter, activeSeason));
    } catch {
      /* non bloquant : le tableau reste lisible sans les stats */
    } finally {
      setStatsLoading(false);
    }
  }, [activeTeamId, filter, activeSeason]);

  useEffect(() => {
    setLoading(true);
    loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useFocusEffect(
    useCallback(() => {
      getFeedbackPlayerIds().then((ids) => setFeedbackPlayerIds(new Set(ids)));
    }, [])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPlayers();
    loadStats();
  }, [loadPlayers, loadStats]);

  // ── Tri ───────────────────────────────────────────────────────────────────

  const toggleSort = (key: SortKey) => {
    haptics.select();
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Un nom se lit de A à Z, une performance du meilleur au moins bon.
      setSortDir(key === 'name' || key === 'position' ? 'asc' : 'desc');
    }
  };

  const sortedPlayers = useMemo(() => {
    const empty: PlayerSquadStat = { seances: 0, matches: 0, goals: 0 };
    return [...players].sort((a, b) => {
      const sA = stats[a.id] ?? empty;
      const sB = stats[b.id] ?? empty;
      if (sortKey === 'name') {
        const va = `${a.last_name} ${a.first_name}`;
        const vb = `${b.last_name} ${b.first_name}`;
        return sortDir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
      }
      const va =
        sortKey === 'position' ? positionRank(a.position) : sA[sortKey as keyof PlayerSquadStat];
      const vb =
        sortKey === 'position' ? positionRank(b.position) : sB[sortKey as keyof PlayerSquadStat];
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [players, stats, sortKey, sortDir]);

  const removePlayer = useCallback(
    (player: Player, close: () => void) => {
      if (!canEditActiveTeam) {
        close();
        return;
      }
      Alert.alert(
        'Retirer ce joueur ?',
        `${player.first_name} ${player.last_name} passera en « Parti » et quittera l'effectif actif.\n\n` +
          `Son historique est conservé : buts, présences et matchs restent dans les statistiques collectives. ` +
          `C'est la bonne pratique — une suppression définitive ferait perdre ces données.`,
        [
          { text: 'Annuler', style: 'cancel', onPress: close },
          {
            text: 'Marquer « Parti »',
            style: 'destructive',
            onPress: async () => {
              try {
                await deletePlayer(player.id);
                setPlayers((prev) => prev.filter((p) => p.id !== player.id));
                haptics.success();
                close();
              } catch (e) {
                haptics.error();
                setError(e instanceof Error ? e.message : 'Erreur');
              }
            },
          },
        ]
      );
    },
    [canEditActiveTeam]
  );

  // ── États non nominaux ────────────────────────────────────────────────────

  if (!activeTeamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="people-outline"
          title="Aucune équipe sélectionnée"
          description="Choisissez une équipe depuis l'accueil pour voir son effectif."
          action={{ label: "Aller à l'accueil", onPress: () => router.push('/(tabs)/') }}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="alert-circle-outline"
          tone="negative"
          title="Effectif indisponible"
          description={error}
          action={{ label: 'Réessayer', onPress: onRefresh }}
        />
      </View>
    );
  }

  // ── En-tête de colonne triable ────────────────────────────────────────────

  const sortHeader = (
    key: SortKey,
    label: string,
    fullLabel: string,
    width: number | 'flex',
    align: 'left' | 'center'
  ) => {
    const active = sortKey === key;
    return (
      <Pressable
        key={key}
        onPress={() => toggleSort(key)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Trier par ${fullLabel}${
          active ? `, actuellement ${sortDir === 'asc' ? 'croissant' : 'décroissant'}` : ''
        }`}
        hitSlop={{ top: 10, bottom: 10 }}
        style={[
          styles.headCell,
          width === 'flex' ? styles.flex : { width },
          align === 'center' ? styles.center : null,
        ]}
      >
        <Text variant="tableHeader" tone={active ? 'accent' : 'tertiary'}>
          {label}
        </Text>
        {active && (
          <Ionicons
            name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}
            size={11}
            color={c.accent.default}
          />
        )}
      </Pressable>
    );
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
      {/* Barre d'actions iPad : le Stack ne rend pas de header sur tablette,
          ces actions n'ont donc pas d'autre emplacement possible. */}
      {isTablet && (
        <View
          style={[
            styles.tabletBar,
            { backgroundColor: c.bg.surface, borderBottomColor: c.border.subtle, gap: theme.space.md },
          ]}
        >
          <Text variant="title" style={styles.flex}>
            Effectif
          </Text>
          {/* La planification de saison est une fonction des équipes, pas de
              l'effectif (arbitré le 2026-08-03). Son accès vit dans l'écran
              Équipes, et uniquement là : le raccourci qui existait ici était
              le seul point où iPhone et iPad divergeaient. */}
          {canEditActiveTeam && (
            <>
              <Button
                label="Importer"
                icon="cloud-upload-outline"
                variant="secondary"
                size="sm"
                onPress={() => router.push('/(tabs)/squad/import-players')}
              />
              <Button
                label="Joueur"
                icon="add"
                size="sm"
                onPress={() => router.push('/(tabs)/squad/new-player')}
              />
            </>
          )}
        </View>
      )}

      {/* Filtre de compétition */}
      <View
        style={[
          styles.filterBar,
          { backgroundColor: c.bg.surface, borderBottomColor: c.border.subtle },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <ChipGroup
            label="Filtrer par compétition"
            options={FILTERS}
            value={filter}
            onChange={setFilter}
          />
        </ScrollView>
        <View style={styles.countCell}>
          {statsLoading ? (
            <Ionicons name="sync" size={13} color={c.text.tertiary} />
          ) : (
            <Text variant="caption" tone="tertiary" numeric>
              {players.length}
            </Text>
          )}
        </View>
      </View>

      {/* En-tête du tableau */}
      <View
        style={[
          styles.tableHead,
          { backgroundColor: c.bg.surface, borderBottomColor: c.border.strong },
        ]}
      >
        <View style={[styles.headCell, { width: COL_NUM }, styles.center]}>
          <Text variant="tableHeader" tone="tertiary">
            N°
          </Text>
        </View>
        {sortHeader('position', 'POS', 'poste', COL_POS, 'center')}
        {sortHeader('name', 'NOM', 'nom', 'flex', 'left')}
        {STAT_COLUMNS.map((col) => sortHeader(col.key, col.label, col.full, COL_STAT, 'center'))}
      </View>

      {loading && players.length === 0 ? (
        <SkeletonTable rows={8} />
      ) : (
        <FlatList
          data={sortedPlayers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.accent.default}
              colors={[c.accent.default]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="Effectif vide"
              description={
                canEditActiveTeam
                  ? 'Ajoutez un joueur, ou importez un effectif depuis un fichier Excel.'
                  : "Cette équipe n'a pas encore de joueurs."
              }
              action={
                canEditActiveTeam
                  ? {
                      label: 'Ajouter un joueur',
                      onPress: () => router.push('/(tabs)/squad/new-player'),
                    }
                  : undefined
              }
            />
          }
          renderItem={({ item, index }) => {
            const s = stats[item.id] ?? { seances: 0, matches: 0, goals: 0 };
            const pos = positionStyle(item.position, c);
            const hasFeedback = feedbackPlayerIds.has(item.id);

            const a11y = [
              `${item.first_name} ${item.last_name}`,
              item.number != null ? `numéro ${item.number}` : undefined,
              pos.label,
              `${s.seances} séances, ${s.matches} matchs, ${s.goals} buts`,
              hasFeedback ? 'nouveau retour à lire' : undefined,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <Swipeable
                overshootRight={false}
                renderRightActions={
                  canEditActiveTeam
                    ? (_p, _d, swipeable) => (
                        <Pressable
                          onPress={() => removePlayer(item, () => swipeable.close())}
                          accessibilityRole="button"
                          accessibilityLabel={`Retirer ${item.first_name} ${item.last_name} de l'effectif`}
                          style={[styles.deleteAction, { backgroundColor: c.negative.fill }]}
                        >
                          <Ionicons name="person-remove-outline" size={18} color={c.text.onFill} />
                          <Text variant="caption" tone="onFill" weight="700">
                            Retirer
                          </Text>
                        </Pressable>
                      )
                    : undefined
                }
              >
                <Pressable
                  onPress={() => {
                    if (hasFeedback) {
                      markPlayerFeedbackRead(item.id).then(() =>
                        setFeedbackPlayerIds((prev) => {
                          const n = new Set(prev);
                          n.delete(item.id);
                          return n;
                        })
                      );
                    }
                    router.push(`/(tabs)/squad/${item.id}` as never);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      // Le zébrage vient du thème : `bg.stripe` est calibré pour
                      // rester lisible en clair comme en sombre.
                      backgroundColor: pressed
                        ? c.accent.subtle
                        : index % 2 === 0
                          ? c.bg.surface
                          : c.bg.stripe,
                      borderBottomColor: c.border.subtle,
                    },
                  ]}
                >
                  <View style={[styles.posStripe, { backgroundColor: pos.color }]} />

                  <View style={[styles.cell, { width: COL_NUM }, styles.center]}>
                    <Text variant="tableCell" tone="secondary" numeric>
                      {item.number ?? '—'}
                    </Text>
                  </View>

                  <View style={[styles.cell, { width: COL_POS }, styles.center]}>
                    <View
                      style={[
                        styles.posBadge,
                        { borderColor: pos.color, borderRadius: theme.radius.sm },
                      ]}
                    >
                      <Text variant="caption" color={pos.color} weight="700">
                        {pos.abbr}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.cell, styles.flex, styles.nameCell]}>
                    <View style={styles.nameRow}>
                      <Text variant="body" weight="700" numberOfLines={1} style={styles.flex}>
                        {item.last_name.toUpperCase()}
                      </Text>
                      {hasFeedback && (
                        <View style={[styles.dot, { backgroundColor: c.negative.default }]} />
                      )}
                    </View>
                    <Text variant="caption" tone="tertiary" numberOfLines={1}>
                      {item.first_name}
                    </Text>
                  </View>

                  {STAT_COLUMNS.map((col) => {
                    const value = s[col.key];
                    const isSorted = sortKey === col.key;
                    return (
                      <View key={col.key} style={[styles.cell, { width: COL_STAT }, styles.center]}>
                        <Text
                          variant="tableCell"
                          tone={isSorted ? 'accent' : value > 0 ? 'primary' : 'tertiary'}
                          weight={isSorted ? '700' : '500'}
                          numeric
                        >
                          {value}
                        </Text>
                      </View>
                    );
                  })}
                </Pressable>
              </Swipeable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 40, flexGrow: 1 },

  tabletBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterRow: { paddingHorizontal: 12, paddingVertical: 8 },
  countCell: { paddingHorizontal: 14, minWidth: 44, alignItems: 'flex-end' },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingLeft: 3, // largeur du filet de poste
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headCell: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  posStripe: { width: 3, alignSelf: 'stretch' },
  cell: { justifyContent: 'center' },
  nameCell: { paddingRight: 8, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  posBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },

  deleteAction: {
    width: 88,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
});
