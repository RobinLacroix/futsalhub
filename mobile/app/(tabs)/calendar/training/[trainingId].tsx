import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useActiveTeam } from '../../../../contexts/ActiveTeamContext';
import { getTrainingById, updateTrainingAttendance, sendQuestionnairesForTraining } from '../../../../lib/services/trainings';
import { getPlayersByTeam, getPlayersByClubWithTeams, type PlayerWithTeams } from '../../../../lib/services/players';
import type { Training, Player, PlayerStatus } from '../../../../types';

const STATUS_OPTIONS: { value: PlayerStatus; label: string }[] = [
  { value: 'present', label: 'Présent' },
  { value: 'late', label: 'Retard' },
  { value: 'absent', label: 'Absent' },
  { value: 'injured', label: 'Blessé' },
];

export default function TrainingDetailScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const { activeTeamId, activeTeam, teams } = useActiveTeam();
  const [training, setTraining] = useState<Training | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Record<string, PlayerStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoalkeepers, setShowGoalkeepers] = useState(true);
  const [sendingQuestionnaires, setSendingQuestionnaires] = useState(false);

  const [clubPlayersWithTeams, setClubPlayersWithTeams] = useState<PlayerWithTeams[]>([]);
  const [inviteFilterTeamId, setInviteFilterTeamId] = useState<string>('all');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteModalSelectedIds, setInviteModalSelectedIds] = useState<Record<string, boolean>>({});

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

  const clubId = activeTeam?.club_id;
  useEffect(() => {
    if (!clubId) {
      setClubPlayersWithTeams([]);
      return;
    }
    let mounted = true;
    getPlayersByClubWithTeams(clubId)
      .then((data) => mounted && setClubPlayersWithTeams(data))
      .catch(() => mounted && setClubPlayersWithTeams([]));
    return () => { mounted = false; };
  }, [clubId]);

  const squadIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);
  const otherTeamPlayersForForm = useMemo(
    () => clubPlayersWithTeams.filter(({ player }) => !squadIds.has(player.id)),
    [clubPlayersWithTeams, squadIds]
  );
  const otherTeamPlayersFiltered = useMemo(() => {
    if (inviteFilterTeamId === 'all') return otherTeamPlayersForForm;
    return otherTeamPlayersForForm.filter(({ teamIds }) => teamIds.includes(inviteFilterTeamId));
  }, [otherTeamPlayersForForm, inviteFilterTeamId]);
  const invitedPlayerIds = useMemo(
    () => Object.keys(attendance).filter((id) => !squadIds.has(id)),
    [attendance, squadIds]
  );

  const getPlayerDisplayName = (playerId: string) => {
    const found = clubPlayersWithTeams.find(({ player }) => player.id === playerId);
    if (found) return `${found.player.first_name} ${found.player.last_name}`;
    return `Joueur ${playerId.slice(0, 8)}`;
  };

  const setPlayerStatus = (playerId: string, status: PlayerStatus) => {
    setAttendance((prev) => ({ ...prev, [playerId]: status }));
  };

  const saveAttendance = async () => {
    if (!trainingId) return;
    setSaving(true);
    try {
      const convokedPlayerIds = Object.keys(attendance);
      await updateTrainingAttendance(trainingId, attendance, convokedPlayerIds);
      setTraining((t) => (t ? { ...t, attendance, convoked_players: convokedPlayerIds.map((id) => ({ id })) } : null));
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
          {otherTeamPlayersForForm.length > 0 && (
            <TouchableOpacity
              style={styles.addOtherTeamsBtn}
              onPress={() => setInviteModalOpen(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addOtherTeamsBtnText}>+ Ajouter joueurs autres équipes</Text>
            </TouchableOpacity>
          )}

          {invitedPlayerIds.length > 0 && (
            <View style={styles.invitedSection}>
              <Text style={styles.invitedSectionTitle}>Joueurs d&apos;autres équipes convoqués</Text>
              <Text style={styles.invitedSectionHint}>Indiquez présence, retard, absent ou blessé en fin de séance.</Text>
              {invitedPlayerIds.map((playerId) => (
                <View key={playerId} style={styles.invitedRow}>
                  <View style={styles.invitedRowHeader}>
                    <Text style={styles.invitedPlayerName}>{getPlayerDisplayName(playerId)}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setAttendance((prev) => {
                          const next = { ...prev };
                          delete next[playerId];
                          return next;
                        });
                      }}
                      style={styles.removeInvitedBtn}
                    >
                      <Text style={styles.removeInvitedText}>Retirer</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.statusRow}>
                    {STATUS_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.statusBtn,
                          attendance[playerId] === opt.value && styles.statusBtnActive,
                        ]}
                        onPress={() => setPlayerStatus(playerId, opt.value)}
                      >
                        <Text
                          style={[
                            styles.statusBtnText,
                            attendance[playerId] === opt.value && styles.statusBtnTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

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

      <Modal visible={inviteModalOpen} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setInviteModalOpen(false)}>
          <View style={styles.inviteModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.inviteModalHeader}>
              <Text style={styles.inviteModalTitle}>Ajouter des joueurs d&apos;autres équipes</Text>
              <Pressable onPress={() => { setInviteModalOpen(false); setInviteModalSelectedIds({}); }}>
                <Text style={styles.modalDone}>Fermer</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>Filtrer par équipe</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterChipInvite, inviteFilterTeamId === 'all' && styles.filterChipInviteActive]}
                onPress={() => setInviteFilterTeamId('all')}
              >
                <Text style={[styles.filterChipText, inviteFilterTeamId === 'all' && styles.filterChipTextActive]}>
                  Toutes
                </Text>
              </TouchableOpacity>
              {teams.filter((t) => t.id !== activeTeamId).map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.filterChipInvite, inviteFilterTeamId === t.id && styles.filterChipInviteActive]}
                  onPress={() => setInviteFilterTeamId(t.id)}
                >
                  <Text style={[styles.filterChipText, inviteFilterTeamId === t.id && styles.filterChipTextActive]}>
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView style={styles.inviteModalList}>
              {otherTeamPlayersFiltered.map(({ player, teamNames }) => (
                <TouchableOpacity
                  key={player.id}
                  style={styles.inviteModalPlayerRow}
                  onPress={() =>
                    setInviteModalSelectedIds((prev) => ({ ...prev, [player.id]: !prev[player.id] }))
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.inviteModalPlayerName}>
                    {player.first_name} {player.last_name}
                    {teamNames.length > 0 ? ` (${teamNames.join(', ')})` : ''}
                  </Text>
                  <View style={[styles.checkbox, inviteModalSelectedIds[player.id] && styles.checkboxChecked]}>
                    {inviteModalSelectedIds[player.id] ? <Text style={styles.checkboxText}>✓</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.inviteModalFooter}>
              <TouchableOpacity style={styles.inviteModalCancelBtn} onPress={() => { setInviteModalOpen(false); setInviteModalSelectedIds({}); }}>
                <Text style={styles.inviteModalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inviteModalAddBtn}
                onPress={() => {
                  const toAdd = Object.entries(inviteModalSelectedIds)
                    .filter(([, v]) => v)
                    .map(([id]) => id)
                    .filter((id) => !attendance[id]);
                  setAttendance((prev) => {
                    const next = { ...prev };
                    toAdd.forEach((id) => (next[id] = 'present'));
                    return next;
                  });
                  setInviteModalOpen(false);
                  setInviteModalSelectedIds({});
                }}
              >
                <Text style={styles.inviteModalAddText}>Ajouter la sélection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
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
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 40, marginBottom: 12 },
  filterRow: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  filterChip: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  filterChipActive: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  filterChipText: { fontSize: 15, fontWeight: '500', color: '#374151' },
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
  addOtherTeamsBtn: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    alignItems: 'center',
  },
  addOtherTeamsBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  invitedSection: { marginTop: 16, marginBottom: 8 },
  invitedSectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  invitedSectionHint: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  invitedRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  invitedRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  invitedPlayerName: { fontSize: 15, fontWeight: '600', color: '#111', flex: 1 },
  removeInvitedBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  removeInvitedText: { fontSize: 13, color: '#dc2626', fontWeight: '500' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  inviteModalContent: {
    backgroundColor: '#fff',
    marginTop: 80,
    marginHorizontal: 16,
    borderRadius: 16,
    maxHeight: '80%',
    padding: 16,
  },
  inviteModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  inviteModalTitle: { fontSize: 18, fontWeight: '700', color: '#111', flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  filterRow: { marginBottom: 12, maxHeight: 44 },
  filterChipInvite: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    marginRight: 8,
  },
  filterChipInviteActive: { backgroundColor: '#16a34a' },
  filterChipText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  filterChipTextActive: { color: '#fff' },
  inviteModalList: { maxHeight: 280, marginBottom: 16 },
  inviteModalPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  inviteModalPlayerName: { fontSize: 15, color: '#111', flex: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkboxText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  inviteModalFooter: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  inviteModalCancelBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  inviteModalCancelText: { fontSize: 16, color: '#6b7280', fontWeight: '500' },
  inviteModalAddBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#16a34a',
    borderRadius: 10,
  },
  inviteModalAddText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  modalDone: { fontSize: 17, fontWeight: '600', color: '#3b82f6' },
});
