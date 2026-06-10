import { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  getMyCalendarEvents,
  getMyConvocationsStatus,
  getMyConvocationsDebug,
  setMyTrainingAttendance,
  type MyConvolutionRow,
  type MyUpcomingMatchRow,
} from '../../lib/services/playerConvocations';
import { pushToMyCoaches } from '../../lib/services/notifications';

// ─── Design tokens ─────────────────────────────────────────────────────────

const C = {
  bg:      '#edf0f5',
  surface: '#ffffff',
  surface2:'#f4f6fa',
  border:  '#dde3ec',
  navy:    '#1a2744',
  amber:   '#d97706',
  green:   '#059669',
  greenLt: '#ecfdf5',
  red:     '#dc2626',
  redLt:   '#fef2f2',
  blue:    '#1e40af',
  blueLt:  '#eff6ff',
  purple:  '#7c3aed',
  purpleLt:'#f5f3ff',
  text1:   '#0f172a',
  text2:   '#475569',
  text3:   '#94a3b8',
  divider: '#e8edf4',
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────

type Status = 'present' | 'absent' | 'late' | 'injured';

type CalendarItem =
  | { type: 'training'; data: MyConvolutionRow }
  | { type: 'match'; data: MyUpcomingMatchRow };

function sortCalendarItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => {
    const dateA = a.type === 'training' ? a.data.training_date : a.data.match_date;
    const dateB = b.type === 'training' ? b.data.training_date : b.data.match_date;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function PlayerConvocationsScreen() {
  const [convocations, setConvocations] = useState<MyConvolutionRow[]>([]);
  const [matches, setMatches]           = useState<MyUpcomingMatchRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [emptyHint, setEmptyHint]       = useState<'no_player' | 'no_team' | 'no_upcoming' | null>(null);

  const calendarItems = useMemo(
    () => sortCalendarItems([
      ...convocations.map(c => ({ type: 'training' as const, data: c })),
      ...matches.map(m => ({ type: 'match' as const, data: m })),
    ]),
    [convocations, matches]
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      setEmptyHint(null);
      const { trainings, matches: matchesData } = await getMyCalendarEvents();
      setConvocations(trainings);
      setMatches(matchesData);
      if (trainings.length === 0 && matchesData.length === 0) {
        try {
          const status = await getMyConvocationsStatus();
          if (status && status.hint !== 'ok') setEmptyHint(status.hint);
        } catch { /* diagnostic only */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
      setConvocations([]); setMatches([]);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const handleSetAttendance = useCallback(async (trainingId: string, status: Status) => {
    setUpdatingId(trainingId);
    setError(null);
    const result = await setMyTrainingAttendance(trainingId, status);
    setUpdatingId(null);
    if (result.ok) {
      setConvocations(prev => prev.map(c => c.training_id === trainingId ? { ...c, my_status: status } : c));
      if (status === 'absent' || status === 'late' || status === 'injured') {
        const label = status === 'absent' ? 'absent' : status === 'late' ? 'en retard' : 'blessé';
        void pushToMyCoaches({ title: 'Réponse à une convocation', body: `Un joueur se déclare ${label}.`, data: { type: 'absence_report', training_id: trainingId } });
      }
    } else {
      setError(result.error === 'too_late'
        ? 'Il est trop tard pour répondre (jusqu\'à 2 h avant la séance).'
        : (result.error ?? 'Erreur'));
    }
  }, []);

  const openQuestionnaire = useCallback(async (urlPathOrFull: string) => {
    const base = (process.env.EXPO_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
    const url = urlPathOrFull.startsWith('http')
      ? urlPathOrFull
      : base ? base + (urlPathOrFull.startsWith('/') ? urlPathOrFull : `/${urlPathOrFull}`) : '';
    if (!url || !url.startsWith('http')) {
      Alert.alert('Configuration', "L'URL du site (EXPO_PUBLIC_SITE_URL) n'est pas définie.");
      return;
    }
    try { await Linking.openURL(url); }
    catch { Alert.alert('Erreur', "Impossible d'ouvrir le lien."); }
  }, []);

  if (loading && calendarItems.length === 0) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={C.navy} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle-outline" size={15} color={C.red} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={s.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={calendarItems}
        keyExtractor={item =>
          item.type === 'training' ? `t-${item.data.training_id}` : `m-${item.data.match_id}`
        }
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="calendar-outline" size={36} color={C.text3} style={{ marginBottom: 12 }} />
            <Text style={s.emptyTitle}>
              {emptyHint === 'no_player'   ? 'Compte non lié à une fiche joueur'
               : emptyHint === 'no_team'   ? "Vous n'êtes dans aucune équipe"
               : 'Aucune convocation à venir'}
            </Text>
            <Text style={s.emptyText}>
              {emptyHint === 'no_player'   ? 'Demandez à votre coach de lier votre compte à votre fiche joueur.'
               : emptyHint === 'no_team'   ? 'Demandez à votre coach de vous ajouter à une équipe.'
               : 'Vos séances et matchs apparaîtront ici.'}
            </Text>
            <TouchableOpacity
              style={s.debugBtn}
              onPress={async () => {
                const d = await getMyConvocationsDebug();
                if (!d) { Alert.alert('Diagnostic', 'Impossible de récupérer le diagnostic.'); return; }
                const msg = (d.reason as string)
                  ? String(d.message || d.reason)
                  : `Joueur: ${d.player_id ? 'oui' : 'non'}\nÉquipes: ${d.team_count ?? 0}\nSéances à venir: ${d.trainings_upcoming ?? 0}`;
                Alert.alert('Diagnostic', msg);
              }}
            >
              <Text style={s.debugBtnText}>Voir le diagnostic</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'match') {
            return <MatchCard m={item.data} />;
          }
          return (
            <TrainingCard
              c={item.data}
              isUpdating={updatingId === item.data.training_id}
              onSetAttendance={handleSetAttendance}
              onOpenQuestionnaire={openQuestionnaire}
            />
          );
        }}
      />
    </View>
  );
}

// ─── MatchCard ──────────────────────────────────────────────────────────────

function MatchCard({ m }: { m: MyUpcomingMatchRow }) {
  const matchDate = m.match_date ? parseISO(m.match_date) : new Date();
  const other = !!m.is_other_team;
  return (
    <View style={[card.wrap, { borderLeftColor: other ? C.purple : C.blue }]}>
      <View style={card.topRow}>
        <View style={[card.badge, { backgroundColor: other ? C.purpleLt : C.blueLt, borderColor: other ? C.purple + '44' : C.blue + '33' }]}>
          <Ionicons name="football-outline" size={11} color={other ? C.purple : C.blue} />
          <Text style={[card.badgeText, { color: other ? C.purple : C.blue }]}>
            Match{other ? ' · autre équipe' : ''}
          </Text>
        </View>
        {m.competition ? (
          <Text style={card.competition}>{m.competition}</Text>
        ) : null}
      </View>
      <Text style={card.title}>{m.title || 'Match'}</Text>
      {m.opponent_team ? <Text style={card.opponent}>vs <Text style={{ fontWeight: '700', color: C.text1 }}>{m.opponent_team}</Text></Text> : null}
      <View style={card.metaRow}>
        <View style={card.metaItem}>
          <Ionicons name="calendar-outline" size={12} color={C.text3} />
          <Text style={card.metaText}>{format(matchDate, 'EEEE d MMMM', { locale: fr })}</Text>
        </View>
        <View style={card.metaItem}>
          <Ionicons name="time-outline" size={12} color={C.text3} />
          <Text style={card.metaText}>{format(matchDate, 'HH:mm', { locale: fr })}</Text>
        </View>
        {m.team_name ? (
          <View style={card.metaItem}>
            <Ionicons name="people-outline" size={12} color={C.text3} />
            <Text style={card.metaText}>{m.team_name}</Text>
          </View>
        ) : null}
        {m.location ? (
          <View style={card.metaItem}>
            <Ionicons name="location-outline" size={12} color={C.text3} />
            <Text style={card.metaText}>{m.location}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── TrainingCard ───────────────────────────────────────────────────────────

const ATTENDANCE_BTNS: { status: Status; label: string; color: string; bg: string; icon: 'checkmark-circle-outline' | 'time-outline' | 'close-circle-outline' | 'medkit-outline' }[] = [
  { status: 'present', label: 'Présent',   color: C.green,  bg: '#ecfdf5', icon: 'checkmark-circle-outline' },
  { status: 'late',    label: 'En retard', color: C.amber,  bg: '#fef3c7', icon: 'time-outline'             },
  { status: 'absent',  label: 'Absent',    color: C.red,    bg: '#fef2f2', icon: 'close-circle-outline'     },
  { status: 'injured', label: 'Blessé',    color: C.purple, bg: '#f5f3ff', icon: 'medkit-outline'           },
];

function TrainingCard({
  c, isUpdating, onSetAttendance, onOpenQuestionnaire,
}: {
  c: MyConvolutionRow;
  isUpdating: boolean;
  onSetAttendance: (id: string, s: Status) => void;
  onOpenQuestionnaire: (url: string) => void;
}) {
  const date   = c.training_date ? parseISO(c.training_date) : new Date();
  const status = (c.my_status as Status) || null;
  const other  = !!c.is_other_team;

  return (
    <View style={[card.wrap, { borderLeftColor: other ? C.purple : C.green }]}>
      <View style={card.topRow}>
        <View style={[card.badge, { backgroundColor: other ? C.purpleLt : C.greenLt, borderColor: other ? C.purple + '44' : C.green + '33' }]}>
          <Ionicons name="fitness-outline" size={11} color={other ? C.purple : C.green} />
          <Text style={[card.badgeText, { color: other ? C.purple : C.green }]}>
            Entraînement{other ? ' · autre équipe' : ''}
          </Text>
        </View>
      </View>

      <View style={card.metaRow}>
        <View style={card.metaItem}>
          <Ionicons name="calendar-outline" size={12} color={C.text3} />
          <Text style={card.metaText}>{format(date, 'EEEE d MMMM', { locale: fr })}</Text>
        </View>
        <View style={card.metaItem}>
          <Ionicons name="time-outline" size={12} color={C.text3} />
          <Text style={card.metaText}>{format(date, 'HH:mm', { locale: fr })}</Text>
        </View>
        {c.team_name ? (
          <View style={card.metaItem}>
            <Ionicons name="people-outline" size={12} color={C.text3} />
            <Text style={card.metaText}>{c.team_name}</Text>
          </View>
        ) : null}
        {c.location ? (
          <View style={card.metaItem}>
            <Ionicons name="location-outline" size={12} color={C.text3} />
            <Text style={card.metaText}>{c.location}</Text>
          </View>
        ) : null}
      </View>

      <View style={card.divider} />

      <Text style={card.attendLabel}>Ma présence</Text>
      <View style={card.attendRow}>
        {ATTENDANCE_BTNS.map(btn => {
          const active = status === btn.status;
          return (
            <TouchableOpacity
              key={btn.status}
              style={[card.attendBtn, active && { backgroundColor: btn.bg, borderColor: btn.color }]}
              onPress={() => onSetAttendance(c.training_id, btn.status)}
              disabled={isUpdating}
              activeOpacity={0.7}
            >
              {isUpdating && active
                ? <ActivityIndicator size="small" color={btn.color} />
                : <>
                    <Ionicons name={btn.icon} size={14} color={active ? btn.color : C.text3} />
                    <Text style={[card.attendBtnText, active && { color: btn.color, fontWeight: '700' }]}>{btn.label}</Text>
                  </>
              }
            </TouchableOpacity>
          );
        })}
      </View>

      {c.feedback_token && c.feedback_url && !other && (
        <TouchableOpacity style={card.feedbackLink} onPress={() => onOpenQuestionnaire(c.feedback_url!)} activeOpacity={0.7}>
          <Ionicons name="document-text-outline" size={14} color={C.navy} />
          <Text style={card.feedbackLinkText}>Remplir le questionnaire</Text>
          <Ionicons name="chevron-forward" size={13} color={C.navy} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const card = StyleSheet.create({
  wrap:       { backgroundColor: C.surface, borderRadius: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border, marginBottom: 10, padding: 14, gap: 10 },
  topRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  badgeText:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  competition:{ fontSize: 11, color: C.text3, fontStyle: 'italic' },
  title:      { fontSize: 16, fontWeight: '700', color: C.text1 },
  opponent:   { fontSize: 13, color: C.text2 },
  metaRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:   { fontSize: 12, color: C.text2 },
  divider:    { height: 1, backgroundColor: C.divider },
  attendLabel:{ fontSize: 10, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.8 },
  attendRow:  { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  attendBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface2 },
  attendBtnText: { fontSize: 12, fontWeight: '600', color: C.text2 },
  feedbackLink:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.divider },
  feedbackLinkText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.navy },
});

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  list:      { padding: 14, paddingBottom: 40 },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#fee2e2' },
  errorText:    { flex: 1, fontSize: 13, color: C.red },
  retryText:    { fontSize: 13, fontWeight: '700', color: C.red },
  emptyWrap:    { padding: 40, alignItems: 'center' },
  emptyTitle:   { fontSize: 15, fontWeight: '700', color: C.text1, marginBottom: 6, textAlign: 'center' },
  emptyText:    { fontSize: 13, color: C.text2, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
  debugBtn:     { paddingVertical: 8, paddingHorizontal: 16 },
  debugBtnText: { fontSize: 12, color: C.text3, textDecorationLine: 'underline' },
});
