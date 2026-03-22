import { useEffect, useState, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { PhoneNavMenu } from '../../../components/PhoneNavMenu';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, useNavigation } from 'expo-router';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { deleteTraining } from '../../../lib/services/trainings';
import { deleteMatch } from '../../../lib/services/matches';
import { CalendarSkeleton } from '../../../components/CalendarSkeleton';
import type { Training } from '../../../types';
import type { Match } from '../../../types';

type CalendarEvent =
  | { type: 'training'; id: string; date: string; data: Training }
  | { type: 'match'; id: string; date: string; data: Match };

export default function CalendarScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const isTablet = useIsTablet();
  const {
    activeTeamId,
    calendarTrainings: trainings,
    calendarMatches: matches,
    calendarLoading: loading,
    refetchCalendar,
  } = useActiveTeam();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addMenuVisible, setAddMenuVisible] = useState(false);

  // Recharger le calendrier uniquement quand on change d'équipe (pas au premier mount)
  const prevTeamIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      activeTeamId &&
      prevTeamIdRef.current !== null &&
      prevTeamIdRef.current !== activeTeamId
    ) {
      refetchCalendar();
    }
    prevTeamIdRef.current = activeTeamId;
  }, [activeTeamId, refetchCalendar]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refetchCalendar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
    } finally {
      setRefreshing(false);
    }
  }, [refetchCalendar]);

  const handleDeleteEvent = useCallback(
    (event: CalendarEvent, close: () => void) => {
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
                } else {
                  await deleteMatch(event.id);
                }
                close();
                await refetchCalendar();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Erreur lors de la suppression');
              }
            },
          },
        ]
      );
    },
    [refetchCalendar]
  );

  useLayoutEffect(() => {
    if (!isTablet) {
      navigation.setOptions({
        headerLeft: () => (
          <View style={styles.headerLeftRow}>
            <PhoneNavMenu />
            <TouchableOpacity
              onPress={() => setEditMode((m) => !m)}
              style={styles.headerLeftBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.headerLeftText}>{editMode ? 'Terminer' : 'Modifier'}</Text>
            </TouchableOpacity>
          </View>
        ),
      });
    }
  }, [navigation, editMode, isTablet]);

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
      <View style={styles.container}>
        {isTablet && (
          <View style={styles.tabletBar}>
            <TouchableOpacity style={styles.tabletBarBtn} activeOpacity={0.7}>
              <Text style={styles.tabletBarBtnText}>Modifier</Text>
            </TouchableOpacity>
            <Text style={styles.tabletBarTitle}>Calendrier</Text>
            <View style={styles.tabletAddBtn} />
          </View>
        )}
        <ScrollView contentContainerStyle={styles.listContent} scrollEventThrottle={16}>
          <CalendarSkeleton />
        </ScrollView>
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
      {isTablet && (
        <View style={styles.tabletBar}>
          <TouchableOpacity
            onPress={() => setEditMode((m) => !m)}
            style={styles.tabletBarBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.tabletBarBtnText}>{editMode ? 'Terminer' : 'Modifier'}</Text>
          </TouchableOpacity>
          <Text style={styles.tabletBarTitle}>Calendrier</Text>
          <TouchableOpacity
            style={styles.tabletAddBtn}
            onPress={() => setAddMenuVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.tabletAddBtnText}>+</Text>
          </TouchableOpacity>
          <Modal
            visible={addMenuVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setAddMenuVisible(false)}
          >
            <Pressable style={styles.menuOverlay} onPress={() => setAddMenuVisible(false)}>
              <View style={styles.menuBox}>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setAddMenuVisible(false);
                    router.push('/(tabs)/calendar/new');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemText}>Entraînement</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setAddMenuVisible(false);
                    router.push('/(tabs)/calendar/new-match');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemText}>Match</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>
        </View>
      )}
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
                  onPress={() =>
                    editMode
                      ? router.push(`/(tabs)/calendar/training/edit/${t.id}`)
                      : router.push(`/(tabs)/calendar/training/${t.id}`)
                  }
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
  headerLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLeftBtn: { paddingVertical: 8, paddingLeft: 4, paddingRight: 12 },
  headerLeftText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
  tabletBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  tabletBarTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  tabletBarBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  tabletBarBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tabletAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabletAddBtnText: { color: '#fff', fontSize: 22, fontWeight: '600', lineHeight: 24 },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 200,
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuItemText: { fontSize: 16, color: '#111' },
});
