import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { format, parse, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  getPlayersByTeam,
  getPlayersByClubWithTeams,
  type PlayerWithTeams,
} from '../../../lib/services/players';
import { createTraining, updateTrainingAttendance } from '../../../lib/services/trainings';
import { haptics } from '../../../lib/design/haptics';
import {
  Text,
  Card,
  Button,
  Field,
  Input,
  ChipGroup,
  Section,
  EmptyState,
  SkeletonList,
  type ChipOption,
} from '../../../components/ui';
import { PlayerIdentity } from '../../../components/players/PlayerIdentity';
import { AvailabilityPill } from '../../../components/performance/AvailabilityPill';
import { useAvailability } from '../../../hooks/useAvailability';
import { needsConvocationWarning } from '../../../lib/availability';
import { AttendancePicker } from '../../../components/training/AttendancePicker';
import { InvitePlayersSheet } from '../../../components/match/InvitePlayersSheet';
import { DateTimeField, hasNativePicker } from '../../../components/match/DateTimeField';
import type { Player, PlayerStatus } from '../../../types';

export type TrainingTheme = 'Offensif' | 'Défensif' | 'Transition' | 'Supériorité';

const THEME_OPTIONS: readonly ChipOption<TrainingTheme>[] = [
  { value: 'Offensif', label: 'Offensif' },
  { value: 'Défensif', label: 'Défensif' },
  { value: 'Transition', label: 'Transition' },
  { value: 'Supériorité', label: 'Supériorité' },
];

const defaultDate = () => {
  const d = new Date();
  d.setMinutes(0);
  d.setSeconds(0, 0);
  return d;
};

export default function NewTrainingScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, activeTeam, teams } = useActiveTeam();
  // Portée club et non équipe : la feuille d'invitation propose des joueurs
  // d'autres équipes, qui n'auraient sinon aucune pastille.
  const availability = useAvailability();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dateTime, setDateTime] = useState(defaultDate);
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [location, setLocation] = useState('');
  const [keyPrinciple, setKeyPrinciple] = useState('');
  const [trainingTheme, setTrainingTheme] = useState<TrainingTheme>('Offensif');

  /** id → statut. Absent de l'objet = joueur non convoqué. */
  const [attendance, setAttendance] = useState<Record<string, PlayerStatus>>({});

  const [clubPlayersWithTeams, setClubPlayersWithTeams] = useState<PlayerWithTeams[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invited, setInvited] = useState<Record<string, PlayerStatus>>({});

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
      .then((data) => mounted && setPlayers(data.filter((p) => p.status !== 'left')))
      .catch(() => mounted && setPlayers([]))
      .finally(() => mounted && setLoadingPlayers(false));
    return () => {
      mounted = false;
    };
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
    return () => {
      mounted = false;
    };
  }, [clubId]);

  // ── Dérivés ───────────────────────────────────────────────────────────────

  const squadIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);

  const inviteCandidates = useMemo(
    () =>
      clubPlayersWithTeams.filter(
        ({ player }) => !squadIds.has(player.id) && player.status !== 'left'
      ),
    [clubPlayersWithTeams, squadIds]
  );

  const invitedIds = useMemo(() => Object.keys(invited), [invited]);
  const invitedSet = useMemo(() => new Set(invitedIds), [invitedIds]);
  const convokedCount = Object.keys(attendance).length + invitedIds.length;

  const displayName = useCallback(
    (playerId: string) => {
      const found = clubPlayersWithTeams.find(({ player }) => player.id === playerId);
      return found
        ? `${found.player.first_name} ${found.player.last_name}`
        : `Joueur ${playerId.slice(0, 8)}`;
    },
    [clubPlayersWithTeams]
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Saute les joueurs non disponibles et le dit. Trois boîtes de dialogue à la
   * suite seraient validées sans être lues, et la garde ne protégerait plus de
   * rien ; le coach reste libre de les ajouter un par un.
   */
  const convokeAll = () => {
    const eligible = players.filter((p) => !needsConvocationWarning(availability.statusOf(p.id)));
    const skipped = players.length - eligible.length;

    haptics.success();
    setAttendance((prev) => {
      const next = { ...prev };
      eligible.forEach((p) => {
        if (!next[p.id]) next[p.id] = 'present';
      });
      return next;
    });

    if (skipped > 0) {
      Alert.alert(
        'Groupe convoqué',
        `${skipped} joueur${skipped > 1 ? 's' : ''} non disponible${skipped > 1 ? "s n'ont" : " n'a"} pas été convoqué${skipped > 1 ? 's' : ''}. Ajoute-les un par un si tu les veux au groupe.`,
      );
    }
  };

  const clearAll = () => {
    haptics.tapMedium();
    setAttendance({});
  };

  const resolveDate = (): Date | null => {
    if (hasNativePicker) return dateTime;
    const parsed = parse(dateStr.trim(), 'dd/MM/yyyy', new Date(), { locale: fr });
    if (!isValid(parsed)) return null;
    const [h, m] = timeStr.trim().split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    const out = new Date(parsed);
    out.setHours(h, m, 0, 0);
    return out;
  };

  const submit = async () => {
    if (!activeTeamId) {
      Alert.alert('Aucune équipe', "Choisissez une équipe depuis l'accueil.");
      return;
    }
    const submitDate = resolveDate();
    if (!submitDate) {
      Alert.alert('Date ou heure invalide', 'Date : JJ/MM/AAAA. Heure : HH:MM (ex. 18:30).');
      return;
    }
    const convokedPlayerIds = [...Object.keys(attendance), ...invitedIds];
    if (convokedPlayerIds.length === 0) {
      haptics.error();
      Alert.alert(
        'Aucun joueur convoqué',
        'Convoquez au moins un joueur, ou marquez-le blessé, pour créer la séance.'
      );
      return;
    }

    setSaving(true);
    try {
      const training = await createTraining(activeTeamId, {
        date: submitDate,
        location: location.trim(),
        theme: trainingTheme,
        key_principle: keyPrinciple.trim(),
        convoked_player_ids: convokedPlayerIds,
      });
      await updateTrainingAttendance(
        training.id,
        { ...attendance, ...invited },
        convokedPlayerIds
      );
      haptics.success();
      Alert.alert('Entraînement créé', undefined, [
        {
          text: 'Voir le détail',
          onPress: () => router.replace(`/(tabs)/calendar/training/${training.id}` as never),
        },
        { text: 'Retour au calendrier', onPress: () => router.replace('/(tabs)/calendar') },
      ]);
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible de créer l'entraînement");
    } finally {
      setSaving(false);
    }
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.bg.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { gap: theme.space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card variant="raised" padding="lg" style={{ gap: theme.space.lg }}>
          <DateTimeField
            value={dateTime}
            onChange={setDateTime}
            dateText={dateStr}
            timeText={timeStr}
            onDateTextChange={setDateStr}
            onTimeTextChange={setTimeStr}
          />
          <Input
            label="Lieu"
            optional
            value={location}
            onChangeText={setLocation}
            placeholder="ex : Gymnase Jean Jaurès"
          />
          <Field label="Thème de séance">
            <ChipGroup
              label="Thème de séance"
              options={THEME_OPTIONS}
              value={trainingTheme}
              onChange={setTrainingTheme}
            />
          </Field>
          <Input
            label="Principe clé"
            optional
            value={keyPrinciple}
            onChangeText={setKeyPrinciple}
            placeholder="ex : conserver le ballon sous pression"
            hint="Le fil conducteur de la séance, rappelé sur la fiche."
          />
        </Card>

        <Section
          title="Convocations"
          subtitle={
            convokedCount > 0
              ? `${convokedCount} joueur(s) convoqué(s).`
              : 'Seuls les joueurs convoqués verront cette séance dans leur calendrier.'
          }
        >
          {loadingPlayers ? (
            <SkeletonList rows={4} />
          ) : players.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Effectif vide"
              description="Ajoutez des joueurs à l'équipe avant de créer une séance."
              compact
            />
          ) : (
            <>
              <View style={[styles.bulkRow, { gap: theme.space.sm }]}>
                <Button
                  label="Convoquer tous"
                  variant="secondary"
                  size="sm"
                  icon="checkmark-done-outline"
                  onPress={convokeAll}
                />
                {convokedCount > 0 && (
                  <Button label="Tout retirer" variant="ghost" size="sm" onPress={clearAll} />
                )}
              </View>

              {players.map((p) => {
                const status = attendance[p.id];
                const name = `${p.first_name} ${p.last_name}`;
                return (
                  <Card
                    key={p.id}
                    variant={status ? 'accent' : 'flat'}
                    padding="sm"
                    style={styles.playerCard}
                  >
                    <View style={styles.playerHeader}>
                      <PlayerIdentity
                        firstName={p.first_name}
                        lastName={p.last_name}
                        number={p.number}
                        highlighted={!!status}
                        muted={!status}
                      />
                      {/* Absente pour un joueur disponible : voir AvailabilityPill. */}
                      <AvailabilityPill
                        status={availability.statusOf(p.id)}
                        row={availability.rowOf(p.id)}
                      />
                      {status ? (
                        <Button
                          label="Retirer"
                          variant="ghost"
                          size="sm"
                          onPress={() =>
                            setAttendance((prev) => {
                              const next = { ...prev };
                              delete next[p.id];
                              return next;
                            })
                          }
                        />
                      ) : (
                        <Button
                          label="Convoquer"
                          variant="secondary"
                          size="sm"
                          onPress={() => {
                            haptics.select();
                            availability.confirmConvocation(p.id, name, () =>
                              setAttendance((prev) => ({ ...prev, [p.id]: 'present' })),
                            );
                          }}
                        />
                      )}
                    </View>
                    {status && (
                      <AttendancePicker
                        value={status}
                        playerName={name}
                        onChange={(s) => setAttendance((prev) => ({ ...prev, [p.id]: s }))}
                      />
                    )}
                  </Card>
                );
              })}
            </>
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
        </Section>

        {invitedIds.length > 0 && (
          <Section title="Joueurs d'autres équipes">
            {invitedIds.map((playerId) => {
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
                        setInvited((prev) => {
                          const next = { ...prev };
                          delete next[playerId];
                          return next;
                        });
                      }}
                    />
                  </View>
                  <AttendancePicker
                    value={invited[playerId] ?? 'present'}
                    playerName={name}
                    onChange={(s) => setInvited((prev) => ({ ...prev, [playerId]: s }))}
                  />
                </Card>
              );
            })}
          </Section>
        )}

        <Button
          label={saving ? 'Création…' : "Créer l'entraînement"}
          onPress={submit}
          loading={saving}
          disabled={saving}
          size="lg"
          block
          style={styles.submit}
        />
      </ScrollView>

      <InvitePlayersSheet
        availability={availability}
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        candidates={inviteCandidates}
        teams={teams.filter((t) => t.id !== activeTeamId)}
        alreadyInvited={invitedSet}
        onConfirm={(ids) => {
          setInvited((prev) => {
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap' },
  playerCard: { gap: 10 },
  playerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  submit: { marginTop: 8 },
});
