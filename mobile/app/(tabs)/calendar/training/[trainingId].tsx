import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useActiveTeam } from '../../../../contexts/ActiveTeamContext';
import { getTrainingById, updateTrainingAttendance, sendQuestionnairesForTraining } from '../../../../lib/services/trainings';
import { getPlayersByTeam } from '../../../../lib/services/players';
import type { Training, Player, PlayerStatus } from '../../../../types';

const STATUS_OPTIONS: { value: PlayerStatus; label: string }[] = [
  { value: 'present', label: 'Présent' },
  { value: 'late', label: 'Retard' },
  { value: 'absent', label: 'Absent' },
  { value: 'injured', label: 'Blessé' },
];

export default function TrainingDetailScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const router = useRouter();
  const { activeTeamId } = useActiveTeam();
  const [training, setTraining] = useState<Training | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Record<string, PlayerStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoalkeepers, setShowGoalkeepers] = useState(true);
  const [sendingQuestionnaires, setSendingQuestionnaires] = useState(false);

  const load = useCallback(async () => {
    if (!trainingId || !activeTeamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [t, pl] = await Promise.all([
        getTrainingById(trainingId),
        getPlayersByTeam(activeTeamId),
      ]);
      if (!t) {
        setError('Entraînement introuvable');
        setLoading(false);
        return;
      }
      setTraining(t);
      setPlayers(pl);
      setAttendance(t.attendance ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [trainingId, activeTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  const setPlayerStatus = (playerId: string, status: PlayerStatus) => {
    setAttendance((prev) => ({ ...prev, [playerId]: status }));
  };

  const saveAttendance = async () => {
    if (!trainingId) return;
    setSaving(true);
    try {
      await updateTrainingAttendance(trainingId, attendance);
      setTraining((t) => (t ? { ...t, attendance } : null));
      Alert.alert('Enregistré', 'Les présences ont été mises à jour.');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'enregistrer');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (error || !training) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Entraînement introuvable'}</Text>
      </View>
    );
  }

  const dateStr = typeof training.date === 'string' ? training.date : '';
  const date = dateStr ? parseISO(dateStr) : new Date();

  const isGoalkeeper = (p: Player) =>
    p.position?.toLowerCase().includes('gardien') ?? false;
  const convokedIds = training.convoked_players?.map((x) => x.id) ?? [];
  const listPlayers = convokedIds.length > 0 ? players.filter((p) => convokedIds.includes(p.id)) : players;
  const filteredPlayers = showGoalkeepers ? listPlayers : listPlayers.filter((p) => !isGoalkeeper(p));

  const handleSendQuestionnaires = async () => {
    if (!trainingId) return;
    setSendingQuestionnaires(true);
    try {
      const result = await sendQuestionnairesForTraining(trainingId);
      if (result.ok) {
        Alert.alert('Questionnaires envoyés', result.count ? `${result.count} lien(s) créé(s) pour les joueurs présents ou en retard.` : 'Les joueurs concernés peuvent remplir le questionnaire.');
      } else {
        Alert.alert('Erreur', result.error ?? 'Impossible d\'envoyer les questionnaires.');
      }
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'envoyer les questionnaires.');
    } finally {
      setSendingQuestionnaires(false);
    }
  };

  const presentOnlyCount = filteredPlayers.filter((p) => attendance[p.id] === 'present').length;
  const lateCount = filteredPlayers.filter((p) => attendance[p.id] === 'late').length;
  const presentCount = presentOnlyCount + lateCount;
  const absentCount = filteredPlayers.filter(
    (p) => attendance[p.id] === 'absent' || attendance[p.id] === 'injured'
  ).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.date}>{format(date, 'EEEE d MMMM yyyy', { locale: fr })}</Text>
        <Text style={styles.theme}>{training.theme}</Text>
        {training.location ? <Text style={styles.location}>{training.location}</Text> : null}
      </View>

      {players.length > 0 && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, showGoalkeepers && styles.filterChipActive]}
            onPress={() => setShowGoalkeepers(true)}
          >
            <Text style={[styles.filterChipText, showGoalkeepers && styles.filterChipTextActive]}>
              Gardiens + joueurs
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, !showGoalkeepers && styles.filterChipActive]}
            onPress={() => setShowGoalkeepers(false)}
          >
            <Text style={[styles.filterChipText, !showGoalkeepers && styles.filterChipTextActive]}>
              Joueurs seulement
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.statsRow}>
        <View style={[styles.statBox, styles.statBoxPresent]}>
          <Text style={styles.statNumber}>{presentCount}</Text>
          <Text style={styles.statLabel}>Présents</Text>
          <Text style={styles.statHint}>
            {presentOnlyCount} présent{presentOnlyCount !== 1 ? 's' : ''}, {lateCount} retard{lateCount !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={[styles.statBox, styles.statBoxAbsent]}>
          <Text style={styles.statNumber}>{absentCount}</Text>
          <Text style={styles.statLabel}>Absents</Text>
          <Text style={styles.statHint}>blessé + absent</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Présences</Text>

      {filteredPlayers.length === 0 ? (
        <Text style={styles.emptyText}>
          {players.length === 0 ? 'Aucun joueur dans cette équipe' : 'Aucun joueur de champ (gardiens masqués).'}
        </Text>
      ) : (
        <>
          {filteredPlayers.map((p) => (
            <View key={p.id} style={styles.playerRow}>
              <View style={styles.playerInfo}>
                {p.number != null && (
                  <View style={styles.numberBadge}>
                    <Text style={styles.numberText}>{p.number}</Text>
                  </View>
                )}
                <Text style={styles.playerName}>
                  {p.first_name} {p.last_name}
                </Text>
              </View>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.statusBtn,
                      attendance[p.id] === opt.value && styles.statusBtnActive,
                    ]}
                    onPress={() => setPlayerStatus(p.id, opt.value)}
                  >
                    <Text
                      style={[
                        styles.statusBtnText,
                        attendance[p.id] === opt.value && styles.statusBtnTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={saveAttendance}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'Enregistrement…' : 'Enregistrer les présences'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>En fin de séance</Text>
          <TouchableOpacity
            style={[styles.questionnairesBtn, sendingQuestionnaires && styles.saveBtnDisabled]}
            onPress={handleSendQuestionnaires}
            disabled={sendingQuestionnaires}
          >
            <Text style={styles.saveBtnText}>
              {sendingQuestionnaires ? 'Envoi…' : 'Envoyer les questionnaires'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.questionnairesHint}>
            Crée un lien questionnaire pour chaque joueur marqué Présent ou En retard.
          </Text>
        </>
      )}
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
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  date: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  theme: { fontSize: 14, color: '#374151', marginBottom: 2 },
  location: { fontSize: 12, color: '#6b7280' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  statBoxPresent: { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
  statBoxAbsent: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  statNumber: { fontSize: 28, fontWeight: '700', color: '#111' },
  statLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 4 },
  statHint: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  filterChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  filterChipText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  filterChipTextActive: { color: '#1d4ed8', fontWeight: '600' },
  emptyText: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  playerRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  playerInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  numberText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  playerName: { fontSize: 15, fontWeight: '600', color: '#111' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  statusBtnActive: { backgroundColor: '#3b82f6' },
  statusBtnText: { fontSize: 12, color: '#374151' },
  statusBtnTextActive: { color: '#fff' },
  saveBtn: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  questionnairesBtn: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    alignItems: 'center',
  },
  questionnairesHint: { fontSize: 12, color: '#6b7280', marginTop: 8, marginBottom: 16 },
});
