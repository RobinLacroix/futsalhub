import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import {
  getUserClubId,
  isClubAdmin,
  getClubMembersWithProfiles,
  getTeamMainCoach,
  type ClubMemberWithUser,
} from '../../../lib/services/clubs';
import {
  getTeamsByClubId,
  createTeam,
  updateTeam,
  deleteTeam,
  type TeamFormData,
} from '../../../lib/services/teams';
import { haptics } from '../../../lib/design/haptics';
import {
  Text,
  Card,
  Button,
  Badge,
  Field,
  Input,
  Sheet,
  EmptyState,
  SkeletonList,
} from '../../../components/ui';
import type { Team } from '../../../types';

/**
 * Couleurs d'identité d'équipe. Volontairement figées : elles sont **stockées
 * en base** et servent à reconnaître une équipe d'un écran à l'autre, comme un
 * maillot. Les faire suivre le thème changerait l'identité d'une équipe selon
 * le mode d'affichage. Elles sont choisies suffisamment saturées pour rester
 * lisibles sur fond clair comme sur fond sombre.
 */
const TEAM_COLORS = ['#5B8DEF', '#2DBE8C', '#F2994A', '#EB5757', '#9B7BEA', '#20B8CE'] as const;

const DEFAULT_FORM: TeamFormData = {
  name: '',
  category: 'Senior',
  level: 'A',
  color: TEAM_COLORS[0],
};

function memberLabel(m: ClubMemberWithUser): string {
  const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
  return name || m.email || m.user_id.slice(0, 8);
}

export default function TeamsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, setActiveTeamId, refetchTeams } = useActiveTeam();

  const [clubId, setClubId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [form, setForm] = useState<TeamFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clubMembers, setClubMembers] = useState<ClubMemberWithUser[]>([]);
  const [mainCoachUserId, setMainCoachUserId] = useState<string | null>(null);
  const [teamCoaches, setTeamCoaches] = useState<Record<string, string>>({});

  // ── Chargement ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const cid = await getUserClubId();
      setClubId(cid);
      if (!cid) {
        setTeams([]);
        setTeamCoaches({});
        setError(null);
        return;
      }
      setError(null);
      const data = await getTeamsByClubId(cid);
      setTeams(data);
      const coaches: Record<string, string> = {};
      await Promise.all(
        data.map(async (t) => {
          const coach = await getTeamMainCoach(t.id);
          const label = coach?.label;
          if (label) coaches[t.id] = label;
        })
      );
      setTeamCoaches(coaches);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
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

  // ── Formulaire ────────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditingTeam(null);
    setForm(DEFAULT_FORM);
    setMainCoachUserId(null);
    setSheetVisible(true);
  }, []);

  const openEdit = useCallback(
    async (team: Team) => {
      setEditingTeam(team);
      setForm({
        name: team.name,
        category: team.category || 'Senior',
        level: team.level || 'A',
        color: team.color || TEAM_COLORS[0],
      });
      setSheetVisible(true);
      if (!clubId) return;
      const [adminRes, membersRes, coachRes] = await Promise.all([
        isClubAdmin(clubId),
        getClubMembersWithProfiles(clubId),
        getTeamMainCoach(team.id),
      ]);
      setIsAdmin(adminRes);
      setClubMembers(membersRes);
      setMainCoachUserId(
        coachRes?.user_id ?? membersRes.find((m) => m.role === 'admin')?.user_id ?? null
      );
    },
    [clubId]
  );

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    setEditingTeam(null);
    setForm(DEFAULT_FORM);
    setMainCoachUserId(null);
  }, []);

  const save = useCallback(async () => {
    if (!form.name.trim()) {
      Alert.alert('Champ requis', "Le nom de l'équipe est obligatoire.");
      return;
    }
    if (!clubId && !editingTeam) {
      Alert.alert('Aucun club', "Créez un club avant d'ajouter une équipe.");
      return;
    }
    setSaving(true);
    try {
      if (editingTeam) {
        const updateData = { ...form };
        if (isAdmin && mainCoachUserId) updateData.mainCoachUserId = mainCoachUserId;
        await updateTeam(editingTeam.id, updateData);
        setTeams((prev) => prev.map((t) => (t.id === editingTeam.id ? { ...t, ...form } : t)));
        if (isAdmin && mainCoachUserId) {
          const m = clubMembers.find((cm) => cm.user_id === mainCoachUserId);
          if (m) setTeamCoaches((prev) => ({ ...prev, [editingTeam.id]: memberLabel(m) }));
        }
      } else if (clubId) {
        const createData = { ...form };
        if (isAdmin && mainCoachUserId) createData.mainCoachUserId = mainCoachUserId;
        const created = await createTeam(clubId, createData);
        setTeams((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        const label = (await getTeamMainCoach(created.id))?.label;
        if (label) setTeamCoaches((prev) => ({ ...prev, [created.id]: label }));
      }
      haptics.success();
      refetchTeams();
      closeSheet();
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer");
    } finally {
      setSaving(false);
    }
  }, [form, clubId, editingTeam, closeSheet, refetchTeams, isAdmin, mainCoachUserId, clubMembers]);

  const remove = useCallback(
    (team: Team) => {
      Alert.alert(
        "Supprimer l'équipe",
        `Supprimer « ${team.name} » ? Les joueurs ne sont pas supprimés, ils quittent simplement cette équipe.`,
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
                haptics.success();
                refetchTeams();
              } catch (e) {
                haptics.error();
                Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de supprimer');
              }
            },
          },
        ]
      );
    },
    [activeTeamId, teams, setActiveTeamId, refetchTeams]
  );

  // ── États non nominaux ────────────────────────────────────────────────────

  if (loading && teams.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <SkeletonList rows={4} />
      </View>
    );
  }

  if (!clubId) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="trophy-outline"
          title="Aucun club"
          description="Créez un club depuis l'accueil pour gérer vos équipes."
          action={{ label: "Aller à l'accueil", onPress: () => router.replace('/(tabs)') }}
        />
      </View>
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { gap: theme.space.md }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.accent.default}
            colors={[c.accent.default]}
          />
        }
      >
        {error && (
          <Card variant="flat" padding="sm" style={[styles.errorBox, { backgroundColor: c.negative.subtle }]}>
            <Ionicons name="alert-circle" size={18} color={c.negative.default} />
            <Text variant="callout" tone="negative" style={styles.flex}>
              {error}
            </Text>
          </Card>
        )}

        <View style={[styles.header, { gap: theme.space.sm }]}>
          <Text variant="title" style={styles.flex}>
            Équipes du club
          </Text>
          {/* La planification de saison est une fonction des équipes (arbitré le
              2026-08-03). C'est son unique point d'entrée. */}
          <Button
            label="Planification"
            icon="layers-outline"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/(tabs)/squad/season-planning' as never)}
          />
          <Button label="Ajouter" icon="add" size="sm" onPress={openCreate} />
        </View>

        {teams.length === 0 ? (
          <EmptyState
            icon="trophy-outline"
            title="Aucune équipe"
            description="Créez votre première équipe pour commencer à gérer un effectif."
            action={{ label: 'Créer une équipe', onPress: openCreate }}
          />
        ) : (
          teams.map((team) => {
            const isActive = activeTeamId === team.id;
            const color = team.color || TEAM_COLORS[0];
            return (
              <Card
                key={team.id}
                variant={isActive ? 'accent' : 'raised'}
                padding="none"
                style={styles.card}
              >
                <View style={[styles.strip, { backgroundColor: color }]} />
                <View style={[styles.cardBody, { gap: theme.space.md }]}>
                  <View style={styles.cardMain}>
                    <View style={styles.nameRow}>
                      <Text variant="headline" numberOfLines={1} style={styles.flex}>
                        {team.name}
                      </Text>
                      {isActive && <Badge label="Active" tone="accent" size="sm" />}
                    </View>
                    <Text variant="callout" tone="secondary">
                      {team.category} · niveau {team.level}
                    </Text>
                    {teamCoaches[team.id] && (
                      <View style={styles.coachRow}>
                        <Ionicons name="person-outline" size={12} color={c.text.tertiary} />
                        <Text variant="caption" tone="tertiary" numberOfLines={1}>
                          {teamCoaches[team.id]}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.actions}>
                    {!isActive && (
                      <Button
                        label="Activer"
                        variant="secondary"
                        size="sm"
                        onPress={() => {
                          haptics.select();
                          setActiveTeamId(team.id);
                        }}
                      />
                    )}
                    <Pressable
                      onPress={() => openEdit(team)}
                      accessibilityRole="button"
                      accessibilityLabel={`Modifier l'équipe ${team.name}`}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="pencil-outline" size={20} color={c.text.secondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => remove(team)}
                      accessibilityRole="button"
                      accessibilityLabel={`Supprimer l'équipe ${team.name}`}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="trash-outline" size={20} color={c.negative.default} />
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      <Sheet
        visible={sheetVisible}
        onClose={closeSheet}
        title={editingTeam ? "Modifier l'équipe" : 'Nouvelle équipe'}
      >
        <View style={{ gap: theme.space.lg }}>
          <Input
            label="Nom"
            value={form.name}
            onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
            placeholder="ex : Séniors A"
            autoCapitalize="words"
          />
          <View style={styles.row}>
            <Input
              label="Catégorie"
              value={form.category}
              onChangeText={(t) => setForm((f) => ({ ...f, category: t }))}
              placeholder="Senior"
              containerStyle={styles.flex}
            />
            <Input
              label="Niveau"
              value={form.level}
              onChangeText={(t) => setForm((f) => ({ ...f, level: t }))}
              placeholder="A"
              containerStyle={styles.levelField}
            />
          </View>

          <Field label="Couleur" hint="Sert à reconnaître l'équipe partout dans l'application.">
            <View style={styles.colorRow}>
              {TEAM_COLORS.map((value) => {
                const selected = form.color === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setForm((f) => ({ ...f, color: value }))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={`Couleur ${TEAM_COLORS.indexOf(value) + 1} sur ${TEAM_COLORS.length}`}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={[
                      styles.colorDot,
                      { backgroundColor: value, borderColor: selected ? c.text.primary : 'transparent' },
                    ]}
                  >
                    {/* La sélection ne peut pas reposer sur la seule couleur :
                        ce sont six pastilles de couleurs pures, et l'anneau
                        seul est trop discret sur certaines teintes. */}
                    {selected && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {editingTeam && isAdmin && clubMembers.length > 0 && (
            <Field label="Entraîneur principal">
              <ScrollView
                style={[styles.coachPicker, { borderColor: c.border.subtle, borderRadius: theme.radius.sm }]}
                nestedScrollEnabled
              >
                {clubMembers.map((m) => {
                  const selected = mainCoachUserId === m.user_id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setMainCoachUserId(m.user_id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, checked: selected }}
                      accessibilityLabel={memberLabel(m)}
                      style={[
                        styles.coachOption,
                        {
                          borderBottomColor: c.border.subtle,
                          backgroundColor: selected ? c.accent.subtle : 'transparent',
                        },
                      ]}
                    >
                      <Text variant="body" weight="500" numberOfLines={1} style={styles.flex}>
                        {memberLabel(m)}
                      </Text>
                      {m.role === 'admin' && <Badge label="Admin" size="sm" />}
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={selected ? c.accent.default : c.text.tertiary}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Field>
          )}

          <View style={[styles.sheetActions, { gap: theme.space.md }]}>
            <Button label="Annuler" variant="ghost" onPress={closeSheet} style={styles.flex} />
            <Button
              label={saving ? 'Enregistrement…' : 'Enregistrer'}
              onPress={save}
              loading={saving}
              disabled={saving}
              style={styles.flex}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },

  card: { overflow: 'hidden' },
  strip: { height: 4 },
  cardBody: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  cardMain: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { padding: 6 },

  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  levelField: { width: 96 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachPicker: { maxHeight: 180, borderWidth: StyleSheet.hairlineWidth },
  coachOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetActions: { flexDirection: 'row', marginTop: 4 },
});
