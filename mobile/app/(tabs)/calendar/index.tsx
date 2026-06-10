import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useIsTablet } from '../../../hooks/useIsTablet';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  parseISO,
  isToday as fnsIsToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isSameMonth,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { deleteTraining } from '../../../lib/services/trainings';
import { deleteMatch } from '../../../lib/services/matches';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Training, Match } from '../../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalendarEvent =
  | { type: 'training'; id: string; date: string; data: Training }
  | { type: 'match';    id: string; date: string; data: Match    };

type ListItem =
  | { kind: 'header'; dateKey: string; label: string; isToday: boolean; isPast: boolean }
  | { kind: 'event';  dateKey: string; event: CalendarEvent }
  | { kind: 'empty';  dateKey: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TODAY_KEY = new Date().toISOString().slice(0, 10);

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function hasTime(iso: string): boolean {
  return iso.length > 10 && iso.includes('T');
}

function buildListItems(
  allEvents: CalendarEvent[],
  selectedDay: string | null,
): ListItem[] {
  const sorted = [...allEvents].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const toShow = selectedDay
    ? sorted.filter(e => toDateKey(e.date) === selectedDay)
    : sorted;

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
    const rawLabel = isT
      ? `Aujourd'hui · ${format(d, 'd MMMM', { locale: fr })}`
      : format(d, 'EEEE d MMMM', { locale: fr });
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    items.push({ kind: 'header', dateKey: k, label, isToday: isT, isPast: k < TODAY_KEY });
    if (evs.length === 0) {
      items.push({ kind: 'empty', dateKey: k });
    } else {
      evs.forEach(ev => items.push({ kind: 'event', dateKey: k, event: ev }));
    }
  }
  return items;
}

function buildMonthGrid(month: Date): (Date | null)[][] {
  const first    = startOfMonth(month);
  const last     = endOfMonth(month);
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const gridEnd   = endOfWeek(last,   { weekStartsOn: 1 });
  const days      = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7).map(d => (isSameMonth(d, month) ? d : null)));
  }
  return weeks;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const router   = useRouter();
  const isTablet = useIsTablet();
  const {
    activeTeamId,
    calendarTrainings: trainings,
    calendarMatches:   matches,
    calendarLoading:   loading,
    refetchCalendar,
  } = useActiveTeam();

  const [refreshing,      setRefreshing]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [currentMonth,    setCurrentMonth]    = useState(() => startOfMonth(new Date()));
  const [selectedDay,     setSelectedDay]     = useState<string | null>(null);
  const [addMenuVisible,  setAddMenuVisible]  = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // ── Refetch au retour sur l'écran (ex: après modification d'un événement) ──
  useFocusEffect(
    useCallback(() => {
      refetchCalendar();
    }, [refetchCalendar])
  );

  // ── Data ──────────────────────────────────────────────────────────────────

  const allEvents = useMemo((): CalendarEvent[] => {
    const list: CalendarEvent[] = [];
    (trainings ?? []).forEach(t => {
      const d = typeof t.date === 'string' ? t.date : (t.date as Date).toISOString?.() ?? '';
      list.push({ type: 'training', id: t.id, date: d, data: t });
    });
    (matches ?? []).forEach(m => {
      const d = typeof m.date === 'string' ? m.date : (m.date as Date).toISOString?.() ?? '';
      list.push({ type: 'match', id: m.id, date: d, data: m });
    });
    return list;
  }, [trainings, matches]);

  // Map dateKey → {hasTraining, hasMatch} for calendar dots
  const eventsByDate = useMemo(() => {
    const map: Record<string, { training: boolean; match: boolean }> = {};
    for (const ev of allEvents) {
      const k = toDateKey(ev.date);
      if (!map[k]) map[k] = { training: false, match: false };
      if (ev.type === 'training') map[k].training = true;
      else                        map[k].match    = true;
    }
    return map;
  }, [allEvents]);

  const listItems = useMemo(
    () => buildListItems(allEvents, selectedDay),
    [allEvents, selectedDay]
  );

  const monthGrid = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  // Ordre décroissant : les événements récents/futurs sont en haut — pas besoin d'auto-scroll.

  // ── Handlers ───────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try   { await refetchCalendar(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally   { setRefreshing(false); }
  }, [refetchCalendar]);

  const handleDayPress = useCallback((dk: string) => {
    setSelectedDay(prev => prev === dk ? null : dk);
  }, []);

  const clearFilter = useCallback(() => setSelectedDay(null), []);

  const goToToday = useCallback(() => {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDay(null);
    didScrollRef.current = false; // triggers auto-scroll again
  }, []);

  const handleDelete = useCallback(
    (ev: CalendarEvent, close: () => void) => {
      const label = ev.type === 'training' ? "l'entraînement" : 'le match';
      Alert.alert('Supprimer', `Supprimer ${label} ?`, [
        { text: 'Annuler', style: 'cancel', onPress: close },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              if (ev.type === 'training') await deleteTraining(ev.id);
              else                        await deleteMatch(ev.id);
              close();
              await refetchCalendar();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur');
            }
          },
        },
      ]);
    },
    [refetchCalendar]
  );

  // ── No team ────────────────────────────────────────────────────────────

  if (!activeTeamId) {
    return (
      <View style={s.centered}>
        <Ionicons name="calendar-outline" size={40} color="#cbd5e1" />
        <Text style={s.emptyText}>Choisissez une équipe dans l'onglet Accueil</Text>
      </View>
    );
  }

  // ─── Calendar panel ─────────────────────────────────────────────────────

  const calendarPanel = (
    <View style={[s.calPanel, isTablet && s.calPanelTablet]}>

      {/* Month nav */}
      <View style={s.monthNav}>
        <TouchableOpacity style={s.navBtn} onPress={() => { setCurrentMonth(m => subMonths(m, 1)); setSelectedDay(null); }} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color="#1e3a5f" />
        </TouchableOpacity>

        <TouchableOpacity style={s.monthLabelBtn} onPress={goToToday} activeOpacity={0.7}>
          <Text style={s.monthLabel}>
            {format(currentMonth, 'MMMM yyyy', { locale: fr }).charAt(0).toUpperCase() +
             format(currentMonth, 'MMMM yyyy', { locale: fr }).slice(1)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.navBtn} onPress={() => { setCurrentMonth(m => addMonths(m, 1)); setSelectedDay(null); }} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={20} color="#1e3a5f" />
        </TouchableOpacity>

        {/* Add button — tablet only (phone gets it from Stack header) */}
        {isTablet && (
          <TouchableOpacity style={s.addBtnTablet} onPress={() => setAddMenuVisible(true)} activeOpacity={0.8}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.addBtnTabletText}>Ajouter</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Days of week header */}
      <View style={s.weekRow}>
        {['L','M','M','J','V','S','D'].map((d, i) => (
          <Text key={i} style={[s.weekLabel, i >= 5 && s.weekLabelWE]}>{d}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={s.grid}>
        {monthGrid.map((week, wi) => (
          <View key={wi} style={s.gridRow}>
            {week.map((day, di) => {
              if (!day) return <View key={di} style={s.cell} />;
              const dk        = format(day, 'yyyy-MM-dd');
              const isSelected = selectedDay === dk;
              const isToday    = fnsIsToday(day);
              const evDots     = eventsByDate[dk];
              const isWeekend  = di >= 5;
              return (
                <TouchableOpacity
                  key={di}
                  style={s.cell}
                  onPress={() => handleDayPress(dk)}
                  activeOpacity={0.65}
                >
                  <View style={[
                    s.dayCircle,
                    isToday    && s.dayCircleToday,
                    isSelected && !isToday && s.dayCircleSelected,
                    isSelected &&  isToday && s.dayCircleTodaySelected,
                  ]}>
                    <Text style={[
                      s.dayNum,
                      isWeekend  && s.dayNumWE,
                      isToday    && s.dayNumToday,
                      isSelected && s.dayNumSelected,
                    ]}>
                      {format(day, 'd')}
                    </Text>
                  </View>
                  <View style={s.dots}>
                    {evDots?.training && <View style={[s.dot, s.dotTraining]} />}
                    {evDots?.match    && <View style={[s.dot, s.dotMatch]}    />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Legend */}
      <View style={s.calLegend}>
        <View style={s.legendItem}><View style={[s.legendDot, s.dotTraining]} /><Text style={s.legendText}>Entraînement</Text></View>
        <View style={s.legendItem}><View style={[s.legendDot, s.dotMatch]}    /><Text style={s.legendText}>Match</Text></View>
      </View>
    </View>
  );

  // ─── Agenda ──────────────────────────────────────────────────────────────

  const agendaList = (
    <View style={s.agendaContainer}>

      {/* Filter banner when a day is selected */}
      {selectedDay && (
        <View style={s.filterBanner}>
          <Text style={s.filterBannerText}>
            {format(parseISO(selectedDay), 'EEEE d MMMM', { locale: fr }).charAt(0).toUpperCase() +
             format(parseISO(selectedDay), 'EEEE d MMMM', { locale: fr }).slice(1)}
          </Text>
          <TouchableOpacity onPress={clearFilter} style={s.filterClearBtn} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Ionicons name="close" size={14} color="#64748b" />
            <Text style={s.filterClearText}>Tout voir</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={listItems}
        keyExtractor={(item, i) => `${item.kind}-${item.dateKey}-${i}`}
        contentContainerStyle={[s.listContent, listItems.length === 0 && s.listEmpty]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} tintColor="#3b82f6" />
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={36} color="#e2e8f0" />
            <Text style={s.emptyStateText}>
              {selectedDay ? 'Aucun événement ce jour-là' : 'Aucun événement pour le moment'}
            </Text>
            {selectedDay && (
              <TouchableOpacity style={s.clearFilterBtn} onPress={clearFilter} activeOpacity={0.7}>
                <Text style={s.clearFilterBtnText}>Tout afficher</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <View style={[
                s.dateHeader,
                item.isToday    && s.dateHeaderToday,
                item.isPast && !item.isToday && s.dateHeaderPast,
              ]}>
                {item.isToday && <View style={s.todayPip} />}
                <Text style={[
                  s.dateHeaderText,
                  item.isToday    && s.dateHeaderTextToday,
                  item.isPast && !item.isToday && s.dateHeaderTextPast,
                ]}>
                  {item.label}
                </Text>
              </View>
            );
          }
          if (item.kind === 'empty') {
            return (
              <View style={s.emptyDay}>
                <Text style={s.emptyDayText}>Aucun événement</Text>
              </View>
            );
          }
          const ev = item.event;
          return (
            <Swipeable
              renderRightActions={(_p, _dx, swipeable) => (
                <View style={s.deleteAction}>
                  <TouchableOpacity
                    style={s.deleteBtn}
                    onPress={() => handleDelete(ev, () => swipeable.close())}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
              overshootRight={false}
            >
              <EventCard
                event={ev}
                onPress={() => {
                  if (ev.type === 'training') router.push(`/(tabs)/calendar/training/${ev.id}` as any);
                  else                        router.push(`/(tabs)/calendar/matchDetail/${ev.id}` as any);
                }}
              />
            </Swipeable>
          );
        }}
      />
    </View>
  );

  // ─── Layout ───────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      {/* Same layout for both phone and tablet: calendar on top, agenda below */}
      {calendarPanel}
      <View style={s.agendaDivider} />
      {agendaList}

      {/* Add event modal (tablet only — phone uses Stack header button) */}
      <Modal visible={addMenuVisible} transparent animationType="fade" onRequestClose={() => setAddMenuVisible(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setAddMenuVisible(false)}>
          <View style={s.menuBox}>
            <TouchableOpacity
              style={s.menuItem}
              onPress={() => { setAddMenuVisible(false); router.push('/(tabs)/calendar/new'); }}
              activeOpacity={0.7}
            >
              <View style={[s.menuIcon, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="barbell" size={16} color="#3b82f6" />
              </View>
              <Text style={s.menuItemText}>Entraînement</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity
              style={s.menuItem}
              onPress={() => { setAddMenuVisible(false); router.push('/(tabs)/calendar/new-match'); }}
              activeOpacity={0.7}
            >
              <View style={[s.menuIcon, { backgroundColor: '#fffbeb' }]}>
                <Ionicons name="football" size={16} color="#f59e0b" />
              </View>
              <Text style={s.menuItemText}>Match</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── EventCard ────────────────────────────────────────────────────────────────

function EventCard({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const isPast = toDateKey(event.date) < TODAY_KEY;

  if (event.type === 'training') {
    const t = event.data as Training;
    const timeStr = hasTime(event.date) ? format(parseISO(event.date), 'HH:mm') : null;
    return (
      <TouchableOpacity
        style={[s.card, s.cardTraining, isPast && s.cardPast]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <View style={[s.cardAccent, { backgroundColor: '#3b82f6' }]} />
        <View style={[s.cardIconBox, { backgroundColor: '#eff6ff' }]}>
          <Ionicons name="barbell" size={15} color={isPast ? '#94a3b8' : '#3b82f6'} />
        </View>
        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <Text style={[s.cardTitle, isPast && s.cardTitlePast]} numberOfLines={1}>{t.theme}</Text>
            {timeStr && <Text style={s.cardTime}>{timeStr}</Text>}
          </View>
          {t.key_principle ? (
            <Text style={s.cardSub} numberOfLines={1}>{t.key_principle}</Text>
          ) : null}
          {t.location ? (
            <Text style={s.cardLocation} numberOfLines={1}>
              📍 {t.location}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={13} color="#cbd5e1" />
      </TouchableOpacity>
    );
  }

  const m = event.data as Match;
  const timeStr   = hasTime(event.date) ? format(parseISO(event.date), 'HH:mm') : null;
  const hasScore  = m.score_team != null && m.score_opponent != null;
  const won  = hasScore && (m.score_team as number) > (m.score_opponent as number);
  const lost = hasScore && (m.score_team as number) < (m.score_opponent as number);
  const draw = hasScore && !won && !lost;

  return (
    <TouchableOpacity
      style={[s.card, s.cardMatch, isPast && s.cardPast]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[s.cardAccent, { backgroundColor: '#f59e0b' }]} />
      <View style={[s.cardIconBox, { backgroundColor: '#fffbeb' }]}>
        <Ionicons name="football" size={15} color={isPast ? '#94a3b8' : '#f59e0b'} />
      </View>
      <View style={s.cardBody}>
        <View style={s.cardTop}>
          <Text style={[s.cardTitle, isPast && s.cardTitlePast]} numberOfLines={1}>
            {(m as any).title || (m as any).opponent_team || 'Match'}
          </Text>
          {timeStr && <Text style={s.cardTime}>{timeStr}</Text>}
        </View>
        {hasScore ? (
          <View style={s.scoreRow}>
            <Text style={[
              s.scoreText,
              won  && s.scoreWon,
              lost && s.scoreLost,
              draw && s.scoreDraw,
            ]}>
              {m.score_team} – {m.score_opponent}
            </Text>
            {(m as any).competition ? (
              <Text style={s.competitionTag}>{(m as any).competition}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={s.cardSub}>{(m as any).competition || ''}</Text>
        )}
        {m.location ? (
          <Text style={s.cardLocation} numberOfLines={1}>📍 {m.location}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={13} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 15, color: '#94a3b8', textAlign: 'center' },

  // ── Calendar panel ──────────────────────────────────────────────────────
  calPanel: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  calPanelTablet: {
    paddingHorizontal: 20,
    paddingTop: 4,
    elevation: 0,
    shadowOpacity: 0,
  },

  // Month navigation
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  navBtn: { padding: 6 },
  monthLabelBtn: { flex: 1, alignItems: 'center' },
  monthLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e3a5f',
    textTransform: 'capitalize',
  },
  addBtnTablet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  addBtnTabletText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Days of week
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    paddingBottom: 4,
  },
  weekLabelWE: { color: '#cbd5e1' },

  // Grid
  grid: {},
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, height: 44, alignItems: 'center', paddingTop: 3 },

  dayCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleToday:         { backgroundColor: '#2563eb' },
  dayCircleSelected:      { backgroundColor: '#1e3a5f' },
  dayCircleTodaySelected: { backgroundColor: '#1d4ed8', borderWidth: 2, borderColor: '#93c5fd' },

  dayNum:         { fontSize: 12, fontWeight: '600', color: '#334155' },
  dayNumWE:       { color: '#94a3b8' },
  dayNumToday:    { color: '#fff', fontWeight: '800' },
  dayNumSelected: { color: '#fff', fontWeight: '800' },

  dots: {
    flexDirection: 'row',
    gap: 2,
    height: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dot:         { width: 4, height: 4, borderRadius: 2 },
  dotTraining: { backgroundColor: '#3b82f6' },
  dotMatch:    { backgroundColor: '#f59e0b' },

  // Legend
  calLegend: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    marginTop: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, color: '#94a3b8', fontWeight: '500' },

  // ── Agenda ──────────────────────────────────────────────────────────────
  agendaDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e2e8f0' },
  agendaContainer: { flex: 1 },

  // Filter banner
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dbeafe',
  },
  filterBannerText: { fontSize: 13, fontWeight: '700', color: '#2563eb', flex: 1 },
  filterClearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterClearText: { fontSize: 12, color: '#64748b', fontWeight: '600' },

  listContent: { paddingBottom: 40 },
  listEmpty:   { flex: 1 },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyStateText: { fontSize: 15, color: '#94a3b8', textAlign: 'center' },
  clearFilterBtn: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  clearFilterBtnText: { fontSize: 13, fontWeight: '700', color: '#2563eb' },

  // Date section header
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 6,
    backgroundColor: '#f8fafc',
  },
  dateHeaderToday: { backgroundColor: '#eff6ff' },
  dateHeaderPast:  { backgroundColor: '#f8fafc' },
  dateHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dateHeaderTextToday: { color: '#2563eb' },
  dateHeaderTextPast:  { color: '#94a3b8' },
  todayPip: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2563eb' },

  // Empty day
  emptyDay: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 10,
    alignItems: 'center',
  },
  emptyDayText: { fontSize: 12, color: '#cbd5e1', fontStyle: 'italic' },

  // Event cards
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTraining: {},
  cardMatch: {},
  cardPast: { opacity: 0.6 },

  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: { flex: 1, gap: 2 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardTitlePast: { color: '#64748b' },
  cardTime: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  cardSub:      { fontSize: 11, color: '#64748b' },
  cardLocation: { fontSize: 10, color: '#94a3b8', marginTop: 1 },

  // Score
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  scoreText: { fontSize: 14, fontWeight: '800', color: '#64748b' },
  scoreWon:  { color: '#16a34a' },
  scoreLost: { color: '#dc2626' },
  scoreDraw: { color: '#64748b' },
  competitionTag: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },

  // Swipe delete
  deleteAction: {
    width: 64,
    marginTop: 4,
    marginBottom: 4,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Add menu modal ───────────────────────────────────────────────────────
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: 220,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  menuIcon: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  menuItemText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#f1f5f9', marginHorizontal: 18 },
});
