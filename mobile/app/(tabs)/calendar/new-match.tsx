import { useEffect, useState, useMemo } from 'react';
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
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';

let DateTimePicker: import('react').ComponentType<any> | null = null;
try {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  // fallback si module non dispo
}

import { format, parse, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getPlayersByTeam, getPlayersByClubWithTeams, type PlayerWithTeams } from '../../../lib/services/players';
import { createMatch } from '../../../lib/services/matches';
import type { Player } from '../../../types';

const LOCATION_OPTIONS = ['Domicile', 'Extérieur'] as const;
const COMPETITION_OPTIONS = ['Championnat', 'Coupe', 'Amical'] as const;

const defaultDate = () => {
  const d = new Date();
  d.setMinutes(0);
  d.setSeconds(0, 0);
  return d;
};

const useNativePicker = DateTimePicker != null;

const defaultPlayerStats = () => ({ goals: 0, yellow_cards: 0, red_cards: 0 });

export default function NewMatchScreen() {
  const router = useRouter();
  const { activeTeamId, activeTeam, teams } = useActiveTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [dateTime, setDateTime] = useState(defaultDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [location, setLocation] = useState<typeof LOCATION_OPTIONS[number]>('Domicile');
  const [competition, setCompetition] = useState<typeof COMPETITION_OPTIONS[number]>('Championnat');
  const [convoqued, setConvoqued] = useState<Record<string, boolean>>({});
  const [scoreTeam, setScoreTeam] = useState('');
  const [scoreOpponent, setScoreOpponent] = useState('');

  const [clubPlayersWithTeams, setClubPlayersWithTeams] = useState<PlayerWithTeams[]>([]);
  const [inviteFilterTeamId, setInviteFilterTeamId] = useState<string>('all');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteModalSelectedIds, setInviteModalSelectedIds] = useState<Record<string, boolean>>({});
  const [invitedMatchPlayers, setInvitedMatchPlayers] = useState<Record<string, { goals: number; yellow_cards: number; red_cards: number }>>({});

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

  const sortedPlayersForMatch = useMemo(
    () =>
      [...players].sort((a, b) => {
        const aConv = !!convoqued[a.id];
        const bConv = !!convoqued[b.id];
        if (aConv !== bConv) return aConv ? -1 : 1;
        return (a.last_name || '').localeCompare(b.last_name || '', 'fr');
      }),
    [players, convoqued]
  );

  const onDateChange = (_: unknown, value?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (value) {
      const next = new Date(dateTime);
      next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
      setDateTime(next);
    }
  };

  const onTimeChange = (_: unknown, value?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
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
      Alert.alert('Erreur', "Aucune équipe sélectionnée. Choisissez une équipe dans l'onglet Accueil.");
      return;
    }
    if (!title.trim()) {
      Alert.alert('Champ requis', 'Veuillez renseigner le titre du match.');
      return;
    }
    const submitDate = getSubmitDate();
    if (!submitDate) {
      Alert.alert('Date ou heure invalide', 'Date : JJ/MM/AAAA. Heure : HH:MM (ex. 18:30).');
      return;
    }
    const st = parseInt(scoreTeam.trim(), 10);
    const so = parseInt(scoreOpponent.trim(), 10);
    if (Number.isNaN(st) || Number.isNaN(so) || st < 0 || so < 0) {
      Alert.alert('Score invalide', 'Indiquez des nombres entiers positifs pour le score.');
      return;
    }
    const squadConvoquedIds = players
      .filter((p) => convoqued[p.id])
      .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr'))
      .map((p) => p.id);
    const invitedIds = Object.keys(invitedMatchPlayers);
    const convoquedPlayerIds = [...squadConvoquedIds, ...invitedIds];
    const playerStats: Record<string, { goals: number; yellow_cards: number; red_cards: number }> = {};
    squadConvoquedIds.forEach((id) => (playerStats[id] = defaultPlayerStats()));
    invitedIds.forEach((id) => (playerStats[id] = invitedMatchPlayers[id] ?? defaultPlayerStats()));

    setSaving(true);
    setError(null);
    try {
      const match = await createMatch(activeTeamId, {
        title: title.trim(),
        date: submitDate,
        location,
        competition,
        convoquedPlayerIds,
        score_team: st,
        score_opponent: so,
        playerStats,
      });
      Alert.alert('Match créé', undefined, [
        { text: 'Voir le détail', onPress: () => router.replace(`/(tabs)/calendar/matchDetail/${match.id}`) },
        { text: 'Retour au calendrier', onPress: () => router.replace('/(tabs)/calendar') },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible de créer le match";
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
        <Text style={styles.screenTitle}>Nouveau match</Text>
        <Text style={styles.screenSubtitle}>
          Renseignez les infos du match et cochez les joueurs convoqués sur cette page.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Titre</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="ex: Match 1 - Équipe adverse"
            placeholderTextColor="#9ca3af"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Date</Text>
          {useNativePicker && DateTimePicker ? (
            <TouchableOpacity style={styles.pickerTouch} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.pickerText}>{format(dateTime, 'EEEE d MMMM yyyy', { locale: fr })}</Text>
              <Text style={styles.pickerHint}>Appuyer pour ouvrir le sélecteur</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={dateStr}
                onChangeText={setDateStr}
                placeholder="JJ/MM/AAAA"
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.pickerHint}>Format : jour/mois/année</Text>
            </>
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Heure</Text>
          {useNativePicker && DateTimePicker ? (
            <TouchableOpacity style={styles.pickerTouch} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.pickerText}>{format(dateTime, 'HH:mm')}</Text>
              <Text style={styles.pickerHint}>Appuyer pour ouvrir le sélecteur</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={timeStr}
                onChangeText={setTimeStr}
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.pickerHint}>Format : heures:minutes</Text>
            </>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Lieu</Text>
          <View style={styles.chipRow}>
            {LOCATION_OPTIONS.map((loc) => (
              <TouchableOpacity
                key={loc}
                style={[styles.chip, location === loc && styles.chipActive]}
                onPress={() => setLocation(loc)}
              >
                <Text style={[styles.chipText, location === loc && styles.chipTextActive]}>{loc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Type de compétition</Text>
          <View style={styles.chipRow}>
            {COMPETITION_OPTIONS.map((comp) => (
              <TouchableOpacity
                key={comp}
                style={[styles.chip, competition === comp && styles.chipMatch]}
                onPress={() => setCompetition(comp)}
              >
                <Text style={[styles.chipText, competition === comp && styles.chipTextActive]}>{comp}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Joueurs convoqués</Text>
        <Text style={styles.sectionHint}>Cochez les joueurs convoqués pour ce match (blessures, absences…).</Text>
        {loadingPlayers ? (
          <ActivityIndicator size="small" color="#dc2626" style={styles.loader} />
        ) : sortedPlayersForMatch.length === 0 ? (
          <Text style={styles.emptyText}>Aucun joueur dans cette équipe</Text>
        ) : (
          <View style={styles.playerList}>
            {sortedPlayersForMatch.map((p) => (
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
                <View style={styles.convoqueLabel}>
                  <Text style={styles.convoqueText}>Convoqué</Text>
                  <Switch
                    value={!!convoqued[p.id]}
                    onValueChange={() => toggleConvoqued(p.id)}
                    trackColor={{ false: '#e5e7eb', true: '#dc2626' }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            ))}
          </View>
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

        {Object.keys(invitedMatchPlayers).length > 0 && (
          <View style={styles.invitedSection}>
            <Text style={styles.invitedSectionTitle}>Joueurs d&apos;autres équipes convoqués</Text>
            {Object.entries(invitedMatchPlayers).map(([playerId, stats]) => (
              <View key={playerId} style={styles.invitedMatchRow}>
                <Text style={styles.invitedPlayerName}>{getPlayerDisplayName(playerId)}</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Buts</Text>
                    <TextInput
                      style={styles.statInput}
                      value={String(stats.goals)}
                      onChangeText={(t) => {
                        const v = parseInt(t, 10) || 0;
                        setInvitedMatchPlayers((prev) => ({
                          ...prev,
                          [playerId]: { ...(prev[playerId] ?? defaultPlayerStats()), goals: v },
                        }));
                      }}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Jaunes</Text>
                    <TextInput
                      style={styles.statInput}
                      value={String(stats.yellow_cards)}
                      onChangeText={(t) => {
                        const v = parseInt(t, 10) || 0;
                        setInvitedMatchPlayers((prev) => ({
                          ...prev,
                          [playerId]: { ...(prev[playerId] ?? defaultPlayerStats()), yellow_cards: v },
                        }));
                      }}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Rouges</Text>
                    <TextInput
                      style={styles.statInput}
                      value={String(stats.red_cards)}
                      onChangeText={(t) => {
                        const v = parseInt(t, 10) || 0;
                        setInvitedMatchPlayers((prev) => ({
                          ...prev,
                          [playerId]: { ...(prev[playerId] ?? defaultPlayerStats()), red_cards: v },
                        }));
                      }}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setInvitedMatchPlayers((prev) => {
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

        <View style={styles.field}>
          <Text style={styles.label}>Score</Text>
          <View style={styles.scoreRow}>
            <TextInput
              style={styles.scoreInput}
              value={scoreTeam}
              onChangeText={setScoreTeam}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
            />
            <Text style={styles.scoreSeparator}>–</Text>
            <TextInput
              style={styles.scoreInput}
              value={scoreOpponent}
              onChangeText={setScoreOpponent}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
            />
          </View>
          <Text style={styles.pickerHint}>Notre équipe – Adversaire</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          <Text style={styles.submitBtnText}>{saving ? 'Création…' : 'Créer le match'}</Text>
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
                    .filter((id) => !invitedMatchPlayers[id]);
                  setInvitedMatchPlayers((prev) => {
                    const next = { ...prev };
                    toAdd.forEach((id) => (next[id] = defaultPlayerStats()));
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
  screenTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 },
  screenSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#dc2626' },
  chipMatch: { backgroundColor: '#dc2626' },
  chipText: { fontSize: 14, fontWeight: '500', color: '#374151' },
  chipTextActive: { color: '#fff' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 72,
    textAlign: 'center',
  },
  scoreSeparator: { fontSize: 18, fontWeight: '600', color: '#6b7280' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 8, marginBottom: 4, color: '#111' },
  sectionHint: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  loader: { marginVertical: 16 },
  emptyText: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  playerList: { marginBottom: 8 },
  playerRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerInfo: { flexDirection: 'row', alignItems: 'center' },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  numberText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  playerName: { fontSize: 15, fontWeight: '600', color: '#111' },
  convoqueLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  convoqueText: { fontSize: 14, color: '#6b7280' },
  errorText: { fontSize: 14, color: '#dc2626', marginTop: 12 },
  submitBtn: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16 },
  modalDone: { fontSize: 17, fontWeight: '600', color: '#dc2626' },
  pickerWrapper: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    minHeight: 220,
    width: '100%',
  },
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
  invitedMatchRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  invitedPlayerName: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  statCell: { flex: 1 },
  statLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  statInput: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
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
