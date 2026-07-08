import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../../contexts/ActiveSeasonContext';
import {
  getPlayerById,
  getPlayerStats,
  getPlayerTeams,
  getPlayerRadarStats,
  updatePlayer,
  addPlayerToTeam,
  removePlayerFromTeam,
  type MatchTypeFilter,
  type PlayerRadarResult,
} from '../../../lib/services/players';
import { getTrainingsByTeam } from '../../../lib/services/trainings';
import { getPlayerFeedbackHistory, type PlayerFeedbackRow } from '../../../lib/services/feedback';
import { supabase } from '../../../lib/supabase';
import type { Player, Team, PlayerEvent } from '../../../types';
import { PlayerDetailView, type TrainingSession, type PlayerStats } from '../../../components/PlayerDetailView';

export default function PlayerDetailScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const router = useRouter();
  const { activeTeamId, teams: allTeams } = useActiveTeam();
  const { activeSeason } = useActiveSeason();

  const [player, setPlayer]           = useState<Player | null>(null);
  const [playerTeams, setPlayerTeams] = useState<Team[]>([]);
  const [stats, setStats]             = useState<PlayerStats | null>(null);
  const [allSessions, setAllSessions] = useState<TrainingSession[]>([]);
  const [initialEvents, setInitialEvents] = useState<PlayerEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [matchFilter, setMatchFilter] = useState<MatchTypeFilter>('all');
  const [updatingTeamId, setUpdatingTeamId] = useState<string | null>(null);

  const [radarData, setRadarData]       = useState<PlayerRadarResult | null>(null);
  const [radarLoading, setRadarLoading] = useState(false);
  const [feedbackRows, setFeedbackRows]       = useState<PlayerFeedbackRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // ── Modal édition joueur ──────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: '', last_name: '', birth_date: '',
    position: '', strong_foot: '', status: '',
    number: '', sequence_time_limit: '',
  });
  const [savingPlayer, setSavingPlayer] = useState(false);

  // ── Chargement données ────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!playerId) return;
    setError(null);
    try {
      const [playerData, teamsData, eventsRes] = await Promise.all([
        getPlayerById(playerId),
        getPlayerTeams(playerId),
        supabase.from('player_events').select('*').eq('player_id', playerId).order('event_date', { ascending: false }),
      ]);
      setPlayer(playerData ?? null);
      setPlayerTeams(teamsData ?? []);
      setInitialEvents((eventsRes.data ?? []) as PlayerEvent[]);
      if (!playerData) { setError('Joueur introuvable'); return; }
      if (activeTeamId) {
        const trainings = await getTrainingsByTeam(activeTeamId, activeSeason);
        const sorted = [...(trainings ?? [])].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setAllSessions(
          sorted.map(t => ({
            date: t.date,
            status: (t.attendance?.[playerId] ?? 'not_recorded') as TrainingSession['status'],
          }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [playerId, activeTeamId, activeSeason]);

  useEffect(() => { setLoading(true); loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!playerId || !activeTeamId) return;
    getPlayerStats(playerId, activeTeamId, matchFilter).then(setStats).catch(() => setStats(null));
    setRadarLoading(true);
    getPlayerRadarStats(playerId, activeTeamId, matchFilter)
      .then(setRadarData)
      .catch(() => setRadarData(null))
      .finally(() => setRadarLoading(false));
  }, [playerId, activeTeamId, matchFilter]);

  useEffect(() => {
    if (!playerId) return;
    setFeedbackLoading(true);
    getPlayerFeedbackHistory(playerId)
      .then(setFeedbackRows)
      .catch(() => setFeedbackRows([]))
      .finally(() => setFeedbackLoading(false));
  }, [playerId]);

  // ── Gestion équipes ───────────────────────────────────────────────────────

  const handleAddToTeam = useCallback(async (teamId: string) => {
    if (!playerId) return;
    setUpdatingTeamId(teamId);
    try {
      await addPlayerToTeam(playerId, teamId);
      const team = allTeams.find(t => t.id === teamId);
      if (team) setPlayerTeams(prev => [...prev, team].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'assigner');
    } finally { setUpdatingTeamId(null); }
  }, [playerId, allTeams]);

  const handleRemoveFromTeam = useCallback((team: Team) => {
    if (!playerId) return;
    Alert.alert('Retirer de l\'équipe', `Retirer de ${team.name} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer', style: 'destructive',
        onPress: async () => {
          setUpdatingTeamId(team.id);
          try {
            await removePlayerFromTeam(playerId, team.id);
            setPlayerTeams(prev => prev.filter(t => t.id !== team.id));
          } catch (e) {
            Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de retirer');
          } finally { setUpdatingTeamId(null); }
        },
      },
    ]);
  }, [playerId]);

  // ── Édition joueur ────────────────────────────────────────────────────────

  const openEditModal = () => {
    if (!player) return;
    setEditForm({
      first_name:          player.first_name,
      last_name:           player.last_name,
      birth_date:          player.birth_date ?? '',
      position:            player.position ?? '',
      strong_foot:         player.strong_foot ?? '',
      status:              player.status ?? 'Actif',
      number:              player.number != null ? String(player.number) : '',
      sequence_time_limit: player.sequence_time_limit != null ? String(player.sequence_time_limit) : '',
    });
    setShowEditModal(true);
  };

  const handleSavePlayer = async () => {
    if (!playerId) return;
    setSavingPlayer(true);
    try {
      const updated = await updatePlayer(playerId, {
        first_name:          editForm.first_name.trim(),
        last_name:           editForm.last_name.trim(),
        birth_date:          editForm.birth_date || undefined,
        position:            editForm.position || undefined,
        strong_foot:         editForm.strong_foot || undefined,
        status:              editForm.status || undefined,
        number:              editForm.number ? Number(editForm.number) : undefined,
        sequence_time_limit: editForm.sequence_time_limit ? Number(editForm.sequence_time_limit) : undefined,
      });
      setPlayer(updated);
      setShowEditModal(false);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'enregistrer');
    } finally {
      setSavingPlayer(false);
    }
  };

  // ── États ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );

  if (error || !player) return (
    <View style={styles.centered}>
      <Text style={styles.errorText}>{error || 'Joueur introuvable'}</Text>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtnFallback}>
        <Text style={styles.backBtnFallbackText}>Retour</Text>
      </TouchableOpacity>
    </View>
  );

  const availableTeams = allTeams.filter(t => !playerTeams.some(pt => pt.id === t.id));

  return (
    <>
      <PlayerDetailView
        player={player}
        playerTeams={playerTeams}
        availableTeams={availableTeams}
        stats={stats}
        radarData={radarData}
        radarLoading={radarLoading}
        feedbackRows={feedbackRows}
        feedbackLoading={feedbackLoading}
        allSessions={allSessions}
        initialEvents={initialEvents}
        matchFilter={matchFilter}
        updatingTeamId={updatingTeamId}
        isManager={true}
        onMatchFilterChange={setMatchFilter}
        onBack={() => router.back()}
        onEdit={openEditModal}
        onAddToTeam={handleAddToTeam}
        onRemoveFromTeam={handleRemoveFromTeam}
      />

      {/* ── Modal édition joueur (coach seulement) ── */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowEditModal(false)}>
            <View style={styles.editModalBox} onStartShouldSetResponder={() => true}>
              <View style={styles.editModalHeader}>
                <Text style={styles.editModalTitle}>Modifier le joueur</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Ionicons name="close" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.editRow}>
                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>Prénom</Text>
                    <TextInput style={styles.editInput} value={editForm.first_name} onChangeText={v => setEditForm(f => ({ ...f, first_name: v }))} placeholder="Prénom" placeholderTextColor="#94a3b8" />
                  </View>
                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>Nom</Text>
                    <TextInput style={styles.editInput} value={editForm.last_name} onChangeText={v => setEditForm(f => ({ ...f, last_name: v }))} placeholder="Nom" placeholderTextColor="#94a3b8" />
                  </View>
                </View>
                <View style={styles.editRow}>
                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>Date de naissance (AAAA-MM-JJ)</Text>
                    <TextInput style={styles.editInput} value={editForm.birth_date} onChangeText={v => setEditForm(f => ({ ...f, birth_date: v }))} keyboardType="numbers-and-punctuation" placeholder="2000-05-15" placeholderTextColor="#94a3b8" />
                  </View>
                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>Numéro</Text>
                    <TextInput style={styles.editInput} value={editForm.number} onChangeText={v => setEditForm(f => ({ ...f, number: v.replace(/\D/g, '') }))} keyboardType="numeric" placeholder="10" placeholderTextColor="#94a3b8" />
                  </View>
                </View>
                <Text style={styles.editLabel}>Position</Text>
                <View style={styles.editChipRow}>
                  {['Gardien', 'Ailier', 'Meneur', 'Pivot'].map(p => (
                    <TouchableOpacity key={p} style={[styles.editChip, editForm.position === p && styles.editChipActive]} onPress={() => setEditForm(f => ({ ...f, position: p }))} activeOpacity={0.7}>
                      <Text style={[styles.editChipText, editForm.position === p && styles.editChipTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.editLabel}>Pied fort</Text>
                <View style={styles.editChipRow}>
                  {['Droit', 'Gauche', 'Les deux'].map(f => (
                    <TouchableOpacity key={f} style={[styles.editChip, editForm.strong_foot === f && styles.editChipActive]} onPress={() => setEditForm(ef => ({ ...ef, strong_foot: f }))} activeOpacity={0.7}>
                      <Text style={[styles.editChipText, editForm.strong_foot === f && styles.editChipTextActive]}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.editLabel}>Statut</Text>
                <View style={styles.editChipRow}>
                  {['Actif', 'Blessé', 'Suspendu'].map(s => (
                    <TouchableOpacity key={s} style={[styles.editChip, editForm.status === s && styles.editChipActive]} onPress={() => setEditForm(f => ({ ...f, status: s }))} activeOpacity={0.7}>
                      <Text style={[styles.editChipText, editForm.status === s && styles.editChipTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.editLabel}>Limite séquence (min)</Text>
                <TextInput
                  style={[styles.editInput, { marginBottom: 20 }]}
                  value={editForm.sequence_time_limit}
                  onChangeText={v => setEditForm(f => ({ ...f, sequence_time_limit: v.replace(/\D/g, '') }))}
                  keyboardType="numeric"
                  placeholder="ex : 10"
                  placeholderTextColor="#94a3b8"
                />
                <TouchableOpacity style={[styles.saveBtn, savingPlayer && { opacity: 0.6 }]} onPress={handleSavePlayer} disabled={savingPlayer} activeOpacity={0.8}>
                  {savingPlayer ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  centered:            { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText:           { fontSize: 14, color: '#dc2626', marginBottom: 12 },
  backBtnFallback:     { marginTop: 12, paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#2563eb' },
  backBtnFallbackText: { color: '#fff', fontWeight: '600' },

  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  editModalBox:    { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' },
  editModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  editModalTitle:  { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  editRow:         { flexDirection: 'row', gap: 10, marginBottom: 14 },
  editField:       { flex: 1 },
  editLabel:       { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  editInput:       { backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14 },
  editChipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  editChip:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  editChipActive:  { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  editChipText:    { fontSize: 13, fontWeight: '600', color: '#64748b' },
  editChipTextActive: { color: '#2563eb' },
  saveBtn:     { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
