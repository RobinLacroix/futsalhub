import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getTrainingsByTeam, deleteTraining } from '../../../lib/services/trainings';
import { getMatchesByTeam, deleteMatch } from '../../../lib/services/matches';
import type { Training } from '../../../types';
import type { Match } from '../../../types';

type CalendarEvent =
  | { type: 'training'; id: string; date: string; data: Training }
  | { type: 'match'; id: string; date: string; data: Match };

export default function CalendarScreen() {
  const router = useRouter();
  const { activeTeamId } = useActiveTeam();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeTeamId) {
      setTrainings([]);
      setMatches([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [trainingsData, matchesData] = await Promise.all([
        getTrainingsByTeam(activeTeamId),
        getMatchesByTeam(activeTeamId),
      ]);
      setTrainings(trainingsData);
      setMatches(matchesData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
      setTrainings([]);
      setMatches([]);
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

  const handleDeleteEvent = useCallback((event: CalendarEvent, close: () => void) => {
    const label = event.type === 'training' ? "l'entraînement" : 'le match';
    Alert.alert(
      'Supprimer',
      `Voulez-vous vraiment supprimer ${label} ?`,
      [
        { text: 'Annuler', style: 'cancel', onPress: close },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              if (event.type === 'training') {
                await deleteTraining(event.id);
                setTrainings((prev) => prev.filter((t) => t.id !== event.id));
              } else {
                await deleteMatch(event.id);
                setMatches((prev) => prev.filter((m) => m.id !== event.id));
              }
              close();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur lors de la suppression');
            }
          },
        },
      ]
    );
  }, []);

  const events = useMemo((): CalendarEvent[] => {
    const list: CalendarEvent[] = [];
    trainings.forEach((t) => {
      const dateStr = typeof t.date === 'string' ? t.date : (t.date as Date).toISOString?.() ?? '';
      list.push({ type: 'training', id: t.id, date: dateStr, data: t });
    });
    matches.forEach((m) => {
      const dateStr = typeof m.date === 'string' ? m.date : (m.date as Date).toISOString?.() ?? '';
      list.push({ type: 'match', id: m.id, date: dateStr, data: m });
    });
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  }, [trainings, matches]);

  if (!activeTeamId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Choisissez une équipe dans l'onglet Accueil</Text>
      </View>
    );
  }

  if (loading && events.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Aucun événement</Text>
          </View>
        }
        renderItem={({ item }) => {
          const dateStr = item.date;
          const date = dateStr ? parseISO(dateStr) : new Date();
          const renderRightActions = (_progress: unknown, _dragX: unknown, swipeable: { close: () => void }) => (
            <View style={styles.deleteAction}>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteEvent(item, () => swipeable.close())}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteText}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          );

          if (item.type === 'training') {
            const t = item.data;
            return (
              <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
                <TouchableOpacity
                  style={[styles.card, styles.cardTraining]}
                  onPress={() => router.push(`/(tabs)/calendar/training/${t.id}`)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.date}>{format(date, 'EEEE d MMMM yyyy', { locale: fr })}</Text>
                  <Text style={styles.theme}>{t.theme}</Text>
                  {t.location ? <Text style={styles.location}>{t.location}</Text> : null}
                </TouchableOpacity>
              </Swipeable>
            );
          }
          const m = item.data;
          return (
            <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
              <TouchableOpacity
                style={[styles.card, styles.cardMatch]}
                onPress={() => router.push(`/(tabs)/calendar/matchDetail/${m.id}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.date}>{format(date, 'EEEE d MMMM yyyy', { locale: fr })}</Text>
                <Text style={styles.theme}>{m.title}</Text>
                <Text style={styles.location}>
                  {m.location} · {m.competition}
                  {m.score_team !== undefined && m.score_opponent !== undefined
                    ? ` · ${m.score_team} - ${m.score_opponent}`
                    : ''}
                </Text>
              </TouchableOpacity>
            </Swipeable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#6b7280' },
  errorText: { fontSize: 14, color: '#dc2626', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  cardTraining: { borderLeftColor: '#3b82f6' },
  cardMatch: { borderLeftColor: '#dc2626' },
  deleteAction: {
    width: 90,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  date: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  theme: { fontSize: 14, color: '#374151', marginBottom: 2 },
  location: { fontSize: 12, color: '#6b7280' },
});
