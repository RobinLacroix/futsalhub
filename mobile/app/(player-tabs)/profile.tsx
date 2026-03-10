import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useAppRole } from '../../contexts/AppRoleContext';
import { getPlayerStats } from '../../lib/services/players';
import { getMyPlayerTeamIds } from '../../lib/services/playerConvocations';

export default function PlayerProfileScreen() {
  const { player } = useAppRole();
  const [stats, setStats] = useState<{
    matches_played: number;
    goals: number;
    training_attendance: number;
    attendance_percentage: number;
    victories: number;
    draws: number;
    defeats: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!player?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const teamIds = await getMyPlayerTeamIds();
        const tid = teamIds[0];
        if (!cancelled && tid) {
          const s = await getPlayerStats(player.id, tid);
          if (!cancelled) setStats(s);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [player?.id]);

  if (!player) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Profil joueur non disponible</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.header}>
          {player.number != null ? (
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>{player.number}</Text>
            </View>
          ) : null}
          <View style={styles.nameBlock}>
            <Text style={styles.name}>
              {player.first_name} {player.last_name}
            </Text>
            <Text style={styles.meta}>
              {player.position} · Pied {player.strong_foot}
            </Text>
            {player.age ? (
              <Text style={styles.meta}>{player.age} ans</Text>
            ) : null}
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color="#16a34a" style={styles.loader} />
      ) : stats ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Statistiques</Text>
          <View style={styles.statsGrid}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{stats.matches_played}</Text>
              <Text style={styles.statLabel}>Matchs</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{stats.goals}</Text>
              <Text style={styles.statLabel}>Buts</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{stats.training_attendance}</Text>
              <Text style={styles.statLabel}>Présences</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{stats.attendance_percentage} %</Text>
              <Text style={styles.statLabel}>Assiduité</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, styles.victory]}>{stats.victories}</Text>
              <Text style={styles.statLabel}>Victoires</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, styles.draw]}>{stats.draws}</Text>
              <Text style={styles.statLabel}>Nuls</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, styles.defeat]}>{stats.defeats}</Text>
              <Text style={styles.statLabel}>Défaites</Text>
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#6b7280' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  numberBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  numberText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  nameBlock: { flex: 1 },
  name: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 4 },
  meta: { fontSize: 14, color: '#6b7280', marginBottom: 2 },
  loader: { marginVertical: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111', marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  stat: { minWidth: 80, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: '#111' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  victory: { color: '#16a34a' },
  draw: { color: '#ca8a04' },
  defeat: { color: '#dc2626' },
});
