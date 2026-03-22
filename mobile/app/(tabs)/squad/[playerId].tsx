import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import {
  getPlayerById,
  getPlayerStats,
  getPlayerTeams,
  addPlayerToTeam,
  removePlayerFromTeam,
  type MatchTypeFilter,
} from '../../../lib/services/players';
import { getTrainingsByTeam } from '../../../lib/services/trainings';
import type { Player, Team } from '../../../types';

type SessionStatus = 'present' | 'late' | 'absent' | 'injured' | 'not_recorded';

export default function PlayerDetailScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const { activeTeamId, teams: allTeams } = useActiveTeam();
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerTeams, setPlayerTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState<{
    matches_played: number;
    goals: number;
    training_attendance: number;
    attendance_percentage: number;
    victories: number;
    draws: number;
    defeats: number;
  } | null>(null);
  const [recentSessions, setRecentSessions] = useState<{ date: string; status: SessionStatus }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [updatingTeamId, setUpdatingTeamId] = useState<string | null>(null);
  const [matchTypeFilter, setMatchTypeFilter] = useState<MatchTypeFilter>('all');

  const loadPlayerAndTeams = useCallback(async () => {
    if (!playerId) return;
    setError(null);
    try {
      const [playerData, teamsData] = await Promise.all([
        getPlayerById(playerId),
        getPlayerTeams(playerId),
      ]);
      setPlayer(playerData ?? null);
      setPlayerTeams(teamsData ?? []);
      if (!playerData) {
        setError('Joueur introuvable');
        return;
      }
      if (activeTeamId) {
        const trainingsData = await getTrainingsByTeam(activeTeamId);
        const sorted = [...(trainingsData ?? [])].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setRecentSessions(
          sorted.slice(0, 15).map((t) => ({
            date: t.date,
            status: (t.attendance?.[playerId] ?? 'not_recorded') as SessionStatus,
          }))
        );
      } else {
        setStats(null);
        setRecentSessions([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [playerId, activeTeamId]);

  useEffect(() => {
    if (!playerId || !activeTeamId) return;
    getPlayerStats(playerId, activeTeamId, matchTypeFilter).then(setStats).catch(() => {});
  }, [playerId, activeTeamId, matchTypeFilter]);

  useEffect(() => {
    if (!playerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadPlayerAndTeams();
  }, [playerId, loadPlayerAndTeams]);

  const handleAddToTeam = useCallback(
    async (teamId: string) => {
      if (!playerId) return;
      setUpdatingTeamId(teamId);
      try {
        await addPlayerToTeam(playerId, teamId);
        const team = allTeams.find((t) => t.id === teamId);
        if (team) setPlayerTeams((prev) => [...prev, team].sort((a, b) => a.name.localeCompare(b.name)));
        setAssignModalVisible(false);
      } catch (e) {
        Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d’assigner l’équipe');
      } finally {
        setUpdatingTeamId(null);
      }
    },
    [playerId, allTeams]
  );

  const handleRemoveFromTeam = useCallback(
    (team: Team) => {
      if (!playerId) return;
      Alert.alert(
        'Retirer de l’équipe',
        `Retirer ${player?.first_name} ${player?.last_name} de l’équipe ${team.name} ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Retirer',
            style: 'destructive',
            onPress: async () => {
              setUpdatingTeamId(team.id);
              try {
                await removePlayerFromTeam(playerId, team.id);
                setPlayerTeams((prev) => prev.filter((t) => t.id !== team.id));
              } catch (e) {
                Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de retirer');
              } finally {
                setUpdatingTeamId(null);
              }
            },
          },
        ]
      );
    },
    [playerId, player]
  );

  const availableTeams = allTeams.filter((t) => !playerTeams.some((pt) => pt.id === t.id));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (error || !player) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Joueur introuvable'}</Text>
      </View>
    );
  }

  const statusLetter = (s: SessionStatus) =>
    s === 'present' ? 'P' : s === 'late' ? 'R' : s === 'absent' ? 'A' : s === 'injured' ? 'B' : '·';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          {player.number != null && (
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>{player.number}</Text>
            </View>
          )}
          <Text style={styles.playerName}>
            {player.first_name} {player.last_name}
          </Text>
          <View style={styles.badges}>
            <Text style={styles.badge}>{player.position}</Text>
            <Text style={styles.badge}>{player.status}</Text>
          </View>
        </View>
        <View style={styles.infos}>
          <Text style={styles.info}>Âge : {player.age} ans</Text>
          <Text style={styles.info}>Pied fort : {player.strong_foot}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gestion équipes</Text>
        {playerTeams.length === 0 ? (
          <Text style={styles.emptyTeams}>Ce joueur n’est dans aucune équipe.</Text>
        ) : (
          <View style={styles.teamList}>
            {playerTeams.map((t) => (
              <View key={t.id} style={styles.teamRow}>
                <View style={[styles.teamColorDot, t.color ? { backgroundColor: t.color } : undefined]} />
                <Text style={styles.teamName}>{t.name}</Text>
                <TouchableOpacity
                  style={styles.removeTeamBtn}
                  onPress={() => handleRemoveFromTeam(t)}
                  disabled={updatingTeamId !== null}
                >
                  {updatingTeamId === t.id ? (
                    <ActivityIndicator size="small" color="#dc2626" />
                  ) : (
                    <Ionicons name="close-circle-outline" size={24} color="#dc2626" />
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity
          style={styles.assignBtn}
          onPress={() => setAssignModalVisible(true)}
          disabled={allTeams.length === 0}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.assignBtnText}>Assigner à une équipe</Text>
        </TouchableOpacity>
      </View>

      {activeTeamId && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistiques</Text>
          <Text style={styles.filterLabel}>Compétition</Text>
          <View style={styles.filterRow}>
            {(['all', 'Championnat', 'Coupe', 'Amical'] as const).map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.filterChip,
                  matchTypeFilter === value && styles.filterChipActive,
                ]}
                onPress={() => setMatchTypeFilter(value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    matchTypeFilter === value && styles.filterChipTextActive,
                  ]}
                >
                  {value === 'all' ? 'Tous' : value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {stats ? (
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.matches_played}</Text>
                <Text style={styles.statLabel}>Matchs</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.goals}</Text>
                <Text style={styles.statLabel}>Buts</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.attendance_percentage}%</Text>
                <Text style={styles.statLabel}>Présence</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.victories}</Text>
                <Text style={styles.statLabel}>Victoires</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.draws}</Text>
                <Text style={styles.statLabel}>Nuls</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.defeats}</Text>
                <Text style={styles.statLabel}>Défaites</Text>
              </View>
            </View>
          ) : (
            <View style={styles.statsGrid}>
              <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 12 }} />
            </View>
          )}
        </View>
      )}

      {recentSessions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dernières séances</Text>
          <View style={styles.sessionsRow}>
            {recentSessions.map((s, i) => (
              <View
                key={i}
                style={[
                  styles.sessionDot,
                  s.status === 'present' && styles.dotPresent,
                  s.status === 'late' && styles.dotLate,
                  s.status === 'absent' && styles.dotAbsent,
                  s.status === 'injured' && styles.dotInjured,
                ]}
              >
                <Text style={styles.sessionDotText}>{statusLetter(s.status)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            <Text style={styles.legendItem}>Présent · Retard · Absent · Blessé</Text>
          </View>
        </View>
      )}

      <Modal
        visible={assignModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAssignModalVisible(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Choisir une équipe</Text>
            {availableTeams.length === 0 ? (
              <Text style={styles.modalEmpty}>Aucune autre équipe disponible.</Text>
            ) : (
              <FlatList
                data={availableTeams}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalTeamRow}
                    onPress={() => handleAddToTeam(item.id)}
                    disabled={updatingTeamId !== null}
                  >
                    <View style={[styles.teamColorDot, item.color ? { backgroundColor: item.color } : undefined]} />
                    <Text style={styles.modalTeamName}>{item.name}</Text>
                    {updatingTeamId === item.id ? (
                      <ActivityIndicator size="small" color="#3b82f6" />
                    ) : (
                      <Ionicons name="add" size={22} color="#3b82f6" />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setAssignModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 14, color: '#dc2626', marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardHeader: { alignItems: 'center', marginBottom: 12 },
  numberBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  numberText: { color: '#fff', fontWeight: '700', fontSize: 20 },
  playerName: { fontSize: 22, fontWeight: '700', color: '#111' },
  badges: { flexDirection: 'row', gap: 8, marginTop: 8 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    fontSize: 12,
  },
  infos: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12 },
  info: { fontSize: 14, color: '#374151', marginBottom: 4 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  filterLabel: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
  },
  filterChipActive: { backgroundColor: '#3b82f6' },
  filterChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statBox: {
    minWidth: '30%',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: '#111' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  sessionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  sessionDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotPresent: { backgroundColor: '#22c55e' },
  dotLate: { backgroundColor: '#ea580c' },
  dotAbsent: { backgroundColor: '#f59e0b' },
  dotInjured: { backgroundColor: '#ef4444' },
  sessionDotText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  legend: {},
  legendItem: { fontSize: 11, color: '#6b7280' },
  emptyTeams: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  teamList: { marginBottom: 12 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 6,
  },
  teamColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: '#9ca3af',
  },
  teamName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#111' },
  removeTeamBtn: { padding: 4 },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
  },
  assignBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 },
  modalEmpty: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  modalTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTeamName: { flex: 1, fontSize: 16, color: '#111' },
  modalCloseBtn: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 16, color: '#3b82f6', fontWeight: '600' },
});
