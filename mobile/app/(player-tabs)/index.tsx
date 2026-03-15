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
import {
  getMyCalendarEvents,
  getMyConvocationsStatus,
  getMyConvocationsDebug,
  setMyTrainingAttendance,
  type MyConvolutionRow,
  type MyUpcomingMatchRow,
} from '../../lib/services/playerConvocations';

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

export default function PlayerConvocationsScreen() {
  const [convocations, setConvocations] = useState<MyConvolutionRow[]>([]);
  const [matches, setMatches] = useState<MyUpcomingMatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptyHint, setEmptyHint] = useState<'no_player' | 'no_team' | 'no_upcoming' | null>(null);

  const calendarItems = useMemo(
    () =>
      sortCalendarItems([
        ...convocations.map((c) => ({ type: 'training' as const, data: c })),
        ...matches.map((m) => ({ type: 'match' as const, data: m })),
      ]),
    [convocations, matches]
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      setEmptyHint(null);
      const { trainings: trainingsData, matches: matchesData } = await getMyCalendarEvents();
      setConvocations(trainingsData);
      setMatches(matchesData);
      if (trainingsData.length === 0 && matchesData.length === 0) {
        try {
          const status = await getMyConvocationsStatus();
          if (status && status.hint !== 'ok') setEmptyHint(status.hint);
        } catch {
          // Ne pas afficher "Erreur au chargement" si seul le diagnostic échoue
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur au chargement';
      setError(msg);
      setConvocations([]);
      setMatches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleSetAttendance = useCallback(async (trainingId: string, status: Status) => {
    setUpdatingId(trainingId);
    setError(null);
    const result = await setMyTrainingAttendance(trainingId, status);
    setUpdatingId(null);
    if (result.ok) {
      setConvocations((prev) =>
        prev.map((c) => (c.training_id === trainingId ? { ...c, my_status: status } : c))
      );
    } else {
      const msg = result.error === 'too_late'
        ? 'Il est trop tard pour répondre (délai : jusqu\'à 2 h avant la séance).'
        : (result.error ?? 'Erreur');
      setError(msg);
    }
  }, []);

  const openQuestionnaire = useCallback(async (urlPathOrFull: string) => {
    const base = (process.env.EXPO_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
    const url = urlPathOrFull.startsWith('http')
      ? urlPathOrFull
      : base
        ? base + (urlPathOrFull.startsWith('/') ? urlPathOrFull : `/${urlPathOrFull}`)
        : '';
    if (!url || !url.startsWith('http')) {
      Alert.alert(
        'Configuration',
        'L’URL du site (EXPO_PUBLIC_SITE_URL) n’est pas définie. Ajoutez-la dans mobile/.env.'
      );
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Erreur', 'Impossible d’ouvrir le lien.');
    }
  }, []);

  if (loading && calendarItems.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList
        data={calendarItems}
        keyExtractor={(item) =>
          item.type === 'training' ? `t-${item.data.training_id}` : `m-${item.data.match_id}`
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#16a34a']} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {emptyHint === 'no_player'
                ? 'Compte non lié à une fiche joueur'
                : emptyHint === 'no_team'
                  ? 'Vous n’êtes dans aucune équipe'
                  : 'Aucune convocation à venir'}
            </Text>
            <Text style={styles.emptyText}>
              {emptyHint === 'no_player'
                ? 'Demandez à votre coach de lier votre compte à votre fiche joueur (depuis l’app ou le site).'
                : emptyHint === 'no_team'
                  ? 'Demandez à votre coach de vous ajouter à une équipe.'
                  : 'Vos séances et matchs apparaîtront ici (entraînements et matchs de vos équipes).'}
            </Text>
            <TouchableOpacity
              style={styles.debugBtn}
              onPress={async () => {
                const d = await getMyConvocationsDebug();
                if (!d) {
                  Alert.alert('Diagnostic', 'Impossible de récupérer le diagnostic.');
                  return;
                }
                const msg = (d.reason as string)
                  ? String(d.message || d.reason)
                  : `Joueur: ${d.player_id ? 'oui' : 'non'}\nÉquipes: ${d.team_count ?? 0}\nSéances à venir: ${d.trainings_upcoming ?? 0}\nSéances total (équipes): ${d.trainings_total_for_teams ?? 0}`;
                Alert.alert('Diagnostic', msg);
              }}
            >
              <Text style={styles.debugBtnText}>Voir le diagnostic</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'match') {
            const m = item.data;
            const matchDate = m.match_date ? parseISO(m.match_date) : new Date();
            const otherTeam = !!m.is_other_team;
            return (
              <View style={[styles.card, styles.cardMatch, otherTeam && styles.cardOtherTeam]}>
                <Text style={[styles.badge, styles.badgeMatch, otherTeam && styles.badgeOtherTeam]}>
                  Match{otherTeam ? ' (autre équipe)' : ''}
                </Text>
                <Text style={styles.date}>{format(matchDate, 'EEEE d MMMM yyyy', { locale: fr })}</Text>
                <Text style={styles.time}>{format(matchDate, 'HH:mm', { locale: fr })}</Text>
                <Text style={styles.theme}>{m.title || 'Match'}</Text>
                {m.opponent_team ? (
                  <Text style={styles.meta}>vs {m.opponent_team}</Text>
                ) : null}
                {m.competition ? <Text style={styles.meta}>Compétition : {m.competition}</Text> : null}
                {m.team_name ? <Text style={styles.meta}>Équipe : {m.team_name}</Text> : null}
                {m.location ? <Text style={styles.meta}>Lieu : {m.location}</Text> : null}
              </View>
            );
          }
          const c = item.data;
          const date = c.training_date ? parseISO(c.training_date) : new Date();
          const status = (c.my_status as Status) || null;
          const isUpdating = updatingId === c.training_id;
          const otherTeam = !!c.is_other_team;
          return (
            <View style={[styles.card, otherTeam && styles.cardOtherTeamTraining]}>
              <Text style={[styles.badge, otherTeam && styles.badgeOtherTeamTraining]}>
                Entraînement{otherTeam ? ' (autre équipe)' : ''}
              </Text>
              <Text style={styles.date}>{format(date, 'EEEE d MMMM yyyy', { locale: fr })}</Text>
              <Text style={styles.time}>{format(date, 'HH:mm', { locale: fr })}</Text>
              {c.team_name ? <Text style={styles.meta}>Équipe : {c.team_name}</Text> : null}
              {c.location ? <Text style={styles.meta}>Lieu : {c.location}</Text> : null}

              <Text style={styles.label}>Je serai :</Text>
              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.btn, status === 'present' && styles.btnPresent]}
                  onPress={() => handleSetAttendance(c.training_id, 'present')}
                  disabled={isUpdating}
                >
                  <Text style={[styles.btnText, status === 'present' && styles.btnTextActive]}>
                    {isUpdating ? '…' : 'Présent'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, status === 'late' && styles.btnLate]}
                  onPress={() => handleSetAttendance(c.training_id, 'late')}
                  disabled={isUpdating}
                >
                  <Text style={[styles.btnText, status === 'late' && styles.btnTextActive]}>
                    En retard
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, status === 'absent' && styles.btnAbsent]}
                  onPress={() => handleSetAttendance(c.training_id, 'absent')}
                  disabled={isUpdating}
                >
                  <Text style={[styles.btnText, status === 'absent' && styles.btnTextActive]}>
                    Absent
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, status === 'injured' && styles.btnInjured]}
                  onPress={() => handleSetAttendance(c.training_id, 'injured')}
                  disabled={isUpdating}
                >
                  <Text style={[styles.btnText, status === 'injured' && styles.btnTextActive]}>
                    Blessé
                  </Text>
                </TouchableOpacity>
              </View>

              {c.feedback_token && c.feedback_url && !otherTeam ? (
                <TouchableOpacity
                  style={styles.questionnaireLink}
                  onPress={() => openQuestionnaire(c.feedback_url!)}
                >
                  <Text style={styles.questionnaireLinkText}>Remplir le questionnaire de la séance</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  listContent: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBox: { backgroundColor: '#fef2f2', padding: 12, margin: 16, borderRadius: 8 },
  errorText: { color: '#dc2626', fontSize: 14 },
  retryBtn: { marginTop: 8, paddingVertical: 8 },
  retryBtnText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
  empty: { padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 16 },
  debugBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  debugBtnText: { fontSize: 13, color: '#6b7280', textDecorationLine: 'underline' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
  },
  cardMatch: {
    borderLeftColor: '#2563eb',
  },
  cardOtherTeam: {
    backgroundColor: '#fffbeb',
    borderLeftColor: '#d97706',
  },
  cardOtherTeamTraining: {
    backgroundColor: '#f5f3ff',
    borderLeftColor: '#7c3aed',
  },
  badgeOtherTeam: {
    backgroundColor: '#d97706',
  },
  badgeOtherTeamTraining: {
    backgroundColor: '#7c3aed',
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#16a34a',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    overflow: 'hidden',
  },
  badgeMatch: {
    backgroundColor: '#2563eb',
  },
  date: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  time: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  theme: { fontSize: 14, color: '#374151', marginBottom: 4 },
  meta: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  btnPresent: { backgroundColor: '#16a34a' },
  btnLate: { backgroundColor: '#ea580c' },
  btnAbsent: { backgroundColor: '#d97706' },
  btnInjured: { backgroundColor: '#e11d48' },
  btnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  btnTextActive: { color: '#fff' },
  questionnaireLink: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  questionnaireLinkText: { fontSize: 14, color: '#2563eb', fontWeight: '500' },
});
