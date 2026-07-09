import { useCallback, useState, useEffect, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../../contexts/ActiveSeasonContext';
import {
  getPlayersByTeam,
  deletePlayer,
  getSquadBulkStats,
  type MatchTypeFilter,
  type PlayerSquadStat,
} from '../../../lib/services/players';
import type { Player } from '../../../types';
import { getFeedbackPlayerIds, markPlayerFeedbackRead } from '../../../lib/services/notifications';

// ─── Types ─────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'seances' | 'matches' | 'goals';
type SortDir = 'asc' | 'desc';

// ─── Constants ─────────────────────────────────────────────────────────────

const FILTERS: { label: string; value: MatchTypeFilter }[] = [
  { label: 'Tous',         value: 'all' },
  { label: 'Championnat', value: 'Championnat' },
  { label: 'Coupe',       value: 'Coupe' },
  { label: 'Amical',      value: 'Amical' },
];

// Abréviations et couleurs FM
const POSITION_MAP: Record<string, { abbr: string; color: string; bg: string }> = {
  Gardien:   { abbr: 'GB',  color: '#d97706', bg: 'rgba(217,119,6,0.12)'   },
  Ailier:    { abbr: 'AIL', color: '#2563eb', bg: 'rgba(37,99,235,0.10)'   },
  Meneur:    { abbr: 'MEN', color: '#059669', bg: 'rgba(5,150,105,0.10)'   },
  Pivot:     { abbr: 'PIV', color: '#ea580c', bg: 'rgba(234,88,12,0.10)'   },
};

function getPosition(position?: string) {
  if (!position) return { abbr: '—', color: '#475569', bg: 'rgba(71,85,105,0.15)' };
  const key = Object.keys(POSITION_MAP).find(k =>
    position.toLowerCase().startsWith(k.toLowerCase())
  );
  return key ? POSITION_MAP[key] : { abbr: position.slice(0, 3).toUpperCase(), color: '#475569', bg: 'rgba(71,85,105,0.15)' };
}

// Couleurs thème clair
const C = {
  bg:        '#f1f5f9',
  rowEven:   '#ffffff',
  rowOdd:    '#f8fafc',
  header:    '#ffffff',
  border:    '#e2e8f0',
  accent:    '#2563eb',
  text:      '#0f172a',
  textMuted: '#64748b',
  textDim:   '#94a3b8',
};

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function SquadScreen() {
  const router   = useRouter();
  const isTablet = useIsTablet();
  const { activeTeamId } = useActiveTeam();
  const { activeSeason } = useActiveSeason();

  const [players, setPlayers]           = useState<Player[]>([]);
  const [stats, setStats]               = useState<Record<string, PlayerSquadStat>>({});
  const [filter, setFilter]             = useState<MatchTypeFilter>('all');
  const [sortKey, setSortKey]           = useState<SortKey>('name');
  const [sortDir, setSortDir]           = useState<SortDir>('asc');
  const [loading, setLoading]               = useState(true);
  const [statsLoading, setStatsLoading]     = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [feedbackPlayerIds, setFeedbackPlayerIds] = useState<Set<string>>(new Set());

  const loadPlayers = useCallback(async () => {
    if (!activeTeamId) { setPlayers([]); setLoading(false); return; }
    try {
      setError(null);
      setPlayers(await getPlayersByTeam(activeTeamId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
      setPlayers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTeamId]);

  const loadStats = useCallback(async () => {
    if (!activeTeamId) return;
    setStatsLoading(true);
    try { setStats(await getSquadBulkStats(activeTeamId, filter, activeSeason)); }
    catch { /* non-critical */ }
    finally { setStatsLoading(false); }
  }, [activeTeamId, filter, activeSeason]);

  useEffect(() => { setLoading(true); loadPlayers(); }, [loadPlayers]);
  useEffect(() => { loadStats(); }, [loadStats]);

  useFocusEffect(useCallback(() => {
    getFeedbackPlayerIds().then(ids => setFeedbackPlayerIds(new Set(ids)));
  }, []));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPlayers();
    loadStats();
  }, [loadPlayers, loadStats]);

  const handleDeletePlayer = useCallback((player: Player, close: () => void) => {
    Alert.alert(
      'Supprimer',
      `Supprimer ${player.first_name} ${player.last_name} ?`,
      [
        { text: 'Annuler', style: 'cancel', onPress: close },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              await deletePlayer(player.id);
              setPlayers(prev => prev.filter(p => p.id !== player.id));
              close();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur suppression');
            }
          },
        },
      ]
    );
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const sA = stats[a.id] ?? { seances: 0, matches: 0, goals: 0 };
      const sB = stats[b.id] ?? { seances: 0, matches: 0, goals: 0 };
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case 'seances': va = sA.seances; vb = sB.seances; break;
        case 'matches': va = sA.matches; vb = sB.matches; break;
        case 'goals':   va = sA.goals;   vb = sB.goals;   break;
        default:
          va = `${a.last_name} ${a.first_name}`;
          vb = `${b.last_name} ${b.first_name}`;
      }
      if (typeof va === 'string')
        return sortDir === 'asc' ? va.localeCompare(vb as string, 'fr') : (vb as string).localeCompare(va, 'fr');
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [players, stats, sortKey, sortDir]);

  // ── États d'erreur ──────────────────────────────────────────────────────

  if (!activeTeamId) {
    return (
      <View style={[styles.centered, { backgroundColor: C.bg }]}>
        <Text style={styles.emptyText}>Choisissez une équipe dans l'onglet Accueil</Text>
      </View>
    );
  }
  if (loading && players.length === 0) {
    return <View style={[styles.centered, { backgroundColor: C.bg }]}><ActivityIndicator size="large" color={C.accent} /></View>;
  }
  if (error) {
    return <View style={[styles.centered, { backgroundColor: C.bg }]}><Text style={styles.errorText}>{error}</Text></View>;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Barre tablette ── */}
      {isTablet && (
        <View style={styles.tabletBar}>
          <Text style={styles.tabletTitle}>Effectif</Text>
          <Text style={styles.tabletCount}>{players.length} joueurs</Text>
          <TouchableOpacity style={styles.tabletBtn} onPress={() => router.push('/(tabs)/squad/season-planning')} activeOpacity={0.8}>
            <Text style={styles.tabletBtnText}>Planification</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabletBtnPrimary} onPress={() => router.push('/(tabs)/squad/new-player')} activeOpacity={0.8}>
            <Text style={styles.tabletBtnPrimaryText}>+ Joueur</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Filtre type de match ── */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[styles.chip, filter === f.value && styles.chipActive]}
              onPress={() => setFilter(f.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.filterRight}>
          {statsLoading
            ? <ActivityIndicator size="small" color={C.accent} />
            : <Text style={styles.playerCount}>{players.length} joueurs</Text>
          }
        </View>
      </View>

      {/* ── En-tête tableau ── */}
      <View style={styles.tableHead}>
        <View style={styles.colNum}>
          <Text style={styles.headText}>N°</Text>
        </View>
        <View style={styles.colPos}>
          <Text style={styles.headText}>POS</Text>
        </View>

        <TouchableOpacity style={styles.colName} onPress={() => handleSort('name')} activeOpacity={0.7}>
          <Text style={[styles.headText, sortKey === 'name' && styles.headTextActive]}>
            NOM {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </Text>
        </TouchableOpacity>

        {(['seances', 'matches', 'goals'] as SortKey[]).map(key => (
          <TouchableOpacity key={key} style={styles.colStat} onPress={() => handleSort(key)} activeOpacity={0.7}>
            <Text style={[styles.headText, styles.headTextRight, sortKey === key && styles.headTextActive]}>
              {key === 'seances' ? 'SÉA' : key === 'matches' ? 'MAT' : 'BUT'}
              {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Liste ── */}
      <FlatList
        data={sortedPlayers}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={
          <View style={[styles.centered, { paddingVertical: 60 }]}>
            <Text style={styles.emptyText}>Aucun joueur dans cette équipe</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const s   = stats[item.id] ?? { seances: 0, matches: 0, goals: 0 };
          const pos = getPosition(item.position);
          const isEven = index % 2 === 0;

          const renderRightActions = (_p: unknown, _d: unknown, swipeable: { close: () => void }) => (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDeletePlayer(item, () => swipeable.close())}
              activeOpacity={0.8}
            >
              <Text style={styles.deleteBtnText}>Supprimer</Text>
            </TouchableOpacity>
          );

          const hasFeedbackBadge = feedbackPlayerIds.has(item.id);

          return (
            <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
              <TouchableOpacity
                style={[styles.row, { backgroundColor: isEven ? C.rowEven : C.rowOdd }]}
                onPress={() => {
                  if (hasFeedbackBadge) {
                    markPlayerFeedbackRead(item.id).then(() =>
                      setFeedbackPlayerIds(prev => { const n = new Set(prev); n.delete(item.id); return n; })
                    );
                  }
                  router.push(`/(tabs)/squad/${item.id}`);
                }}
                activeOpacity={0.6}
              >
                {/* Filet de couleur position */}
                <View style={[styles.posStripe, { backgroundColor: pos.color }]} />

                {/* Numéro */}
                <View style={styles.colNum}>
                  <Text style={styles.numText}>
                    {item.number != null ? item.number : '—'}
                  </Text>
                </View>

                {/* Badge position */}
                <View style={styles.colPos}>
                  <View style={[styles.posBadge, { backgroundColor: pos.bg }]}>
                    <Text style={[styles.posAbbr, { color: pos.color }]}>{pos.abbr}</Text>
                  </View>
                </View>

                {/* Nom */}
                <View style={styles.colName}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {item.last_name.toUpperCase()}
                    </Text>
                    {hasFeedbackBadge && <View style={styles.feedbackBadge} />}
                  </View>
                  <Text style={styles.playerFirst} numberOfLines={1}>
                    {item.first_name}
                  </Text>
                </View>

                {/* Séances */}
                <View style={styles.colStat}>
                  <Text style={[styles.statNum, sortKey === 'seances' && styles.statNumActive]}>
                    {s.seances}
                  </Text>
                </View>

                {/* Matchs */}
                <View style={styles.colStat}>
                  <Text style={[styles.statNum, sortKey === 'matches' && styles.statNumActive]}>
                    {s.matches}
                  </Text>
                </View>

                {/* Buts */}
                <View style={styles.colStat}>
                  <Text style={[
                    styles.statNum,
                    sortKey === 'goals' && styles.statNumActive,
                    s.goals > 0 && sortKey !== 'goals' && styles.statNumGoal,
                  ]}>
                    {s.goals}
                  </Text>
                </View>
              </TouchableOpacity>
            </Swipeable>
          );
        }}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const COL_NUM  = 36;
const COL_POS  = 52;
const COL_STAT = 48;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 14, color: C.textMuted, textAlign: 'center' },
  errorText: { fontSize: 13, color: '#ef4444', textAlign: 'center' },

  // Tablette
  tabletBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.header,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tabletTitle:        { fontSize: 17, fontWeight: '700', color: C.text, flex: 1 },
  tabletCount:        { fontSize: 12, color: C.textMuted },
  tabletBtn:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  tabletBtnText:      { color: C.textMuted, fontSize: 13, fontWeight: '600' },
  tabletBtnPrimary:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: C.accent },
  tabletBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Filtres
  filterBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.header,
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingRight: 12,
  },
  filterRow:   { paddingHorizontal: 12, paddingVertical: 9, gap: 6, flexDirection: 'row' },
  filterRight: { marginLeft: 'auto' },
  playerCount: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  feedbackBadge: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },

  chip: {
    paddingHorizontal: 11, paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    borderWidth: 1, borderColor: C.border,
  },
  chipActive:     { backgroundColor: C.accent, borderColor: C.accent },
  chipText:       { fontSize: 12, fontWeight: '600', color: C.textMuted },
  chipTextActive: { color: '#fff' },

  // En-tête tableau
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.header,
    paddingVertical: 7,
    paddingRight: 4,
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingLeft: 4, // posStripe width
  },
  headText:        { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  headTextRight:   { textAlign: 'center' },
  headTextActive:  { color: C.accent },

  // Colonnes partagées header + row
  colNum:  { width: COL_NUM,  alignItems: 'center' },
  colPos:  { width: COL_POS,  alignItems: 'center' },
  colName: { flex: 1,         justifyContent: 'center', paddingRight: 8 },
  colStat: { width: COL_STAT, alignItems: 'center' },

  // Ligne joueur
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },

  posStripe: { width: 3, alignSelf: 'stretch' },

  numText: { fontSize: 13, fontWeight: '600', color: C.textMuted, textAlign: 'center' },

  posBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  posAbbr:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  playerName:  { fontSize: 13, fontWeight: '700', color: C.text, letterSpacing: 0.2 },
  playerFirst: { fontSize: 11, color: C.textMuted, marginTop: 1 },

  statNum:       { fontSize: 14, fontWeight: '700', color: C.textMuted, textAlign: 'center' },
  statNumActive: { color: C.accent },
  statNumGoal:   { color: '#f59e0b' },

  // Supprimer
  deleteBtn: {
    width: 100, alignSelf: 'stretch',
    backgroundColor: '#ef4444',
    justifyContent: 'center', alignItems: 'center',
  },
  deleteBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
