import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { getMatchesByTeam } from '../lib/services/matches';
import { getEventsByMatchId } from '../lib/services/matchEvents';
import { getPlayersByTeam, getPlayersByClubWithTeams } from '../lib/services/players';
import { MatchMomentsView } from './MatchMomentsView';
import type { Match, MatchEvent, Player } from '../types';

type PlayerStatsFromEvents = {
  playerId: string;
  playerName: string;
  goals: number;
  shot_on_target: number;
  shot: number;
  ball_loss: number;
  recovery: number;
  dribble: number;
  yellow_cards: number;
  red_cards: number;
  plusMinusGoals: number;
  plusMinusShots: number;
  totalTimeSeconds: number;
};

/** Calcule le temps de jeu (en secondes) par joueur à partir des événements.
 * Entre deux événements, les joueurs de players_on_field sont sur le terrain.
 */
function computePlayingTimeByPlayer(events: MatchEvent[]): Map<string, number> {
  const byPlayer = new Map<string, number>();
  const half1 = events.filter((e) => e.half === 1).sort((a, b) => a.match_time_seconds - b.match_time_seconds);
  const half2 = events.filter((e) => e.half === 2).sort((a, b) => a.match_time_seconds - b.match_time_seconds);

  const processHalf = (evs: MatchEvent[]) => {
    if (evs.length === 0) return;
    const maxT = Math.max(...evs.map((e) => e.match_time_seconds));
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      const nextT = i + 1 < evs.length ? evs[i + 1].match_time_seconds : maxT;
      const duration = nextT - ev.match_time_seconds;
      if (duration <= 0) continue;
      const onField = ev.players_on_field;
      if (Array.isArray(onField)) {
        onField.forEach((pid) => {
          byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + duration);
        });
      }
    }
    const first = evs[0];
    if (first.match_time_seconds > 0 && Array.isArray(first.players_on_field)) {
      first.players_on_field.forEach((pid) => {
        byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + first.match_time_seconds);
      });
    }
  };
  processHalf(half1);
  processHalf(half2);
  return byPlayer;
}

function formatPlayingTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const normalizeForCompare = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const LOCATION_FILTERS = ['all', 'Domicile', 'Extérieur'] as const;
const COMPETITION_FILTERS = ['all', 'Championnat', 'Coupe', 'Amical'] as const;

const MIN_TABLE_WIDTH = 546;
const COL_FLEX_NAME = 3;
const COL_FLEX_TIME = 1.2;
const COL_FLEX_STAT = 1;

const STATS_COLUMNS: { key: string; label: string; flex: number }[] = [
  { key: 'playerName', label: 'Joueur', flex: COL_FLEX_NAME },
  { key: 'totalTimeSeconds', label: 'Temps', flex: COL_FLEX_TIME },
  { key: 'goals', label: 'B', flex: COL_FLEX_STAT },
  { key: 'plusMinusGoals', label: '+/-B', flex: COL_FLEX_STAT },
  { key: 'shot_on_target', label: 'TC', flex: COL_FLEX_STAT },
  { key: 'totalShots', label: 'TT', flex: COL_FLEX_STAT },
  { key: 'plusMinusShots', label: '+/-T', flex: COL_FLEX_STAT },
  { key: 'recovery', label: 'R', flex: COL_FLEX_STAT },
  { key: 'ball_loss', label: 'PdB', flex: COL_FLEX_STAT },
  { key: 'dribble', label: 'D', flex: COL_FLEX_STAT },
];

export type TrackerAnalyticsViewProps = {
  title: string;
  showRecordButton?: boolean;
  showMatchList?: boolean;
};

export function TrackerAnalyticsView({ title, showRecordButton = true, showMatchList = true }: TrackerAnalyticsViewProps) {
  const router = useRouter();
  const { activeTeamId, activeTeam } = useActiveTeam();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [eventsByMatch, setEventsByMatch] = useState<Record<string, MatchEvent[]>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [allClubPlayers, setAllClubPlayers] = useState<Player[]>([]);
  const [clubPlayerIds, setClubPlayerIds] = useState<Set<string>>(new Set());
  const [statsSortBy, setStatsSortBy] = useState<string>('playerName');
  const [statsSortDir, setStatsSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterCompetition, setFilterCompetition] = useState<string>('all');
  const [analyticsView, setAnalyticsView] = useState<'stats' | 'moments'>('stats');
  const [tableWidth, setTableWidth] = useState<number>(0);

  const filteredMatchIds = useMemo(() => {
    const ids = new Set<string>();
    matches.forEach((m) => {
      const matchLoc = normalizeForCompare(m.location || '');
      const matchComp = normalizeForCompare(m.competition || '');
      const locOk = filterLocation === 'all' || matchLoc === normalizeForCompare(filterLocation);
      const compOk = filterCompetition === 'all' || matchComp === normalizeForCompare(filterCompetition);
      if (locOk && compOk) ids.add(m.id);
    });
    return ids;
  }, [matches, filterLocation, filterCompetition]);

  const load = useCallback(async () => {
    if (!activeTeamId || !activeTeam?.club_id) {
      setMatches([]);
      setEventsByMatch({});
      setPlayers([]);
      setAllClubPlayers([]);
      setClubPlayerIds(new Set());
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [matchesData, playersData, clubData] = await Promise.all([
        getMatchesByTeam(activeTeamId),
        getPlayersByTeam(activeTeamId),
        getPlayersByClubWithTeams(activeTeam.club_id),
      ]);
      setMatches(matchesData);
      setPlayers(playersData);
      setAllClubPlayers(clubData.map(({ player }) => player));
      setClubPlayerIds(new Set(clubData.map(({ player }) => player.id)));

      const matchIds = matchesData.map((m) => m.id);
      const eventsMap: Record<string, MatchEvent[]> = {};
      await Promise.all(
        matchIds.map(async (matchId) => {
          const events = await getEventsByMatchId(matchId);
          eventsMap[matchId] = events;
        })
      );
      setEventsByMatch(eventsMap);
    } catch {
      setMatches([]);
      setEventsByMatch({});
      setAllClubPlayers([]);
      setClubPlayerIds(new Set());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTeamId, activeTeam?.club_id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const playerStatsList = useMemo(() => {
    const map = new Map<string, PlayerStatsFromEvents>();
    const playerById = new Map(allClubPlayers.map((p) => [p.id, p]));

    const ensurePlayer = (id: string) => {
      let cur = map.get(id);
      if (!cur) {
        cur = {
          playerId: id,
          playerName: playerById.get(id)?.first_name && playerById.get(id)?.last_name
            ? `${playerById.get(id)!.first_name} ${playerById.get(id)!.last_name}`
            : id.slice(0, 8),
          goals: 0,
          shot_on_target: 0,
          shot: 0,
          ball_loss: 0,
          recovery: 0,
          dribble: 0,
          yellow_cards: 0,
          red_cards: 0,
          plusMinusGoals: 0,
          plusMinusShots: 0,
          totalTimeSeconds: 0,
        };
        map.set(id, cur);
      }
      return cur;
    };

    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      events.forEach((ev) => {
        // Stats individuelles (player_id = auteur de l'action)
        if (ev.player_id) {
          const cur = ensurePlayer(ev.player_id);
          switch (ev.event_type) {
            case 'goal':
              cur.goals++;
              break;
            case 'shot_on_target':
              cur.shot_on_target++;
              break;
            case 'shot':
              cur.shot++;
              break;
            case 'ball_loss':
              cur.ball_loss++;
              break;
            case 'recovery':
              cur.recovery++;
              break;
            case 'dribble':
              cur.dribble++;
              break;
            case 'yellow_card':
              cur.yellow_cards++;
              break;
            case 'red_card':
              cur.red_cards++;
              break;
            default:
              break;
          }
        }
        // +/- basé sur players_on_field (tous les joueurs sur le terrain au moment de l'événement)
        const onField = ev.players_on_field;
        if (Array.isArray(onField) && onField.length > 0) {
          onField.forEach((pid) => {
            const cur = ensurePlayer(pid);
            if (ev.event_type === 'goal') cur.plusMinusGoals += 1;
            else if (ev.event_type === 'opponent_goal') cur.plusMinusGoals -= 1;
            else if (ev.event_type === 'shot' || ev.event_type === 'shot_on_target') cur.plusMinusShots += 1;
            else if (ev.event_type === 'opponent_shot' || ev.event_type === 'opponent_shot_on_target') cur.plusMinusShots -= 1;
          });
        }
      });
    });

    // Cumuler le temps de jeu par match : match.players.time_played si > 0, sinon depuis events (players_on_field)
    const parseMatchPlayersList = (m: Match) => {
      if (!m.players) return [];
      const raw = m.players;
      if (Array.isArray(raw)) return raw;
      try {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };

    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      const match = matches.find((m) => m.id === matchId);
      const matchPlayers = match ? parseMatchPlayersList(match) : [];
      const timeFromMatch = new Map(
        matchPlayers
          .filter((p: { time_played?: number }) => (p.time_played ?? 0) > 0)
          .map((p: { id: string; time_played?: number }) => [p.id, p.time_played!])
      );

      if (timeFromMatch.size > 0) {
        timeFromMatch.forEach((sec, pid) => {
          const cur = ensurePlayer(pid);
          cur.totalTimeSeconds += sec;
        });
      } else {
        const timeByPlayer = computePlayingTimeByPlayer(events);
        timeByPlayer.forEach((sec, pid) => {
          const cur = ensurePlayer(pid);
          cur.totalTimeSeconds += sec;
        });
      }
    });

    return Array.from(map.values()).filter((s) => clubPlayerIds.has(s.playerId));
  }, [eventsByMatch, matches, allClubPlayers, clubPlayerIds, filteredMatchIds]);

  const sortedPlayerStatsList = useMemo(() => {
    const list = [...playerStatsList];
    const key = statsSortBy;
    const dir = statsSortDir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (key === 'playerName') {
        return dir * a.playerName.localeCompare(b.playerName);
      }
      const valA = key === 'totalShots' ? a.shot + a.shot_on_target : (a as any)[key];
      const valB = key === 'totalShots' ? b.shot + b.shot_on_target : (b as any)[key];
      const na = typeof valA === 'number' ? valA : 0;
      const nb = typeof valB === 'number' ? valB : 0;
      return dir * (na - nb);
    });
  }, [playerStatsList, statsSortBy, statsSortDir]);

  const handleStatsSort = useCallback((colKey: string) => {
    setStatsSortBy((prev) => {
      setStatsSortDir((prevDir) => (prev === colKey ? (prevDir === 'asc' ? 'desc' : 'asc') : 'desc'));
      return colKey;
    });
  }, []);

  const matchesWithEventCount = useMemo(() => {
    return matches.map((m) => ({
      ...m,
      eventCount: (eventsByMatch[m.id] ?? []).length,
    }));
  }, [matches, eventsByMatch]);

  if (!activeTeamId || !activeTeam) {
    return (
      <View style={styles.centered}>
        <Ionicons name="bar-chart-outline" size={48} color="#94a3b8" />
        <Text style={styles.noTeamTitle}>Aucune équipe sélectionnée</Text>
        <Text style={styles.noTeamText}>
          Choisissez une équipe pour accéder aux statistiques.
        </Text>
      </View>
    );
  }

  if (loading && matches.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />
      }
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{activeTeam.name}</Text>

      {showRecordButton && (
        <TouchableOpacity
          style={styles.recordBtn}
          onPress={() => router.push('/(tabs)/tracker/record')}
        >
          <Ionicons name="videocam" size={24} color="#fff" />
          <Text style={styles.recordBtnText}>Enregistrer un match</Text>
        </TouchableOpacity>
      )}

      {showMatchList && (
        <>
          <Text style={styles.sectionTitle}>Matchs suivis</Text>
          {matchesWithEventCount.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Aucun match. Créez un match dans le Calendrier.</Text>
            </View>
          ) : (
            <View style={styles.matchList}>
              {matchesWithEventCount.slice(0, 15).map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.matchCard}
                  onPress={() => router.push(`/(tabs)/tracker/record?matchId=${m.id}`)}
                >
                  <View style={styles.matchMain}>
                    <Text style={styles.matchTitle} numberOfLines={1}>
                      {m.title || m.opponent_team || 'Match'}
                    </Text>
                    <Text style={styles.matchMeta}>
                      {m.competition} · {m.eventCount} événement{m.eventCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={styles.matchScore}>
                    {m.score_team} - {m.score_opponent}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {matches.length > 0 && (
        <>
          <View style={styles.viewTabs}>
            <TouchableOpacity
              style={[styles.viewTab, analyticsView === 'stats' && styles.viewTabActive]}
              onPress={() => setAnalyticsView('stats')}
            >
              <Text style={[styles.viewTabText, analyticsView === 'stats' && styles.viewTabTextActive]}>
                Stats joueurs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewTab, analyticsView === 'moments' && styles.viewTabActive]}
              onPress={() => setAnalyticsView('moments')}
            >
              <Text style={[styles.viewTabText, analyticsView === 'moments' && styles.viewTabTextActive]}>
                Moments du match
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.filtersRow}>
            <Text style={styles.filterLabel}>Lieu :</Text>
            <View style={styles.filterChips}>
              {LOCATION_FILTERS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.filterChip, filterLocation === v && styles.filterChipActive]}
                  onPress={() => setFilterLocation(v)}
                >
                  <Text style={[styles.filterChipText, filterLocation === v && styles.filterChipTextActive]}>
                    {v === 'all' ? 'Tous' : v}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.filtersRow}>
            <Text style={styles.filterLabel}>Compétition :</Text>
            <View style={styles.filterChips}>
              {COMPETITION_FILTERS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.filterChip, filterCompetition === v && styles.filterChipActive]}
                  onPress={() => setFilterCompetition(v)}
                >
                  <Text style={[styles.filterChipText, filterCompetition === v && styles.filterChipTextActive]}>
                    {v === 'all' ? 'Toutes' : v}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {analyticsView === 'stats' ? (
          playerStatsList.length > 0 ? (
          <View
            style={styles.statsCard}
            onLayout={(e) => setTableWidth(e.nativeEvent.layout.width)}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={styles.statsTableScrollContent}
              style={styles.statsTableScroll}
            >
            <View style={[
              styles.statsTableInner,
              { width: Math.max(tableWidth || 0, MIN_TABLE_WIDTH), minWidth: MIN_TABLE_WIDTH },
            ]}>
            <View style={styles.statsHeader}>
              {STATS_COLUMNS.map((col) => (
                <TouchableOpacity
                  key={col.key}
                  style={[col.key === 'playerName' ? styles.statsHeaderNameTouch : styles.statsHeaderCellTouch, { flex: col.flex }]}
                  onPress={() => handleStatsSort(col.key)}
                  activeOpacity={0.7}
                >
                  <Text style={col.key === 'playerName' ? styles.statsHeaderName : styles.statsHeaderCell}>
                    {col.label}
                  </Text>
                  <View style={styles.statsSortIcons}>
                    <Ionicons
                      name="chevron-up"
                      size={10}
                      color={statsSortBy === col.key && statsSortDir === 'asc' ? '#3b82f6' : '#94a3b8'}
                    />
                    <Ionicons
                      name="chevron-down"
                      size={10}
                      color={statsSortBy === col.key && statsSortDir === 'desc' ? '#3b82f6' : '#94a3b8'}
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {sortedPlayerStatsList.map((s) => (
              <View key={s.playerId} style={styles.statsRow}>
                <View style={[styles.statsNameCell, { flex: COL_FLEX_NAME }]}>
                  <Text style={styles.statsName} numberOfLines={1} ellipsizeMode="tail">{s.playerName}</Text>
                </View>
                <Text style={[styles.statsCell, { flex: COL_FLEX_TIME }]}>{formatPlayingTime(s.totalTimeSeconds)}</Text>
                <Text style={[styles.statsCell, { flex: COL_FLEX_STAT }]}>{s.goals}</Text>
                <Text style={[styles.statsCell, { flex: COL_FLEX_STAT }, s.plusMinusGoals < 0 && styles.statsCellNeg, s.plusMinusGoals > 0 && styles.statsCellPos]}>{s.plusMinusGoals}</Text>
                <Text style={[styles.statsCell, { flex: COL_FLEX_STAT }]}>{s.shot_on_target}</Text>
                <Text style={[styles.statsCell, { flex: COL_FLEX_STAT }]}>{s.shot + s.shot_on_target}</Text>
                <Text style={[styles.statsCell, { flex: COL_FLEX_STAT }, s.plusMinusShots < 0 && styles.statsCellNeg, s.plusMinusShots > 0 && styles.statsCellPos]}>{s.plusMinusShots}</Text>
                <Text style={[styles.statsCell, { flex: COL_FLEX_STAT }]}>{s.recovery}</Text>
                <Text style={[styles.statsCell, { flex: COL_FLEX_STAT }]}>{s.ball_loss}</Text>
                <Text style={[styles.statsCell, { flex: COL_FLEX_STAT }]}>{s.dribble}</Text>
              </View>
            ))}
            </View>
            </ScrollView>
          </View>
          ) : (
            <Text style={styles.filterEmpty}>
              {filteredMatchIds.size === 0
                ? 'Aucun match ne correspond aux filtres sélectionnés.'
                : 'Aucun match enregistré avec le match recorder.'}
            </Text>
          )
          ) : (
            <MatchMomentsView
              matches={matches}
              eventsByMatch={eventsByMatch}
              filteredMatchIds={filteredMatchIds}
            />
          )}
          {playerStatsList.length > 0 && (
            <Text style={styles.legend}>B = Buts, +/-B = +/- buts, TC = Tirs cadrés, TT = Tirs totaux, +/-T = +/- tirs, R = Récupérations, PdB = Pertes de balle, D = Dribbles, Temps = temps de jeu cumulé</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noTeamTitle: { fontSize: 18, fontWeight: '600', color: '#334155', marginTop: 12 },
  noTeamText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 20 },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  recordBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  viewTabs: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 4,
  },
  viewTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  viewTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  viewTabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  viewTabTextActive: { color: '#1e293b' },
  filtersRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  filterLabel: { fontSize: 14, color: '#64748b', marginRight: 4 },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: '#3b82f6' },
  filterChipText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  filterEmpty: { fontSize: 14, color: '#94a3b8', fontStyle: 'italic', marginVertical: 16 },
  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#64748b' },
  matchList: { gap: 8, marginBottom: 24 },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  matchMain: { flex: 1 },
  matchTitle: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  matchMeta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  matchScore: { fontSize: 16, fontWeight: '700', color: '#3b82f6', marginRight: 8 },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  statsTableScroll: {},
  statsTableScrollContent: {},
  statsTableInner: { flexDirection: 'column', alignSelf: 'stretch' },
  statsHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statsHeaderName: { fontSize: 12, fontWeight: '700', color: '#475569' },
  statsHeaderNameTouch: { paddingVertical: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 2 },
  statsHeaderCell: { fontSize: 12, fontWeight: '700', color: '#475569', textAlign: 'center' },
  statsHeaderCellTouch: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 2 },
  statsSortIcons: { flexDirection: 'row' },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  statsNameCell: { paddingHorizontal: 8, justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  statsName: { fontSize: 14, color: '#334155' },
  statsCell: { fontSize: 14, color: '#64748b', textAlign: 'center', minWidth: 0 },
  statsCellNeg: { color: '#dc2626', fontWeight: '600' },
  statsCellPos: { color: '#16a34a', fontWeight: '600' },
  legend: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
});
