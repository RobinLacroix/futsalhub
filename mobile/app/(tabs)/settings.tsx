import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Modal, Share, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import {
  getUserClubId, getClubInfo, updateClubInfo, deleteClub,
  getClubMembersWithProfiles, removeClubMember, createClubInvitation,
  updateClubMemberTeam, ClubMemberWithUser,
} from '../../lib/services/clubs';
import { getTeamsByClubId } from '../../lib/services/teams';
import type { Team } from '../../types';

type ClubInfo = { id: string; name: string; description: string | null };

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  coach: 'Coach',
  viewer: 'Observateur',
};
const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin:  { bg: '#eff6ff', text: '#2563eb' },
  coach:  { bg: '#f0fdf4', text: '#16a34a' },
  viewer: { bg: '#f8fafc', text: '#64748b' },
};
const ROLE_HINTS: Record<string, string> = {
  admin:  'Acces complet : gestion du club, des equipes et des membres.',
  coach:  'Acces aux entrainements, matchs et effectif de ses equipes.',
  viewer: 'Acces en lecture seule aux donnees du club.',
};

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [members, setMembers] = useState<ClubMemberWithUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'coach' | 'viewer'>('coach');
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [reassignMember, setReassignMember] = useState<ClubMemberWithUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const id = await getUserClubId();
      setClubId(id);
      if (!id) return;
      const [clubData, membersData, teamsData] = await Promise.all([
        getClubInfo(id),
        getClubMembersWithProfiles(id),
        getTeamsByClubId(id),
      ]);
      setClub(clubData);
      setEditName(clubData?.name ?? '');
      setEditDesc(clubData?.description ?? '');
      setMembers(membersData);
      setTeams(teamsData);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const me = membersData.find((m) => m.user_id === user.id);
        setIsAdmin(me?.role === 'admin');
      }
    } catch (e) {
      console.error('settings load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveClub = async () => {
    if (!clubId || !editName.trim()) {
      Alert.alert('Champ requis', 'Le nom du club est obligatoire.');
      return;
    }
    setSaving(true);
    try {
      await updateClubInfo(clubId, { name: editName.trim(), description: editDesc.trim() || null });
      setClub((prev) => prev ? { ...prev, name: editName.trim(), description: editDesc.trim() || null } : prev);
      Alert.alert('Enregistre', 'Les informations du club ont ete mises a jour.');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de sauvegarder.');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!clubId || !inviteEmail.trim()) {
      Alert.alert('Champ requis', 'Veuillez saisir un email.');
      return;
    }
    if (inviteRole === 'coach' && !inviteTeamId) {
      Alert.alert('Équipe requise', 'Choisissez l\'équipe que ce coach va gérer.');
      return;
    }
    setInviting(true);
    try {
      const token = await createClubInvitation(
        clubId,
        inviteEmail.trim().toLowerCase(),
        inviteRole,
        inviteRole === 'coach' ? inviteTeamId : null,
      );
      setGeneratedToken(token);
      setInviteEmail('');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de creer l\'invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleShareToken = async (token: string) => {
    try {
      await Share.share({
        message: `Tu es invite a rejoindre le club ${club?.name ?? ''} sur FutsalHub.\nCode d\'invitation : ${token}`,
        title: 'Invitation FutsalHub',
      });
    } catch {}
  };

  const handleRemoveMember = (member: ClubMemberWithUser) => {
    const label = member.first_name
      ? `${member.first_name} ${member.last_name ?? ''}`.trim()
      : (member.email ?? 'ce membre');
    Alert.alert('Retirer ce membre', `Retirer ${label} du club ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeClubMember(member.id);
            setMembers((prev) => prev.filter((m) => m.id !== member.id));
          } catch (e) {
            Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de retirer ce membre.');
          }
        },
      },
    ]);
  };

  const handleDeleteClub = () => {
    Alert.alert(
      'Supprimer le club',
      `Cette action est irreversible. Toutes les donnees du club "${club?.name ?? ''}" seront supprimees.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer definitivement',
          style: 'destructive',
          onPress: async () => {
            if (!clubId) return;
            try {
              await deleteClub(clubId);
              Alert.alert('Club supprime', 'Votre club a ete supprime.', [
                { text: 'OK', onPress: () => router.replace('/(tabs)') },
              ]);
            } catch (e) {
              Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de supprimer le club.');
            }
          },
        },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert('Deconnexion', 'Voulez-vous vous deconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Deconnexion',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  const closeInviteModal = () => {
    setInviteVisible(false);
    setGeneratedToken(null);
    setInviteEmail('');
    setInviteRole('coach');
    setInviteTeamId(null);
  };

  const handleReassignTeam = async (member: ClubMemberWithUser, teamId: string | null) => {
    setReassignMember(null);
    try {
      await updateClubMemberTeam(member.id, teamId);
      setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, team_id: teamId } : m));
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de changer l\'équipe.');
    }
  };

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  if (!clubId) {
    return (
      <View style={s.centered}>
        <Ionicons name="business-outline" size={52} color="#cbd5e1" />
        <Text style={s.noClubTitle}>Aucun club associe</Text>
        <Text style={s.noClubSub}>Creez ou rejoignez un club depuis l'accueil.</Text>
      </View>
    );
  }

  const teamById = new Map(teams.map((t) => [t.id, t]));

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll}>

      {/* ── Club info ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.accent, { backgroundColor: '#1e3a5f' }]} />
          <Ionicons name="business-outline" size={18} color="#1e3a5f" />
          <Text style={s.cardTitle}>Informations du club</Text>
        </View>
        <View style={s.cardBody}>
          <Text style={s.label}>Nom du club</Text>
          <TextInput
            style={[s.input, !isAdmin && s.inputDisabled]}
            value={editName}
            onChangeText={setEditName}
            placeholder="Nom du club"
            placeholderTextColor="#9ca3af"
            editable={isAdmin}
          />
          <Text style={[s.label, { marginTop: 14 }]}>Description</Text>
          <TextInput
            style={[s.input, { minHeight: 72, textAlignVertical: 'top' }, !isAdmin && s.inputDisabled]}
            value={editDesc}
            onChangeText={setEditDesc}
            placeholder="Description du club (optionnel)"
            placeholderTextColor="#9ca3af"
            multiline
            editable={isAdmin}
          />
          {isAdmin && (
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, saving && { opacity: 0.6 }, { marginTop: 14 }]}
              onPress={handleSaveClub}
              disabled={saving}
            >
              <Text style={s.btnPrimaryText}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Members ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.accent, { backgroundColor: '#7c3aed' }]} />
          <Ionicons name="people-outline" size={18} color="#7c3aed" />
          <Text style={s.cardTitle}>Membres du club</Text>
          {isAdmin && (
            <TouchableOpacity
              style={s.headerPill}
              onPress={() => { setGeneratedToken(null); setInviteVisible(true); }}
            >
              <Ionicons name="person-add-outline" size={13} color="#7c3aed" />
              <Text style={[s.headerPillText, { color: '#7c3aed' }]}>Inviter</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={s.cardBody}>
          {members.length === 0 ? (
            <Text style={s.emptyText}>Aucun membre trouve.</Text>
          ) : (
            members.map((member) => {
              const colors = ROLE_COLORS[member.role] ?? ROLE_COLORS.viewer;
              const name = member.first_name
                ? `${member.first_name} ${member.last_name ?? ''}`.trim()
                : (member.email ?? 'Inconnu');
              return (
                <View key={member.id} style={s.memberRow}>
                  <View style={s.memberAvatar}>
                    <Ionicons name="person" size={16} color="#94a3b8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName} numberOfLines={1}>{name}</Text>
                    {member.email && member.first_name && (
                      <Text style={s.memberEmail} numberOfLines={1}>{member.email}</Text>
                    )}
                    {member.role === 'coach' && (
                      <TouchableOpacity
                        disabled={!isAdmin}
                        onPress={() => setReassignMember(member)}
                        style={s.teamPill}
                      >
                        <Ionicons name="shield-outline" size={11} color="#16a34a" />
                        <Text style={s.teamPillText} numberOfLines={1}>
                          {member.team_id ? (teamById.get(member.team_id)?.name ?? 'Équipe inconnue') : 'Aucune équipe'}
                        </Text>
                        {isAdmin && <Ionicons name="chevron-down" size={11} color="#94a3b8" />}
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={[s.roleBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[s.roleBadgeText, { color: colors.text }]}>
                      {ROLE_LABELS[member.role] ?? member.role}
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => handleRemoveMember(member)} style={s.removeBtn}>
                      <Ionicons name="trash-outline" size={16} color="#dc2626" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* ── Account ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.accent, { backgroundColor: '#0891b2' }]} />
          <Ionicons name="person-circle-outline" size={18} color="#0891b2" />
          <Text style={s.cardTitle}>Compte</Text>
        </View>
        <View style={s.cardBody}>
          <TouchableOpacity style={s.actionRow} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={[s.actionRowText, { color: '#ef4444' }]}>Deconnexion</Text>
            <Ionicons name="chevron-forward" size={16} color="#e2e8f0" style={{ marginLeft: 'auto' as any }} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Danger zone ── */}
      {isAdmin && (
        <View style={[s.card, { borderColor: '#fee2e2' }]}>
          <View style={s.cardHeader}>
            <View style={[s.accent, { backgroundColor: '#dc2626' }]} />
            <Ionicons name="warning-outline" size={18} color="#dc2626" />
            <Text style={[s.cardTitle, { color: '#dc2626' }]}>Zone de danger</Text>
          </View>
          <View style={s.cardBody}>
            <Text style={s.dangerDesc}>
              La suppression du club est irreversible et effacera toutes les donnees associees (equipes, joueurs, matchs, entrainements).
            </Text>
            <TouchableOpacity style={s.dangerBtn} onPress={handleDeleteClub}>
              <Ionicons name="trash" size={16} color="#dc2626" />
              <Text style={s.dangerBtnText}>Supprimer le club</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />

      {/* ── Invite modal ── */}
      <Modal visible={inviteVisible} transparent animationType="slide" onRequestClose={closeInviteModal}>
        <Pressable style={s.modalOverlay} onPress={closeInviteModal}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Inviter un membre</Text>

            {generatedToken ? (
              <>
                <Text style={s.modalSub}>
                  Code d'invitation genere. Partagez-le avec la personne invitee :
                </Text>
                <View style={s.tokenBox}>
                  <Text style={s.tokenText} selectable>{generatedToken}</Text>
                </View>
                <TouchableOpacity
                  style={[s.btn, s.btnPrimary, { marginBottom: 10 }]}
                  onPress={() => handleShareToken(generatedToken)}
                >
                  <Ionicons name="share-social-outline" size={16} color="#fff" />
                  <Text style={s.btnPrimaryText}>Partager le code</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, s.btnSecondary]}
                  onPress={() => { setGeneratedToken(null); setInviteEmail(''); }}
                >
                  <Text style={s.btnSecondaryText}>Nouvelle invitation</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.label}>Email</Text>
                <TextInput
                  style={[s.input, { marginBottom: 14 }]}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="email@exemple.com"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={s.label}>Role</Text>
                <View style={s.roleRow}>
                  {(['admin', 'coach', 'viewer'] as const).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[s.roleOption, inviteRole === r && s.roleOptionActive]}
                      onPress={() => setInviteRole(r)}
                    >
                      <Text style={[s.roleOptionText, inviteRole === r && s.roleOptionTextActive]}>
                        {ROLE_LABELS[r]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.roleHint}>{ROLE_HINTS[inviteRole]}</Text>
                {inviteRole === 'coach' && (
                  <>
                    <Text style={[s.label, { marginTop: 14 }]}>Équipe gérée</Text>
                    {teams.length === 0 ? (
                      <Text style={s.roleHint}>Aucune équipe. Créez d'abord une équipe pour y affecter un coach.</Text>
                    ) : (
                      <View style={s.teamGrid}>
                        {teams.map((t) => (
                          <TouchableOpacity
                            key={t.id}
                            style={[s.teamOption, inviteTeamId === t.id && s.teamOptionActive]}
                            onPress={() => setInviteTeamId(t.id)}
                          >
                            <View style={[s.teamDot, { backgroundColor: t.color || '#94a3b8' }]} />
                            <Text style={[s.teamOptionText, inviteTeamId === t.id && s.teamOptionTextActive]} numberOfLines={1}>
                              {t.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                )}
                <TouchableOpacity
                  style={[s.btn, s.btnPrimary, inviting && { opacity: 0.6 }, { marginTop: 14 }]}
                  onPress={handleInvite}
                  disabled={inviting}
                >
                  {inviting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.btnPrimaryText}>Creer l'invitation</Text>}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={s.modalClose} onPress={closeInviteModal}>
              <Text style={s.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Reassign team modal ── */}
      <Modal visible={!!reassignMember} transparent animationType="slide" onRequestClose={() => setReassignMember(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setReassignMember(null)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Équipe gérée</Text>
            <Text style={s.modalSub}>
              Choisissez l'équipe gérée par {reassignMember?.first_name
                ? `${reassignMember.first_name} ${reassignMember.last_name ?? ''}`.trim()
                : (reassignMember?.email ?? 'ce coach')}.
            </Text>
            {teams.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[s.reassignRow, reassignMember?.team_id === t.id && s.reassignRowActive]}
                onPress={() => reassignMember && handleReassignTeam(reassignMember, t.id)}
              >
                <View style={[s.teamDot, { backgroundColor: t.color || '#94a3b8' }]} />
                <Text style={s.reassignRowText}>{t.name}</Text>
                {reassignMember?.team_id === t.id && (
                  <Ionicons name="checkmark" size={18} color="#16a34a" style={{ marginLeft: 'auto' as any }} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[s.reassignRow, !reassignMember?.team_id && s.reassignRowActive]}
              onPress={() => reassignMember && handleReassignTeam(reassignMember, null)}
            >
              <View style={[s.teamDot, { backgroundColor: '#cbd5e1' }]} />
              <Text style={s.reassignRowText}>Aucune équipe</Text>
              {!reassignMember?.team_id && (
                <Ionicons name="checkmark" size={18} color="#16a34a" style={{ marginLeft: 'auto' as any }} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.modalClose} onPress={() => setReassignMember(null)}>
              <Text style={s.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  noClubTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  noClubSub: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  accent: { width: 4, height: 20, borderRadius: 3 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  cardBody: { padding: 16 },
  headerPill: {
    marginLeft: 'auto' as any,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  headerPillText: { fontSize: 12, fontWeight: '600' },

  label: { fontSize: 11, fontWeight: '700', color: '#374151', textTransform: 'uppercase' as any, letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  inputDisabled: { backgroundColor: '#f3f4f6', color: '#9ca3af' },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  btnPrimary: { backgroundColor: '#1e3a5f' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSecondary: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  btnSecondaryText: { color: '#475569', fontWeight: '600', fontSize: 14 },

  emptyText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  memberEmail: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  roleBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  removeBtn: { padding: 6 },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  actionRowText: { fontSize: 15, fontWeight: '600' },

  dangerDesc: { fontSize: 13, color: '#6b7280', lineHeight: 19, marginBottom: 14 },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    backgroundColor: '#fff5f5',
  },
  dangerBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: '#e2e8f0', borderRadius: 99,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  modalSub: { fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 19 },
  tokenBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 16,
  },
  tokenText: { fontSize: 13, color: '#1e293b', fontFamily: 'monospace' as any, lineHeight: 20 },

  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  roleOption: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center',
  },
  roleOptionActive: { borderColor: '#1e3a5f', backgroundColor: '#eff6ff' },
  roleOptionText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  roleOptionTextActive: { color: '#1e3a5f' },
  roleHint: { fontSize: 12, color: '#94a3b8', lineHeight: 17 },

  // Team pill on coach member rows
  teamPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
    alignSelf: 'flex-start', backgroundColor: '#f0fdf4', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, maxWidth: '100%',
  },
  teamPillText: { fontSize: 11, fontWeight: '600', color: '#16a34a', flexShrink: 1 },

  // Team selector (invite modal)
  teamGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  teamOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  teamOptionActive: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  teamDot: { width: 10, height: 10, borderRadius: 5 },
  teamOptionText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  teamOptionTextActive: { color: '#16a34a' },

  // Reassign modal rows
  reassignRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8,
  },
  reassignRowActive: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  reassignRowText: { fontSize: 14, fontWeight: '600', color: '#334155' },

  modalClose: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 14, color: '#94a3b8', fontWeight: '500' },
});
