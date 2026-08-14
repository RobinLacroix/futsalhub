import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveTeam } from '../../../../contexts/ActiveTeamContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import {
  getTrainingById,
  updateTrainingAttendance,
  sendQuestionnairesForTraining,
} from '../../../../lib/services/trainings';
import {
  getPlayersByTeam,
  getPlayersByClubWithTeams,
  type PlayerWithTeams,
} from '../../../../lib/services/players';
import {
  getSessionByTraining,
  createSession,
} from '../../../../lib/services/physicalTests';
import { getUserClubId } from '../../../../lib/services/clubs';
import { useActiveSeason } from '../../../../contexts/ActiveSeasonContext';
import { haptics } from '../../../../lib/design/haptics';
import {
  Text,
  Card,
  Button,
  Badge,
  Stat,
  Field,
  ChipGroup,
  Section,
  EmptyState,
  SkeletonDetail,
  type ChipOption,
} from '../../../../components/ui';
import { PlayerIdentity } from '../../../../components/players/PlayerIdentity';
import { AvailabilityPill } from '../../../../components/performance/AvailabilityPill';
import { useAvailability } from '../../../../hooks/useAvailability';
import { needsConvocationWarning } from '../../../../lib/availability';
import { AttendancePicker } from '../../../../components/training/AttendancePicker';
import { InvitePlayersSheet } from '../../../../components/match/InvitePlayersSheet';
import type { Training, Player, PlayerStatus } from '../../../../types';

type SquadFilter = 'all' | 'outfield';

const SQUAD_FILTERS: readonly ChipOption<SquadFilter>[] = [
  { value: 'all', label: 'Tout le groupe' },
  { value: 'outfield', label: 'Sans les gardiens' },
];

const isGoalkeeper = (p: Player) => p.position?.toLowerCase().includes('gardien') ?? false;

export default function TrainingDetailScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, activeTeam, teams } = useActiveTeam();
  const { activeSeason } = useActiveSeason();
  // Portée club et non équipe : la feuille d'invitation propose des joueurs
  // d'autres équipes, qui n'auraient sinon aucune pastille.
  const availability = useAvailability();

  const [training, setTraining] = useState<Training | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Record<string, PlayerStatus>>({});
  const [convoked, setConvoked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingQuestionnaires, setSendingQuestionnaires] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [squadFilter, setSquadFilter] = useState<SquadFilter>('all');
  const [clubPlayersWithTeams, setClubPlayersWithTeams] = useState<PlayerWithTeams[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openingTests, setOpeningTests] = useState(false);

  // ── Chargement ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!trainingId || !activeTeamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [t, pl] = await Promise.all([getTrainingById(trainingId), getPlayersByTeam(activeTeamId)]);
      if (!t) {
        setError('Entraînement introuvable');
        return;
      }
      setTraining(t);
      setPlayers(pl);
      setAttendance(t.attendance ?? {});
      // Séance historique sans liste de convoqués : tout le groupe est réputé convoqué.
      const saved = t.convoked_players?.map((x) => x.id) ?? [];
      setConvoked(
        Object.fromEntries((saved.length > 0 ? saved : pl.map((p) => p.id)).map((id) => [id, true]))
      );
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
    return () => {
      mounted = false;
    };
  }, [clubId]);

  // ── Dérivés ───────────────────────────────────────────────────────────────

  const squadIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);

  const inviteCandidates = useMemo(
    () => clubPlayersWithTeams.filter(({ player }) => !squadIds.has(player.id)),
    [clubPlayersWithTeams, squadIds]
  );

  const invitedPlayerIds = useMemo(
    () => Object.keys(attendance).filter((id) => !squadIds.has(id)),
    [attendance, squadIds]
  );
  const invitedSet = useMemo(() => new Set(invitedPlayerIds), [invitedPlayerIds]);

  const visiblePlayers = useMemo(
    () => (squadFilter === 'all' ? players : players.filter((p) => !isGoalkeeper(p))),
    [players, squadFilter]
  );

  const displayName = useCallback(
    (playerId: string) => {
      const found = clubPlayersWithTeams.find(({ player }) => player.id === playerId);
      return found
        ? `${found.player.first_name} ${found.player.last_name}`
        : `Joueur ${playerId.slice(0, 8)}`;
    },
    [clubPlayersWithTeams]
  );

  const counts = useMemo(() => {
    const ids = [
      ...visiblePlayers.filter((p) => convoked[p.id]).map((p) => p.id),
      ...invitedPlayerIds,
    ];
    const by = (s: PlayerStatus) => ids.filter((id) => attendance[id] === s).length;
    const present = by('present');
    const late = by('late');
    return {
      convoked: ids.length,
      present,
      late,
      available: present + late,
      unavailable: by('absent') + by('injured'),
    };
  }, [visiblePlayers, convoked, invitedPlayerIds, attendance]);

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Ouvre la saisie des tests physiques de cette séance, en créant la campagne
   * si elle n'existe pas encore.
   *
   * Une seule campagne par séance : `getSessionByTraining` est un `maybeSingle`,
   * et deux campagnes sur la même séance donneraient deux jeux de résultats sans
   * moyen de savoir lequel fait foi. Le coach ne choisit donc pas, il entre.
   */
  const openPhysicalTests = async () => {
    if (openingTests) return;
    try {
      setOpeningTests(true);
      let session = await getSessionByTraining(trainingId);

      if (!session) {
        const clubId = await getUserClubId();
        if (!clubId) throw new Error('Club introuvable.');
        session = await createSession({
          clubId,
          teamId: activeTeamId || null,
          trainingId,
          date: (training?.date ?? new Date().toISOString()).slice(0, 10),
          season: activeSeason || null,
        });
      }

      haptics.select();
      router.push(`/(tabs)/calendar/tests/${session.id}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ouverture des tests impossible.');
    } finally {
      setOpeningTests(false);
    }
  };

  /**
   * Convoquer un joueur non disponible demande une confirmation explicite.
   * Le RETIRER n'en demande jamais : la garde protège de l'oubli, elle n'a pas à
   * gêner la correction.
   */
  const toggleConvoked = (playerId: string) => {
    haptics.select();
    const willConvoke = !convoked[playerId];

    const apply = () => {
      setConvoked((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
      if (willConvoke) {
        setAttendance((att) => (att[playerId] ? att : { ...att, [playerId]: 'present' }));
      }
    };

    if (!willConvoke) {
      apply();
      return;
    }

    const player = players.find((p) => p.id === playerId);
    availability.confirmConvocation(
      playerId,
      player ? `${player.first_name} ${player.last_name}` : 'Ce joueur',
      apply,
    );
  };

  /**
   * « Convoquer tous » saute les joueurs non disponibles et le DIT.
   *
   * Trois boîtes de dialogue à la suite seraient validées sans être lues, et la
   * garde ne protégerait plus de rien. Le coach reste libre de les ajouter un par
   * un ensuite, ce qui est exactement le geste délibéré qu'on cherche.
   */
  const convokeAll = () => {
    const eligible = players.filter((p) => !needsConvocationWarning(availability.statusOf(p.id)));
    const skipped = players.length - eligible.length;

    haptics.success();
    setConvoked(Object.fromEntries(eligible.map((p) => [p.id, true])));
    setAttendance((att) => {
      const next = { ...att };
      eligible.forEach((p) => {
        if (!next[p.id]) next[p.id] = 'present';
      });
      return next;
    });

    if (skipped > 0) {
      Alert.alert(
        'Groupe convoqué',
        `${skipped} joueur${skipped > 1 ? 's' : ''} non disponible${skipped > 1 ? 's n\'ont' : " n'a"} pas été convoqué${skipped > 1 ? 's' : ''}. Ajoute-les un par un si tu les veux au groupe.`,
      );
    }
  };

  /**
   * Retirer tout le monde efface aussi les statuts de présence à
   * l'enregistrement. Sur un écran rempli en fin de séance, un tap accidentel
   * coûtait le pointage complet, sans confirmation ni annulation possible.
   */
  const clearAllConvoked = () => {
    const marked = players.filter((p) => convoked[p.id] && attendance[p.id]).length;
    if (marked === 0) {
      setConvoked({});
      return;
    }
    Alert.alert(
      'Retirer tout le groupe ?',
      `${marked} joueur(s) ont déjà un statut de présence. Il sera perdu à l'enregistrement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout retirer',
          style: 'destructive',
          onPress: () => {
            haptics.warning();
            setConvoked({});
          },
        },
      ]
    );
  };

  const saveAttendance = async () => {
    if (!trainingId) return;
    setSaving(true);
    try {
      const convokedPlayerIds = [
        ...players.filter((p) => convoked[p.id]).map((p) => p.id),
        ...invitedPlayerIds,
      ];
      const cleaned: Record<string, PlayerStatus> = {};
      convokedPlayerIds.forEach((id) => {
        if (attendance[id]) cleaned[id] = attendance[id];
      });
      await updateTrainingAttendance(trainingId, cleaned, convokedPlayerIds);
      setAttendance(cleaned);
      setTraining((t) =>
        t ? { ...t, attendance: cleaned, convoked_players: convokedPlayerIds.map((id) => ({ id })) } : null
      );
      haptics.success();
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer");
    } finally {
      setSaving(false);
    }
  };

  const sendQuestionnaires = async () => {
    if (!trainingId) return;
    setSendingQuestionnaires(true);
    try {
      const result = await sendQuestionnairesForTraining(trainingId);
      if (result.ok) {
        haptics.success();
        Alert.alert(
          'Questionnaires envoyés',
          result.count
            ? `${result.count} lien(s) créé(s) pour les joueurs présents ou en retard.`
            : 'Les joueurs concernés peuvent remplir le questionnaire.'
        );
      } else {
        haptics.error();
        Alert.alert('Erreur', result.error ?? "Impossible d'envoyer les questionnaires.");
      }
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'envoyer les questionnaires.");
    } finally {
      setSendingQuestionnaires(false);
    }
  };

  // ── États non nominaux ────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <SkeletonDetail />
      </View>
    );
  }

  if (error || !training) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="alert-circle-outline"
          tone="negative"
          title="Séance indisponible"
          description={error ?? 'Cet entraînement est introuvable.'}
          action={{ label: 'Réessayer', onPress: load }}
        />
      </View>
    );
  }

  const dateStr = typeof training.date === 'string' ? training.date : '';
  const date = dateStr ? parseISO(dateStr) : new Date();

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
      <ScrollView contentContainerStyle={[styles.content, { gap: theme.space.xl }]}>
        <Card variant="raised" padding="lg" style={{ gap: theme.space.sm }}>
          <Text variant="callout" tone="secondary">
            {format(date, 'EEEE d MMMM yyyy', { locale: fr })}
          </Text>
          <Text variant="title">{training.theme}</Text>
          {training.key_principle ? (
            <Text variant="body" tone="secondary">
              {training.key_principle}
            </Text>
          ) : null}
          {training.location ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={13} color={c.text.tertiary} />
              <Text variant="caption" tone="tertiary">
                {training.location}
              </Text>
            </View>
          ) : null}
          <Button
            label="Modifier la séance"
            icon="create-outline"
            variant="secondary"
            block
            onPress={() => router.push(`/(tabs)/calendar/training/edit/${trainingId}` as never)}
            style={styles.editBtn}
          />
          <Button
            label="Tests physiques"
            icon="stopwatch-outline"
            variant="secondary"
            block
            loading={openingTests}
            onPress={openPhysicalTests}
          />
        </Card>

        <View style={[styles.statsRow, { gap: theme.space.md }]}>
          <Card variant="flat" padding="sm" style={styles.flex}>
            <Stat
              value={String(counts.available)}
              label="Disponibles"
              unit={`sur ${counts.convoked}`}
              valueColor={c.positive.default}
              size="primary"
            />
            <Text variant="caption" tone="tertiary">
              {counts.present} présent{counts.present !== 1 ? 's' : ''} · {counts.late} retard
              {counts.late !== 1 ? 's' : ''}
            </Text>
          </Card>
          <Card variant="flat" padding="sm" style={styles.flex}>
            <Stat
              value={String(counts.unavailable)}
              label="Indisponibles"
              valueColor={counts.unavailable > 0 ? c.negative.default : undefined}
              size="primary"
            />
            <Text variant="caption" tone="tertiary">
              absents et blessés
            </Text>
          </Card>
        </View>

        <Section
          title="Présences"
          subtitle="L'interrupteur convoque le joueur. Le statut se règle ensuite."
        >
          {players.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Effectif vide"
              description="Aucun joueur dans cette équipe."
              compact
            />
          ) : (
            <>
              <Field label="Affichage">
                <ChipGroup
                  label="Filtrer l'effectif"
                  options={SQUAD_FILTERS}
                  value={squadFilter}
                  onChange={setSquadFilter}
                />
              </Field>

              <View style={[styles.bulkRow, { gap: theme.space.sm }]}>
                <Button
                  label="Convoquer tous"
                  variant="secondary"
                  size="sm"
                  icon="checkmark-done-outline"
                  onPress={convokeAll}
                />
                <Button
                  label="Tout retirer"
                  variant="ghost"
                  size="sm"
                  onPress={clearAllConvoked}
                />
              </View>

              {visiblePlayers.length === 0 ? (
                <EmptyState
                  icon="filter-outline"
                  title="Aucun joueur de champ"
                  description="Les gardiens sont masqués par le filtre."
                  compact
                />
              ) : (
                visiblePlayers.map((p) => {
                  const isConv = !!convoked[p.id];
                  const name = `${p.first_name} ${p.last_name}`;
                  return (
                    <Card
                      key={p.id}
                      variant={isConv ? 'accent' : 'flat'}
                      padding="sm"
                      style={styles.playerCard}
                    >
                      <View style={styles.playerHeader}>
                        <PlayerIdentity
                          firstName={p.first_name}
                          lastName={p.last_name}
                          number={p.number}
                          highlighted={isConv}
                          muted={!isConv}
                        />
                        {isGoalkeeper(p) && <Badge label="GB" size="sm" />}
                        {/* Absente pour un joueur disponible : dix-huit pastilles
                            vertes n'apprennent rien, deux pastilles ambre se
                            lisent d'un coup d'oeil. */}
                        <AvailabilityPill
                          status={availability.statusOf(p.id)}
                          row={availability.rowOf(p.id)}
                        />
                        <Switch
                          value={isConv}
                          onValueChange={() => toggleConvoked(p.id)}
                          trackColor={{ false: c.bg.sunken, true: c.accent.fill }}
                          thumbColor={c.text.onFill}
                          accessibilityLabel={`Convoquer ${name}`}
                        />
                      </View>
                      {isConv && (
                        <AttendancePicker
                          value={attendance[p.id] ?? 'present'}
                          playerName={name}
                          onChange={(s) => setAttendance((prev) => ({ ...prev, [p.id]: s }))}
                        />
                      )}
                    </Card>
                  );
                })
              )}

              {inviteCandidates.length > 0 && (
                <Button
                  label="Ajouter un joueur d'une autre équipe"
                  variant="ghost"
                  icon="person-add-outline"
                  block
                  onPress={() => setInviteOpen(true)}
                />
              )}
            </>
          )}
        </Section>

        {invitedPlayerIds.length > 0 && (
          <Section
            title="Joueurs d'autres équipes"
            subtitle="Réglez leur statut comme pour le groupe."
          >
            {invitedPlayerIds.map((playerId) => {
              const name = displayName(playerId);
              return (
                <Card key={playerId} variant="flat" padding="sm" style={styles.playerCard}>
                  <View style={styles.playerHeader}>
                    <Text variant="body" weight="600" numberOfLines={1} style={styles.flex}>
                      {name}
                    </Text>
                    <Button
                      label="Retirer"
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        haptics.tapLight();
                        setAttendance((prev) => {
                          const next = { ...prev };
                          delete next[playerId];
                          return next;
                        });
                      }}
                    />
                  </View>
                  <AttendancePicker
                    value={attendance[playerId] ?? 'present'}
                    playerName={name}
                    onChange={(s) => setAttendance((prev) => ({ ...prev, [playerId]: s }))}
                  />
                </Card>
              );
            })}
          </Section>
        )}

        {players.length > 0 && (
          <>
            <Button
              label={saving ? 'Enregistrement…' : 'Enregistrer les présences'}
              onPress={saveAttendance}
              loading={saving}
              disabled={saving}
              size="lg"
              block
            />

            <Section
              title="Fin de séance"
              subtitle="Crée un lien questionnaire pour chaque joueur présent ou en retard."
            >
              <Button
                label={sendingQuestionnaires ? 'Envoi…' : 'Envoyer les questionnaires'}
                icon="paper-plane-outline"
                variant="secondary"
                onPress={sendQuestionnaires}
                loading={sendingQuestionnaires}
                disabled={sendingQuestionnaires}
                block
              />
            </Section>
          </>
        )}
      </ScrollView>

      <InvitePlayersSheet
        availability={availability}
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        candidates={inviteCandidates}
        teams={teams.filter((t) => t.id !== activeTeamId)}
        alreadyInvited={invitedSet}
        onConfirm={(ids) => {
          setAttendance((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
              if (!next[id]) next[id] = 'present';
            });
            return next;
          });
          haptics.success();
          setInviteOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtn: { marginTop: 6 },
  statsRow: { flexDirection: 'row' },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap' },
  playerCard: { gap: 10 },
  playerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
