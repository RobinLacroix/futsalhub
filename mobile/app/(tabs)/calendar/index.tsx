import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Alert, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect } from 'expo-router';
import { format, parseISO, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { useTheme } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { deleteTraining } from '../../../lib/services/trainings';
import { deleteMatch } from '../../../lib/services/matches';
import { getAbsenceTrainingIds, markTrainingAbsenceRead } from '../../../lib/services/notifications';
import { haptics } from '../../../lib/design/haptics';
import { Text, EmptyState, SkeletonList, Badge } from '../../../components/ui';
import { MonthGrid, type DayEvents } from '../../../components/calendar/MonthGrid';
import { EventCard, type CalendarEvent } from '../../../components/calendar/EventCard';
import { AddEventButton } from '../../../components/calendar/AddEventButton';

// ─── Types ────────────────────────────────────────────────────────────────────

type ListItem =
  | { kind: 'header'; dateKey: string; label: string; isToday: boolean; isPast: boolean }
  | { kind: 'event'; dateKey: string; event: CalendarEvent }
  | { kind: 'empty'; dateKey: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TODAY_KEY = new Date().toISOString().slice(0, 10);

const toDateKey = (iso: string) => iso.slice(0, 10);

function buildListItems(allEvents: CalendarEvent[], selectedDay: string | null): ListItem[] {
  const sorted = [...allEvents].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const toShow = selectedDay ? sorted.filter((e) => toDateKey(e.date) === selectedDay) : sorted;

  const groups = new Map<string, CalendarEvent[]>();
  for (const e of toShow) {
    const k = toDateKey(e.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  if (selectedDay && !groups.has(selectedDay)) groups.set(selectedDay, []);

  const keys = selectedDay ? [selectedDay] : [...groups.keys()].sort().reverse();

  const items: ListItem[] = [];
  for (const k of keys) {
    const evs = groups.get(k) ?? [];
    const d = parseISO(k);
    const isT = k === TODAY_KEY;
    const raw = isT
      ? `Aujourd'hui · ${format(d, 'd MMMM', { locale: fr })}`
      : format(d, 'EEEE d MMMM', { locale: fr });
    items.push({
      kind: 'header',
      dateKey: k,
      label: raw.charAt(0).toUpperCase() + raw.slice(1),
      isToday: isT,
      isPast: k < TODAY_KEY,
    });
    if (evs.length === 0) items.push({ kind: 'empty', dateKey: k });
    else evs.forEach((ev) => items.push({ kind: 'event', dateKey: k, event: ev }));
  }
  return items;
}

// ─── Écran ────────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const router = useRouter();
  const isTablet = useIsTablet();
  const { theme } = useTheme();
  const c = theme.colors;

  const {
    activeTeamId,
    calendarTrainings: trainings,
    calendarMatches: matches,
    calendarLoading: loading,
    refetchCalendar,
  } = useActiveTeam();

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [absenceTrainingIds, setAbsenceTrainingIds] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      refetchCalendar();
      getAbsenceTrainingIds().then((ids) => setAbsenceTrainingIds(new Set(ids)));
    }, [refetchCalendar])
  );

  // ── Données ───────────────────────────────────────────────────────────────

  const allEvents = useMemo((): CalendarEvent[] => {
    const list: CalendarEvent[] = [];
    (trainings ?? []).forEach((t) => {
      const d = typeof t.date === 'string' ? t.date : (t.date as Date).toISOString?.() ?? '';
      list.push({ type: 'training', id: t.id, date: d, data: t });
    });
    (matches ?? []).forEach((m) => {
      const d = typeof m.date === 'string' ? m.date : (m.date as Date).toISOString?.() ?? '';
      list.push({ type: 'match', id: m.id, date: d, data: m });
    });
    return list;
  }, [trainings, matches]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, DayEvents> = {};
    for (const ev of allEvents) {
      const k = toDateKey(ev.date);
      if (!map[k]) map[k] = { training: false, match: false };
      if (ev.type === 'training') map[k].training = true;
      else map[k].match = true;
    }
    return map;
  }, [allEvents]);

  const listItems = useMemo(() => buildListItems(allEvents, selectedDay), [allEvents, selectedDay]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refetchCalendar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setRefreshing(false);
    }
  }, [refetchCalendar]);

  const handleDayPress = useCallback((dk: string) => {
    haptics.select();
    setSelectedDay((prev) => (prev === dk ? null : dk));
  }, []);

  const clearFilter = useCallback(() => setSelectedDay(null), []);

  const goToToday = useCallback(() => {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDay(null);
  }, []);

  // `Alert.alert` conservée volontairement : une confirmation destructive est
  // l'un des rares cas où la modale bloquante native est le bon pattern iOS.
  const handleDelete = useCallback(
    (ev: CalendarEvent, close: () => void) => {
      const label = ev.type === 'training' ? "l'entraînement" : 'le match';
      Alert.alert('Supprimer', `Supprimer ${label} ?`, [
        { text: 'Annuler', style: 'cancel', onPress: close },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              if (ev.type === 'training') await deleteTraining(ev.id);
              else await deleteMatch(ev.id);
              haptics.success();
              close();
              await refetchCalendar();
            } catch (e) {
              haptics.error();
              setError(e instanceof Error ? e.message : 'Erreur');
            }
          },
        },
      ]);
    },
    [refetchCalendar]
  );

  // ── Pas d'équipe ──────────────────────────────────────────────────────────

  if (!activeTeamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="people-outline"
          title="Aucune équipe sélectionnée"
          description="Choisissez une équipe depuis l'accueil pour voir son calendrier."
          action={{ label: 'Aller à l’accueil', onPress: () => router.push('/(tabs)/') }}
        />
      </View>
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
      {error && (
        <Pressable
          onPress={() => {
            setError(null);
            onRefresh();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${error}. Appuyer pour réessayer`}
          style={[styles.errorBanner, { backgroundColor: c.negative.fill, gap: theme.space.sm }]}
        >
          <Ionicons name="warning-outline" size={15} color={c.text.onFill} />
          <Text variant="callout" tone="onFill" style={styles.flex}>
            {error} — Appuyer pour réessayer
          </Text>
        </Pressable>
      )}

      <MonthGrid
        month={currentMonth}
        selectedDay={selectedDay}
        eventsByDate={eventsByDate}
        onSelectDay={handleDayPress}
        onChangeMonth={setCurrentMonth}
        onToday={goToToday}
        compact={isTablet}
        // Sur iPad le Stack ne rend pas de header : le bouton d'ajout doit
        // vivre ici, sinon la création d'événement est inaccessible.
        headerAction={isTablet ? <AddEventButton variant="labelled" /> : undefined}
      />

      {selectedDay && (
        <View
          style={[
            styles.filterBanner,
            { backgroundColor: c.accent.subtle, borderBottomColor: c.accent.border },
          ]}
        >
          <Text variant="callout" tone="accent" weight="600" style={styles.flex}>
            {(() => {
              const l = format(parseISO(selectedDay), 'EEEE d MMMM', { locale: fr });
              return l.charAt(0).toUpperCase() + l.slice(1);
            })()}
          </Text>
          <Pressable
            onPress={clearFilter}
            accessibilityRole="button"
            accessibilityLabel="Retirer le filtre et voir tous les événements"
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={styles.filterClear}
          >
            <Ionicons name="close-circle" size={15} color={c.accent.default} />
            <Text variant="caption" tone="accent" weight="600">
              Tout voir
            </Text>
          </Pressable>
        </View>
      )}

      {loading && allEvents.length === 0 ? (
        <SkeletonList rows={5} />
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, i) => `${item.kind}-${item.dateKey}-${i}`}
          contentContainerStyle={[
            { paddingBottom: theme.space.huge },
            listItems.length === 0 && styles.flex,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[c.accent.default]}
              tintColor={c.accent.default}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title={selectedDay ? 'Aucun événement ce jour-là' : 'Calendrier vide'}
              description={
                selectedDay
                  ? undefined
                  : `Ajoutez un entraînement ou un match avec le bouton ${
                      isTablet ? '« Ajouter »' : '+'
                    } en haut de l'écran.`
              }
              action={
                selectedDay ? { label: 'Tout afficher', onPress: clearFilter } : undefined
              }
            />
          }
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <View
                  style={[
                    styles.dateHeader,
                    {
                      backgroundColor: item.isToday ? c.accent.subtle : c.bg.canvas,
                      gap: theme.space.sm,
                      paddingHorizontal: theme.space.lg,
                    },
                  ]}
                >
                  {item.isToday && (
                    <View style={[styles.pip, { backgroundColor: c.accent.default }]} />
                  )}
                  <Text
                    variant="caption"
                    tone={item.isToday ? 'accent' : item.isPast ? 'tertiary' : 'secondary'}
                    weight="700"
                    style={styles.dateHeaderText}
                  >
                    {item.label}
                  </Text>
                </View>
              );
            }

            if (item.kind === 'empty') {
              return (
                <View style={styles.emptyDay}>
                  <Text variant="callout" tone="tertiary">
                    Aucun événement
                  </Text>
                </View>
              );
            }

            const ev = item.event;
            return (
              <Swipeable
                renderRightActions={(_p, _dx, swipeable) => (
                  <Pressable
                    onPress={() => handleDelete(ev, () => swipeable.close())}
                    accessibilityRole="button"
                    accessibilityLabel="Supprimer cet événement"
                    style={[
                      styles.deleteAction,
                      { backgroundColor: c.negative.fill, borderRadius: theme.radius.md },
                    ]}
                  >
                    <Ionicons name="trash-outline" size={19} color={c.text.onFill} />
                  </Pressable>
                )}
                overshootRight={false}
              >
                <View style={styles.cardWrap}>
                  <EventCard
                    event={ev}
                    isPast={toDateKey(ev.date) < TODAY_KEY}
                    hasAbsenceBadge={ev.type === 'training' && absenceTrainingIds.has(ev.id)}
                    onPress={() => {
                      if (ev.type === 'training') {
                        markTrainingAbsenceRead(ev.id).then(() =>
                          setAbsenceTrainingIds((prev) => {
                            const n = new Set(prev);
                            n.delete(ev.id);
                            return n;
                          })
                        );
                        router.push(`/(tabs)/calendar/training/${ev.id}` as never);
                      } else {
                        router.push(`/(tabs)/calendar/matchDetail/${ev.id}` as never);
                      }
                    }}
                  />
                </View>
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterClear: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  dateHeaderText: { textTransform: 'uppercase', letterSpacing: 0.6 },
  pip: { width: 6, height: 6, borderRadius: 3 },
  emptyDay: { paddingVertical: 14, alignItems: 'center' },
  cardWrap: { paddingHorizontal: 12, paddingVertical: 4 },
  deleteAction: {
    width: 64,
    marginVertical: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
});
