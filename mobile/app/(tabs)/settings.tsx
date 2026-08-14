import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, Share, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import {
  getUserClubId,
  getClubInfo,
  updateClubInfo,
  deleteClub,
  getClubMembersWithProfiles,
  removeClubMember,
  createClubInvitation,
  setCoachTeams,
  ClubMemberWithUser,
} from '../../lib/services/clubs';
import { getTeamsByClubId } from '../../lib/services/teams';
import { RatingScaleEditor } from '../../components/RatingScaleEditor';
import { NotificationPreferencesEditor } from '../../components/NotificationPreferencesEditor';
import {
  Text,
  Card,
  Button,
  Badge,
  Input,
  Field,
  ChipGroup,
  Sheet,
  EmptyState,
  SkeletonDetail,
  type ChipOption,
  type BadgeTone,
} from '../../components/ui';
import type { Team } from '../../types';

type ClubInfo = { id: string; name: string; description: string | null };
type Role = 'admin' | 'coach' | 'viewer';

/** Un coach consolidé : une entrée par utilisateur, avec toutes ses équipes. */
type CoachGroup = {
  userId: string;
  name: string;
  email: string | null;
  teamIds: string[];
  memberIds: string[];
};

type DisplayMember =
  | { kind: 'single'; member: ClubMemberWithUser }
  | { kind: 'coach'; group: CoachGroup };

/**
 * Le rôle porte un niveau de droits, pas une identité visuelle : la teinte
 * suit la rampe sémantique. Avant, les trois rôles avaient trois couleurs
 * décoratives (bleu, vert, ardoise) sans rapport avec ce qu'elles signifiaient,
 * et le vert d'« Observateur » suggérait à tort une validation.
 */
const ROLE_META: Record<Role, { label: string; tone: BadgeTone; hint: string }> = {
  admin: {
    label: 'Admin',
    tone: 'accent',
    hint: 'Accès complet : gestion du club, des équipes et des membres.',
  },
  coach: {
    label: 'Coach',
    tone: 'neutral',
    hint: 'Accès aux entraînements, matchs et effectif de ses équipes.',
  },
  viewer: {
    label: 'Observateur',
    tone: 'neutral',
    hint: 'Accès en lecture seule aux données du club.',
  },
};

const ROLE_OPTIONS: readonly ChipOption<Role>[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'coach', label: 'Coach' },
  { value: 'viewer', label: 'Observateur' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;

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
  const [inviteRole, setInviteRole] = useState<Role>('coach');
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  const [reassignCoach, setReassignCoach] = useState<CoachGroup | null>(null);
  const [reassignSelected, setReassignSelected] = useState<string[]>([]);
  const [reassignSaving, setReassignSaving] = useState(false);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ── Chargement ────────────────────────────────────────────────────────────

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setIsAdmin(membersData.find((m) => m.user_id === user.id)?.role === 'admin');
    } catch (e) {
      console.error('settings load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Consolide les membres : une seule entrée par coach, regroupant ses équipes.
  const displayMembers = useMemo<DisplayMember[]>(() => {
    const list: DisplayMember[] = [];
    const coachIndex = new Map<string, number>();
    for (const m of members) {
      if (m.role !== 'coach') {
        list.push({ kind: 'single', member: m });
        continue;
      }
      const idx = coachIndex.get(m.user_id);
      if (idx == null) {
        const name = m.first_name
          ? `${m.first_name} ${m.last_name ?? ''}`.trim()
          : m.email ?? 'Inconnu';
        list.push({
          kind: 'coach',
          group: {
            userId: m.user_id,
            name,
            email: m.email ?? null,
            teamIds: m.team_id ? [m.team_id] : [],
            memberIds: [m.id],
          },
        });
        coachIndex.set(m.user_id, list.length - 1);
      } else {
        const g = (list[idx] as { kind: 'coach'; group: CoachGroup }).group;
        if (m.team_id && !g.teamIds.includes(m.team_id)) g.teamIds.push(m.team_id);
        g.memberIds.push(m.id);
      }
    }
    return list;
  }, [members]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const saveClub = async () => {
    if (!clubId || !editName.trim()) {
      Alert.alert('Champ requis', 'Le nom du club est obligatoire.');
      return;
    }
    setSaving(true);
    try {
      await updateClubInfo(clubId, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      setClub((prev) =>
        prev ? { ...prev, name: editName.trim(), description: editDesc.trim() || null } : prev
      );
      haptics.success();
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de sauvegarder.');
    } finally {
      setSaving(false);
    }
  };

  const invite = async () => {
    if (!clubId || !inviteEmail.trim()) {
      Alert.alert('Champ requis', 'Veuillez saisir un email.');
      return;
    }
    if (inviteRole === 'coach' && !inviteTeamId) {
      Alert.alert('Équipe requise', "Choisissez l'équipe que ce coach va gérer.");
      return;
    }
    setInviting(true);
    try {
      const token = await createClubInvitation(
        clubId,
        inviteEmail.trim().toLowerCase(),
        inviteRole,
        inviteRole === 'coach' ? inviteTeamId : null
      );
      setGeneratedToken(token);
      setInviteEmail('');
      haptics.success();
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible de créer l'invitation.");
    } finally {
      setInviting(false);
    }
  };

  const shareToken = async (token: string) => {
    try {
      await Share.share({
        message: `Tu es invité à rejoindre le club ${club?.name ?? ''} sur FutsalHub.\nCode d'invitation : ${token}`,
        title: 'Invitation FutsalHub',
      });
    } catch {
      /* partage annulé */
    }
  };

  const removeMember = (label: string, memberIds: string[]) => {
    Alert.alert('Retirer ce membre', `Retirer ${label} du club ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            for (const id of memberIds) await removeClubMember(id);
            setMembers((prev) => prev.filter((m) => !memberIds.includes(m.id)));
            haptics.success();
          } catch (e) {
            haptics.error();
            Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de retirer ce membre.');
          }
        },
      },
    ]);
  };

  const closeInvite = () => {
    setInviteVisible(false);
    setGeneratedToken(null);
    setInviteEmail('');
    setInviteRole('coach');
    setInviteTeamId(null);
  };

  const saveCoachTeams = async () => {
    if (!reassignCoach || !clubId) return;
    setReassignSaving(true);
    try {
      await setCoachTeams(clubId, reassignCoach.userId, reassignSelected);
      setReassignCoach(null);
      haptics.success();
      await load();
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de mettre à jour les équipes.');
    } finally {
      setReassignSaving(false);
    }
  };

  /**
   * Supprimer le club efface équipes, joueurs, matchs et entraînements, sans
   * retour possible. Une simple `Alert` se validait en deux taps depuis
   * n'importe quel geste accidentel. La saisie du nom force à lire ce qu'on
   * détruit et rend l'erreur de manipulation quasi impossible.
   */
  const confirmDelete = async () => {
    if (!clubId || deleteConfirm.trim() !== (club?.name ?? '')) return;
    setDeleting(true);
    try {
      await deleteClub(clubId);
      setDeleteVisible(false);
      router.replace('/(tabs)');
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de supprimer le club.');
    } finally {
      setDeleting(false);
    }
  };

  const signOut = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  // ── États non nominaux ────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <SkeletonDetail />
      </View>
    );
  }

  if (!clubId) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="business-outline"
          title="Aucun club associé"
          description="Créez ou rejoignez un club depuis l'accueil."
          action={{ label: "Aller à l'accueil", onPress: () => router.replace('/(tabs)') }}
        />
      </View>
    );
  }

  const canDelete = deleteConfirm.trim() === (club?.name ?? '') && !deleting;

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
      <ScrollView contentContainerStyle={[styles.content, { gap: theme.space.lg }]}>
        {/* ── Club ─────────────────────────────────────────────────────── */}
        <Card variant="raised" padding="lg" style={{ gap: theme.space.lg }}>
          <View style={styles.cardHeader}>
            <Ionicons name="business-outline" size={18} color={c.text.secondary} />
            <Text variant="headline" style={styles.flex}>
              Informations du club
            </Text>
            {!isAdmin && <Badge label="Lecture seule" size="sm" />}
          </View>

          <Input
            label="Nom du club"
            value={editName}
            onChangeText={setEditName}
            placeholder="Nom du club"
            editable={isAdmin}
          />
          <Input
            label="Description"
            optional
            value={editDesc}
            onChangeText={setEditDesc}
            placeholder="Description du club"
            editable={isAdmin}
            multiline
            inputStyle={styles.multiline}
          />
          {isAdmin && (
            <Button
              label={saving ? 'Enregistrement…' : 'Enregistrer'}
              onPress={saveClub}
              loading={saving}
              disabled={saving}
              block
            />
          )}
        </Card>

        {/* ── Membres ──────────────────────────────────────────────────── */}
        <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
          <View style={styles.cardHeader}>
            <Ionicons name="people-outline" size={18} color={c.text.secondary} />
            <Text variant="headline" style={styles.flex}>
              Membres du club
            </Text>
            {isAdmin && (
              <Button
                label="Inviter"
                icon="person-add-outline"
                variant="secondary"
                size="sm"
                onPress={() => {
                  setGeneratedToken(null);
                  setInviteVisible(true);
                }}
              />
            )}
          </View>

          {displayMembers.length === 0 ? (
            <EmptyState icon="people-outline" title="Aucun membre" compact />
          ) : (
            displayMembers.map((entry, i) => {
              const isCoach = entry.kind === 'coach';
              const role: Role = isCoach ? 'coach' : ((entry.member.role as Role) ?? 'viewer');
              const meta = ROLE_META[role] ?? ROLE_META.viewer;
              const name = isCoach
                ? entry.group.name
                : entry.member.first_name
                  ? `${entry.member.first_name} ${entry.member.last_name ?? ''}`.trim()
                  : entry.member.email ?? 'Inconnu';
              const email = isCoach ? entry.group.email : entry.member.email;
              const key = isCoach ? `coach-${entry.group.userId}` : entry.member.id;

              const teamNames = isCoach
                ? entry.group.teamIds.length > 0
                  ? entry.group.teamIds
                      .map((id) => teamById.get(id)?.name ?? 'Équipe inconnue')
                      .join(' · ')
                  : 'Aucune équipe'
                : null;

              return (
                <View
                  key={key}
                  style={[
                    styles.memberRow,
                    { gap: theme.space.md },
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: c.border.subtle,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: c.bg.sunken, borderRadius: theme.radius.sm },
                    ]}
                  >
                    <Ionicons name="person" size={16} color={c.text.tertiary} />
                  </View>

                  <View style={styles.memberText}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {name}
                    </Text>
                    {email && (
                      <Text variant="caption" tone="tertiary" numberOfLines={1}>
                        {email}
                      </Text>
                    )}
                    {isCoach && (
                      <Pressable
                        disabled={!isAdmin}
                        onPress={() => {
                          setReassignSelected(entry.group.teamIds);
                          setReassignCoach(entry.group);
                        }}
                        accessibilityRole={isAdmin ? 'button' : undefined}
                        accessibilityLabel={
                          isAdmin ? `Équipes de ${name} : ${teamNames}. Modifier` : undefined
                        }
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={[
                          styles.teamPill,
                          {
                            backgroundColor: c.bg.sunken,
                            borderRadius: theme.radius.sm,
                          },
                        ]}
                      >
                        <Ionicons name="shield-outline" size={11} color={c.text.secondary} />
                        <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.flex}>
                          {teamNames}
                        </Text>
                        {isAdmin && (
                          <Ionicons name="chevron-down" size={11} color={c.text.tertiary} />
                        )}
                      </Pressable>
                    )}
                  </View>

                  <Badge label={meta.label} tone={meta.tone} size="sm" />

                  {isAdmin && (
                    <Pressable
                      onPress={() =>
                        removeMember(name, isCoach ? entry.group.memberIds : [entry.member.id])
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer ${name} du club`}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="trash-outline" size={17} color={c.negative.default} />
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </Card>

        <NotificationPreferencesEditor />
        <RatingScaleEditor />

        {/* ── Compte ───────────────────────────────────────────────────── */}
        <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle-outline" size={18} color={c.text.secondary} />
            <Text variant="headline">Compte</Text>
          </View>
          <Button
            label="Déconnexion"
            icon="log-out-outline"
            variant="destructive"
            block
            onPress={signOut}
          />
        </Card>

        {/* ── Zone de danger ───────────────────────────────────────────── */}
        {isAdmin && (
          <Card
            variant="flat"
            padding="lg"
            style={[
              styles.danger,
              { borderColor: c.negative.default, gap: theme.space.md },
            ]}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="warning-outline" size={18} color={c.negative.default} />
              <Text variant="headline" tone="negative">
                Zone de danger
              </Text>
            </View>
            <Text variant="callout" tone="secondary">
              La suppression du club est irréversible. Elle efface toutes les données associées :
              équipes, joueurs, matchs et entraînements.
            </Text>
            <Button
              label="Supprimer le club"
              icon="trash-outline"
              variant="destructive"
              block
              onPress={() => {
                setDeleteConfirm('');
                setDeleteVisible(true);
              }}
            />
          </Card>
        )}

        {/* Accès à la galerie du design system pendant la refonte UI.
            `__DEV__` est faux dans tout build de production : cette entrée ne
            peut pas partir en App Store. À retirer une fois la refonte finie. */}
        {__DEV__ && (
          <Button
            label="Design system (dev)"
            variant="ghost"
            onPress={() => router.push('/design-gallery' as never)}
          />
        )}
      </ScrollView>

      {/* ── Feuille : inviter un membre ────────────────────────────────── */}
      <Sheet
        visible={inviteVisible}
        onClose={closeInvite}
        title="Inviter un membre"
        subtitle={
          generatedToken
            ? 'Partagez ce code avec la personne invitée.'
            : 'Un code sera généré, à transmettre à la personne.'
        }
      >
        {generatedToken ? (
          <View style={{ gap: theme.space.md }}>
            <View
              style={[
                styles.tokenBox,
                {
                  backgroundColor: c.bg.sunken,
                  borderRadius: theme.radius.sm,
                  borderColor: c.border.subtle,
                },
              ]}
            >
              <Text variant="title" numeric selectable accessibilityLabel={`Code : ${generatedToken}`}>
                {generatedToken}
              </Text>
            </View>
            <Button
              label="Partager le code"
              icon="share-social-outline"
              block
              onPress={() => shareToken(generatedToken)}
            />
            <Button
              label="Nouvelle invitation"
              variant="ghost"
              block
              onPress={() => {
                setGeneratedToken(null);
                setInviteEmail('');
              }}
            />
          </View>
        ) : (
          <View style={{ gap: theme.space.lg }}>
            <Input
              label="Email"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="email@exemple.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field label="Rôle" hint={ROLE_META[inviteRole].hint}>
              <ChipGroup
                label="Rôle du membre invité"
                options={ROLE_OPTIONS}
                value={inviteRole}
                onChange={setInviteRole}
              />
            </Field>
            {inviteRole === 'coach' &&
              (teams.length === 0 ? (
                <Field label="Équipe gérée">
                  <Text variant="callout" tone="tertiary">
                    Aucune équipe. Créez d'abord une équipe pour y affecter un coach.
                  </Text>
                </Field>
              ) : (
                <Field label="Équipe gérée">
                  <View style={[styles.teamGrid, { gap: theme.space.sm }]}>
                    {teams.map((t) => {
                      const active = inviteTeamId === t.id;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => setInviteTeamId(t.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active, checked: active }}
                          accessibilityLabel={t.name}
                          style={[
                            styles.teamOption,
                            {
                              borderRadius: theme.radius.pill,
                              paddingHorizontal: theme.space.lg,
                              gap: theme.space.sm,
                              backgroundColor: active ? c.accent.fill : c.bg.sunken,
                              borderColor: active ? c.accent.fill : c.border.subtle,
                            },
                          ]}
                        >
                          <View
                            style={[styles.teamDot, { backgroundColor: t.color || c.text.tertiary }]}
                          />
                          <Text
                            variant="callout"
                            tone={active ? 'onFill' : 'secondary'}
                            weight="600"
                            numberOfLines={1}
                          >
                            {t.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
              ))}
            <Button
              label={inviting ? 'Création…' : "Créer l'invitation"}
              onPress={invite}
              loading={inviting}
              disabled={inviting}
              block
            />
          </View>
        )}
      </Sheet>

      {/* ── Feuille : équipes d'un coach ───────────────────────────────── */}
      <Sheet
        visible={!!reassignCoach}
        onClose={() => setReassignCoach(null)}
        title="Équipes gérées"
        subtitle={`Sélectionnez toutes les équipes gérées par ${reassignCoach?.name ?? 'ce coach'}. Un coach peut en gérer plusieurs.`}
      >
        {teams.length === 0 ? (
          <EmptyState icon="shield-outline" title="Aucune équipe dans ce club" compact />
        ) : (
          <View style={{ gap: theme.space.sm }}>
            {teams.map((t) => {
              const selected = reassignSelected.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() =>
                    setReassignSelected((prev) =>
                      prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                    )
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={t.name}
                  style={[
                    styles.reassignRow,
                    {
                      borderRadius: theme.radius.md,
                      gap: theme.space.md,
                      backgroundColor: selected ? c.accent.subtle : 'transparent',
                      borderColor: selected ? c.accent.border : c.border.subtle,
                    },
                  ]}
                >
                  <View style={[styles.teamDot, { backgroundColor: t.color || c.text.tertiary }]} />
                  <Text variant="body" weight="600" style={styles.flex}>
                    {t.name}
                  </Text>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={selected ? c.accent.default : c.text.tertiary}
                  />
                </Pressable>
              );
            })}
            <Button
              label={reassignSaving ? 'Enregistrement…' : 'Enregistrer les équipes'}
              onPress={saveCoachTeams}
              loading={reassignSaving}
              disabled={reassignSaving}
              block
              style={styles.sheetAction}
            />
          </View>
        )}
      </Sheet>

      {/* ── Feuille : suppression du club ──────────────────────────────── */}
      <Sheet
        visible={deleteVisible}
        onClose={() => setDeleteVisible(false)}
        title="Supprimer le club"
        subtitle="Cette action est irréversible et efface toutes les données du club."
      >
        <View style={{ gap: theme.space.lg }}>
          <Input
            label={`Saisissez « ${club?.name ?? ''} » pour confirmer`}
            value={deleteConfirm}
            onChangeText={setDeleteConfirm}
            placeholder={club?.name ?? ''}
            autoCapitalize="none"
            autoCorrect={false}
            error={
              deleteConfirm.length > 0 && !canDelete && !deleting
                ? 'Le nom ne correspond pas.'
                : undefined
            }
          />
          <Button
            label={deleting ? 'Suppression…' : 'Supprimer définitivement'}
            variant="destructive"
            block
            onPress={confirmDelete}
            loading={deleting}
            disabled={!canDelete}
          />
          <Button
            label="Annuler"
            variant="ghost"
            block
            onPress={() => setDeleteVisible(false)}
            disabled={deleting}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  avatar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  memberText: { flex: 1, gap: 2 },
  teamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeBtn: { padding: 6 },
  pressed: { opacity: 0.5 },
  danger: { borderWidth: 1 },
  tokenBox: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  teamGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  teamOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
  },
  teamDot: { width: 10, height: 10, borderRadius: 5 },
  reassignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheetAction: { marginTop: 8 },
});
