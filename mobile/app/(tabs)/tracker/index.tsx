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
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getMatchesByTeam } from '../../../lib/services/matches';
import { getEventsByMatchId } from '../../../lib/services/matchEvents';
import { getPlayersByTeam } from '../../../lib/services/players';
import type { Match, MatchEvent, Player } from '../../../types';

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
};

export default function TrackerDashboardScreen() {
  const router = useRouter();
  const { activeTeamId, activeTeam } = useActiveTeam();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [eventsByMatch, setEventsByMatch] = useState<Record<string, MatchEvent[]>>({});
  const [players, setPlayers] = useState<Player[]>([]);

  const load = useCallback(async () => {
    if (!activeTeamId) {
      setMatches([]);
      setEventsByMatch({});
      setPlayers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [matchesData, playersData] = await Promise.all([
        getMatchesByTeam(activeTeamId),
        getPlayersByTeam(activeTeamId),
      ]);
      setMatches(matchesData);
      setPlayers(playersData);

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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTeamId]);

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
    const playerById = new Map(players.map((p) => [p.id, p]));

    Object.values(eventsByMatch).forEach((events) => {
      events.forEach((ev) => {
        if (ev.player_id) {
          const cur = map.get(ev.player_id) ?? {
            playerId: ev.player_id,
            playerName:
              playerById.get(ev.player_id)?.first_name &&
              playerById.get(ev.player_id)?.last_name
                ? `${playerById.get(ev.player_id)!.first_name} ${playerById.get(ev.player_id)!.last_name}`
                : ev.player_id.slice(0, 8),
            goals: 0,
            shot_on_target: 0,
            shot: 0,
            ball_loss: 0,
            recovery: 0,
            dribble: 0,
            yellow_cards: 0,
            red_cards: 0,
          };
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
          map.set(ev.player_id, cur);
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => a.playerName.localeCompare(b.playerName));
  }, [eventsByMatch, players]);

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
          Choisissez une équipe pour accéder au Tracker.
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
      <Text style={styles.title}>Tracker</Text>
      <Text style={styles.subtitle}>{activeTeam.name}</Text>

      <TouchableOpacity
        style={styles.recordBtn}
        onPress={() => router.push('/(tabs)/tracker/record')}
      >
        <Ionicons name="videocam" size={24} color="#fff" />
        <Text style={styles.recordBtnText}>Enregistrer un match</Text>
      </TouchableOpacity>

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

      {playerStatsList.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Stats joueurs (tracker)</Text>
          <View style={styles.statsCard}>
            <View style={styles.statsHeader}>
              <Text style={styles.statsHeaderName}>Joueur</Text>
              <Text style={styles.statsHeaderCell}>B</Text>
              <Text style={styles.statsHeaderCell}>TC</Text>
              <Text style={styles.statsHeaderCell}>R</Text>
              <Text style={styles.statsHeaderCell}>PdB</Text>
              <Text style={styles.statsHeaderCell}>D</Text>
            </View>
            {playerStatsList.map((s) => (
              <View key={s.playerId} style={styles.statsRow}>
                <Text style={styles.statsName} numberOfLines={1}>{s.playerName}</Text>
                <Text style={styles.statsCell}>{s.goals}</Text>
                <Text style={styles.statsCell}>{s.shot_on_target}</Text>
                <Text style={styles.statsCell}>{s.recovery}</Text>
                <Text style={styles.statsCell}>{s.ball_loss}</Text>
                <Text style={styles.statsCell}>{s.dribble}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.legend}>B = Buts, TC = Tirs cadrés, R = Récupérations, PdB = Pertes de balle, D = Dribbles</Text>
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
  statsHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statsHeaderName: { flex: 1, fontSize: 12, fontWeight: '700', color: '#475569' },
  statsHeaderCell: { width: 36, fontSize: 12, fontWeight: '700', color: '#475569', textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  statsName: { flex: 1, fontSize: 14, color: '#334155' },
  statsCell: { width: 36, fontSize: 14, color: '#64748b', textAlign: 'center' },
  legend: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
});
