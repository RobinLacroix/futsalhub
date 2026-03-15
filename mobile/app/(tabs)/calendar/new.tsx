import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';

let DateTimePicker: import('react').ComponentType<any> | null = null;
try {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  // Expo Go peut ne pas charger le module natif sur certaines versions
}

import { format, parse, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getPlayersByTeam, getPlayersByClubWithTeams, type PlayerWithTeams } from '../../../lib/services/players';
import { createTraining } from '../../../lib/services/trainings';
import type { Player, PlayerStatus } from '../../../types';

const THEME_OPTIONS = ['Offensif', 'Défensif', 'Transition', 'Supériorité'] as const;
export type TrainingTheme = (typeof THEME_OPTIONS)[number];

const defaultDate = () => {
  const d = new Date();
  d.setMinutes(0);
  d.setSeconds(0, 0);
  return d;
};

const useNativePicker = DateTimePicker != null;

const STATUS_OPTIONS: { value: PlayerStatus; label: string }[] = [
  { value: 'present', label: '✅' },
  { value: 'absent', label: '❌' },
  { value: 'late', label: '⏰' },
  { value: 'injured', label: '🩹' },
];

export default function NewTrainingScreen() {
  const router = useRouter();
  const { activeTeamId, activeTeam, teams } = useActiveTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateTime, setDateTime] = useState(defaultDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [location, setLocation] = useState('');
  const [keyPrinciple, setKeyPrinciple] = useState('');
  const [theme, setTheme] = useState<TrainingTheme>('Offensif');
  const [convoqued, setConvoqued] = useState<Record<string, boolean>>({});

  const [clubPlayersWithTeams, setClubPlayersWithTeams] = useState<PlayerWithTeams[]>([]);
  const [inviteFilterTeamId, setInviteFilterTeamId] = useState<string>('all');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteModalSelectedIds, setInviteModalSelectedIds] = useState<Record<string, boolean>>({});
  const [invitedTrainingPlayers, setInvitedTrainingPlayers] = useState<Record<string, PlayerStatus>>({});

  useEffect(() => {
    const d = defaultDate();
    setDateStr(format(d, 'dd/MM/yyyy', { locale: fr }));
    setTimeStr(format(d, 'HH:mm'));
  }, []);

  useEffect(() => {
    if (!activeTeamId) {
      setLoadingPlayers(false);
      return;
    }
    let mounted = true;
    getPlayersByTeam(activeTeamId)
      .then((data) => mounted && setPlayers(data))
      .catch(() => mounted && setPlayers([]))
      .finally(() => mounted && setLoadingPlayers(false));
    return () => { mounted = false; };
  }, [activeTeamId]);

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

  const getPlayerDisplayName = (playerId: string) => {
    const found = clubPlayersWithTeams.find(({ player }) => player.id === playerId);
    if (found) return `${found.player.first_name} ${found.player.last_name}`;
    return `Joueur ${playerId.slice(0, 8)}`;
  };

  const toggleConvoqued = (playerId: string) => {
    setConvoqued((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  const onDateChange = (_: unknown, value?: Date) => {
    setShowDatePicker(Platform.OS === 'ios' ? true : false);
    if (value) {
      const next = new Date(dateTime);
      next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
      setDateTime(next);
    }
  };

  const onTimeChange = (_: unknown, value?: Date) => {
    setShowTimePicker(Platform.OS === 'ios' ? true : false);
    if (value) {
      const next = new Date(dateTime);
      next.setHours(value.getHours(), value.getMinutes(), 0, 0);
      setDateTime(next);
    }
  };

  const getSubmitDate = (): Date | null => {
    if (useNativePicker) return dateTime;
    const dParsed = parse(dateStr.trim(), 'dd/MM/yyyy', new Date(), { locale: fr });
    if (!isValid(dParsed)) return null;
    const [h, m] = timeStr.trim().split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    const out = new Date(dParsed);
    out.setHours(h, m, 0, 0);
    return out;
  };

  const handleSubmit = async () => {
    if (!activeTeamId) {
      Alert.alert('Erreur', 'Aucune équipe sélectionnée. Choisissez une équipe dans l\'onglet Accueil.');
      return;
    }
    const submitDate = getSubmitDate();
    if (!submitDate) {
      Alert.alert('Date ou heure invalide', 'Date : JJ/MM/AAAA. Heure : HH:MM (ex. 18:30).');
      return;
    }
    if (!keyPrinciple.trim()) {
      Alert.alert('Champ requis', 'Veuillez renseigner le principe clé.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const squadConvoquedIds = players.filter((p) => convoqued[p.id]).map((p) => p.id);
      const invitedIds = Object.keys(invitedTrainingPlayers);
      const convokedPlayerIds = [...squadConvoquedIds, ...invitedIds];
      if (convokedPlayerIds.length === 0) {
        Alert.alert('Joueurs convoqués', 'Sélectionnez au moins un joueur convoqué pour cette séance.');
        setSaving(false);
        return;
      }
      const training = await createTraining(activeTeamId, {
        date: submitDate,
        location: location.trim(),
        theme,
        key_principle: keyPrinciple.trim(),
        convoked_player_ids: convokedPlayerIds,
      });
      Alert.alert('Entraînement créé', undefined, [
        {
          text: 'Voir le détail',
          onPress: () => router.replace(`/(tabs)/calendar/training/${training.id}`),
        },
        {
          text: 'Retour au calendrier',
          onPress: () => router.replace('/(tabs)/calendar'),
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Impossible de créer l\'entraînement';
      setError(msg);
      Alert.alert('Erreur', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Nouvel entraînement</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Date</Text>
          {useNativePicker ? (
            <TouchableOpacity
              style={styles.pickerTouch}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.pickerText}>{format(dateTime, 'EEEE d MMMM yyyy', { locale: fr })}</Text>
              <Text style={styles.pickerHint}>Appuyer pour ouvrir le sélecteur</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={dateStr}
                onChangeText={setDateStr}
                placeholder="JJ/MM/AAAA (ex. 22/02/2025)"
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.pickerHint}>Format : jour/mois/année</Text>
            </>
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Heure</Text>
          {useNativePicker ? (
            <TouchableOpacity
              style={styles.pickerTouch}
              onPress={() => setShowTimePicker(true)}
            >
              <Text style={styles.pickerText}>{format(dateTime, 'HH:mm')}</Text>
              <Text style={styles.pickerHint}>Appuyer pour ouvrir le sélecteur</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={timeStr}
                onChangeText={setTimeStr}
                placeholder="HH:MM (ex. 18:30)"
                placeholderTextColor="#9ca3af"
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.pickerHint}>Format : heures:minutes</Text>
            </>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Lieu</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="ex: Gymnase Jean Jaurès"
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Principe clé (obligatoire)</Text>
          <TextInput
            style={styles.input}
            value={keyPrinciple}
            onChangeText={setKeyPrinciple}
            placeholder="ex: Conserver le ballon, contre-attaque..."
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Thème</Text>
          <Text style={styles.themeHint}>Choisir parmi :</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.themeChip, theme === t && styles.themeChipActive]}
                onPress={() => setTheme(t)}
              >
                <Text style={[styles.themeChipText, theme === t && styles.themeChipTextActive]}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Joueurs convoqués</Text>
        <Text style={styles.themeHint}>
          Seuls les joueurs cochés verront cette séance dans leur calendrier.
        </Text>
        {loadingPlayers ? (
          <ActivityIndicator size="small" color="#3b82f6" style={styles.loader} />
        ) : players.length === 0 ? (
          <Text style={styles.emptyText}>Aucun joueur dans cette équipe</Text>
        ) : (
          players.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.playerRow, convoqued[p.id] && styles.playerRowConvoqued]}
              onPress={() => toggleConvoqued(p.id)}
              activeOpacity={0.7}
            >
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
              <View style={styles.convoqueCheck}>
                <Text style={styles.convoqueText}>{convoqued[p.id] ? 'Convoqué' : 'Non convoqué'}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {otherTeamPlayersForForm.length > 0 && (
          <View style={styles.inviteSection}>
            <TouchableOpacity
              style={styles.addOtherTeamsBtn}
              onPress={() => setInviteModalOpen(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addOtherTeamsBtnText}>+ Ajouter joueurs autres équipes</Text>
            </TouchableOpacity>
          </View>
        )}

        {Object.keys(invitedTrainingPlayers).length > 0 && (
          <View style={styles.invitedSection}>
            <Text style={styles.invitedSectionTitle}>Joueurs d&apos;autres équipes convoqués</Text>
            {Object.entries(invitedTrainingPlayers).map(([playerId, status]) => (
              <View key={playerId} style={styles.invitedRow}>
                <Text style={styles.invitedPlayerName}>{getPlayerDisplayName(playerId)}</Text>
                <View style={styles.statusRow}>
                  {STATUS_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() =>
                        setInvitedTrainingPlayers((prev) => ({ ...prev, [playerId]: opt.value }))
                      }
                      style={[styles.statusChip, status === opt.value && styles.statusChipActive]}
                    >
                      <Text style={styles.statusChipText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setInvitedTrainingPlayers((prev) => {
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
            ))}
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          <Text style={styles.submitBtnText}>
            {saving ? 'Création…' : 'Créer l\'entraînement'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {useNativePicker && DateTimePicker && (
        <>
          <Modal visible={showDatePicker} transparent animationType="slide">
            <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
              <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.modalDone}>OK</Text>
                  </Pressable>
                </View>
                <View style={styles.pickerWrapper}>
                  <DateTimePicker
                    value={dateTime}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(_e: unknown, v?: Date) => {
                      if (v) {
                        const next = new Date(dateTime);
                        next.setFullYear(v.getFullYear(), v.getMonth(), v.getDate());
                        setDateTime(next);
                      }
                      if (Platform.OS !== 'ios') setShowDatePicker(false);
                    }}
                    locale="fr-FR"
                    textColor="#111111"
                    themeVariant="light"
                  />
                </View>
              </View>
            </Pressable>
          </Modal>
          <Modal visible={showTimePicker} transparent animationType="slide">
            <Pressable style={styles.modalOverlay} onPress={() => setShowTimePicker(false)}>
              <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setShowTimePicker(false)}>
                    <Text style={styles.modalDone}>OK</Text>
                  </Pressable>
                </View>
                <View style={styles.pickerWrapper}>
                  <DateTimePicker
                    value={dateTime}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_e: unknown, v?: Date) => {
                      if (v) {
                        const next = new Date(dateTime);
                        next.setHours(v.getHours(), v.getMinutes(), 0, 0);
                        setDateTime(next);
                      }
                      if (Platform.OS !== 'ios') setShowTimePicker(false);
                    }}
                    locale="fr-FR"
                    is24Hour
                    textColor="#111111"
                    themeVariant="light"
                  />
                </View>
              </View>
            </Pressable>
          </Modal>
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
                style={[styles.filterChip, inviteFilterTeamId === 'all' && styles.filterChipActive]}
                onPress={() => setInviteFilterTeamId('all')}
              >
                <Text style={[styles.filterChipText, inviteFilterTeamId === 'all' && styles.filterChipTextActive]}>
                  Toutes
                </Text>
              </TouchableOpacity>
              {teams.filter((t) => t.id !== activeTeamId).map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.filterChip, inviteFilterTeamId === t.id && styles.filterChipActive]}
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
                    .filter((id) => !invitedTrainingPlayers[id]);
                  setInvitedTrainingPlayers((prev) => {
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  backBtn: { marginBottom: 16 },
  backBtnText: { fontSize: 16, color: '#3b82f6' },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pickerTouch: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pickerText: { fontSize: 16, color: '#111', fontWeight: '500' },
  pickerHint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16 },
  modalDone: { fontSize: 17, fontWeight: '600', color: '#3b82f6' },
  pickerWrapper: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    minHeight: 220,
    width: '100%',
  },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
  },
  themeHint: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  themeChipActive: { backgroundColor: '#3b82f6' },
  themeChipText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  themeChipTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 8, marginBottom: 12 },
  themeHint: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  loader: { marginVertical: 16 },
  emptyText: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  playerRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  playerRowConvoqued: { borderWidth: 2, borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  playerInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  convoqueCheck: { marginTop: 4 },
  convoqueText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
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
  errorText: { fontSize: 14, color: '#dc2626', marginTop: 12 },
  submitBtn: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  inviteSection: { marginTop: 16, marginBottom: 8 },
  addOtherTeamsBtn: {
    padding: 14,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    alignItems: 'center',
  },
  addOtherTeamsBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  invitedSection: { marginTop: 16, marginBottom: 8 },
  invitedSectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 },
  invitedRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  invitedPlayerName: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 8 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  statusChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  statusChipActive: { backgroundColor: '#3b82f6' },
  statusChipText: { fontSize: 14 },
  removeInvitedBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  removeInvitedText: { fontSize: 13, color: '#dc2626', fontWeight: '500' },
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
  filterRow: { marginBottom: 12, maxHeight: 44 },
  filterChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: '#16a34a' },
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
});
