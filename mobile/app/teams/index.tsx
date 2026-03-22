import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { getUserClubId } from '../../lib/services/clubs';
import {
  getTeamsByClubId,
  createTeam,
  updateTeam,
  deleteTeam,
  type TeamFormData,
} from '../../lib/services/teams';
import type { Team } from '../../types';

const DEFAULT_FORM: TeamFormData = {
  name: '',
  category: 'Senior',
  level: 'A',
  color: '#3b82f6',
};

const COLOR_OPTIONS = ['#3b82f6', '#16a34a', '#ea580c', '#dc2626', '#7c3aed', '#0891b2'];

export default function TeamsScreen() {
  const { teams: activeTeamList, activeTeamId, setActiveTeamId, refetchTeams } = useActiveTeam();
  const [clubId, setClubId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [form, setForm] = useState<TeamFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const cid = await getUserClubId();
      setClubId(cid);
      if (!cid) {
        setTeams([]);
        setError(null);
        return;
      }
      setError(null);
      const data = await getTeamsByClubId(cid);
      setTeams(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
      setTeams([]);
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
    load().then(() => refetchTeams());
  }, [load, refetchTeams]);

  const openCreate = useCallback(() => {
    setEditingTeam(null);
    setForm(DEFAULT_FORM);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((team: Team) => {
    setEditingTeam(team);
    setForm({
      name: team.name,
      category: team.category || 'Senior',
      level: team.level || 'A',
      color: team.color || '#3b82f6',
    });
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingTeam(null);
    setForm(DEFAULT_FORM);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      Alert.alert('Champ requis', "Nom de l'équipe obligatoire.");
      return;
    }
    if (!clubId && !editingTeam) {
      Alert.alert('Erreur', "Aucun club associé. Créez un club d'abord.");
      return;
    }
    setSaving(true);
    try {
      if (editingTeam) {
        await updateTeam(editingTeam.id, form);
        setTeams((prev) =>
          prev.map((t) => (t.id === editingTeam.id ? { ...t, ...form } : t))
        );
      } else if (clubId) {
        const created = await createTeam(clubId, form);
        setTeams((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      refetchTeams();
      closeModal();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer");
    } finally {
      setSaving(false);
    }
  }, [form, clubId, editingTeam, closeModal, refetchTeams]);

  const handleDelete = useCallback(
    (team: Team) => {
      Alert.alert(
        "Supprimer l'équipe",
        `Supprimer « ${team.name} » ? Les joueurs ne seront pas supprimés.`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteTeam(team.id);
                setTeams((prev) => prev.filter((t) => t.id !== team.id));
                if (activeTeamId === team.id) {
                  const rest = teams.filter((t) => t.id !== team.id);
                  if (rest.length > 0) await setActiveTeamId(rest[0].id);
                }
                refetchTeams();
              } catch (e) {
                Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de supprimer');
              }
            },
          },
        ]
      );
    },
    [activeTeamId, teams, setActiveTeamId, refetchTeams]
  );

  if (loading && teams.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!clubId) {
    return (
      <View style={styles.centered}>
        <Ionicons name="trophy-outline" size={48} color="#94a3b8" />
        <Text style={styles.noClubTitle}>Aucun club</Text>
        <Text style={styles.noClubText}>
          Créez un club depuis l'accueil pour gérer vos équipes.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />
        }
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.header}>
          <Text style={styles.title}>Équipes du club</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.addBtnText}>Ajouter</Text>
          </TouchableOpacity>
        </View>

        {teams.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune équipe.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openCreate}>
              <Text style={styles.emptyBtnText}>Créer une équipe</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {teams.map((team) => (
              <View
                key={team.id}
                style={[
                  styles.card,
                  activeTeamId === team.id && styles.cardActive,
                ]}
              >
                <View style={[styles.cardStrip, { backgroundColor: team.color || '#3b82f6' }]} />
                <View style={styles.cardBody}>
                  <View style={styles.cardMain}>
                    <Text style={styles.teamName}>{team.name}</Text>
                    <Text style={styles.teamMeta}>
                      {team.category} – Niveau {team.level}
                    </Text>
                    {activeTeamId === team.id && (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>Équipe active</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => openEdit(team)}
                    >
                      <Ionicons name="pencil-outline" size={22} color="#475569" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => handleDelete(team)}
                    >
                      <Ionicons name="trash-outline" size={22} color="#dc2626" />
                    </TouchableOpacity>
                    {activeTeamId !== team.id && (
                      <TouchableOpacity
                        style={styles.setActiveBtn}
                        onPress={() => setActiveTeamId(team.id)}
                      >
                        <Text style={styles.setActiveBtnText}>Définir active</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeModal}
        >
          <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>
              {editingTeam ? "Modifier l'équipe" : 'Nouvelle équipe'}
            </Text>

            <Text style={styles.label}>Nom</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
              placeholder="Ex. U18"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.label}>Catégorie</Text>
            <TextInput
              style={styles.input}
              value={form.category}
              onChangeText={(t) => setForm((f) => ({ ...f, category: t }))}
              placeholder="Senior"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.label}>Niveau</Text>
            <TextInput
              style={styles.input}
              value={form.level}
              onChangeText={(t) => setForm((f) => ({ ...f, level: t }))}
              placeholder="A"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.label}>Couleur</Text>
            <View style={styles.colorRow}>
              {COLOR_OPTIONS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    form.color === c && styles.colorDotSelected,
                  ]}
                  onPress={() => setForm((f) => ({ ...f, color: c }))}
                />
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
  noClubTitle: { fontSize: 18, fontWeight: '600', color: '#334155', marginTop: 12 },
  noClubText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: { fontSize: 15, color: '#64748b', marginBottom: 16 },
  emptyBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600' },
  list: { gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  cardActive: {
    borderColor: '#3b82f6',
    borderWidth: 2,
  },
  cardStrip: { height: 4 },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  cardMain: { flex: 1 },
  teamName: { fontSize: 17, fontWeight: '600', color: '#1e293b' },
  teamMeta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  activeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  activeBadgeText: { fontSize: 12, fontWeight: '600', color: '#1d4ed8' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 8 },
  setActiveBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  setActiveBtnText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#475569', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 14,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#1e293b',
    borderWidth: 3,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelBtnText: { fontSize: 15, color: '#64748b', fontWeight: '500' },
  saveBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
