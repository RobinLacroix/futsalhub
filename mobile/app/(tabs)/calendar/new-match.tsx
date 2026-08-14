import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
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
import { createMatch } from '../../../lib/services/matches';
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
import { Stepper } from '../../../components/match/Stepper';
import { InvitePlayersSheet } from '../../../components/match/InvitePlayersSheet';
import { DateTimeField, hasNativePicker } from '../../../components/match/DateTimeField';
import type { Player } from '../../../types';

type LocationOption = 'Domicile' | 'Extérieur';
type CompetitionOption = 'Championnat' | 'Coupe' | 'Amical';

const LOCATION_OPTIONS: readonly ChipOption<LocationOption>[] = [
  { value: 'Domicile', label: 'Domicile', icon: 'home-outline' },
  { value: 'Extérieur', label: 'Extérieur', icon: 'bus-outline' },
];

const COMPETITION_OPTIONS: readonly ChipOption<CompetitionOption>[] = [
  { value: 'Championnat', label: 'Championnat' },
  { value: 'Coupe', label: 'Coupe' },
  { value: 'Amical', label: 'Amical' },
];

interface PlayerLine {
  goals: number;
  yellow_cards: number;
  red_cards: number;
}

const emptyLine = (): PlayerLine => ({ goals: 0, yellow_cards: 0, red_cards: 0 });

const defaultDate = () => {
  const d = new Date();
  d.setMinutes(0);
  d.setSeconds(0, 0);
  return d;
};

export default function NewMatchScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, activeTeam, teams } = useActiveTeam();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dateTime, setDateTime] = useState(defaultDate);
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [location, setLocation] = useState<LocationOption>('Domicile');
  const [competition, setCompetition] = useState<CompetitionOption>('Championnat');
  const [convoqued, setConvoqued] = useState<Record<string, boolean>>({});
  const [scoreTeam, setScoreTeam] = useState('0');
  const [scoreOpponent, setScoreOpponent] = useState('0');

  const [clubPlayersWithTeams, setClubPlayersWithTeams] = useState<PlayerWithTeams[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invited, setInvited] = useState<Record<string, PlayerLine>>({});

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

  const displayName = useCallback(
    (playerId: string) => {
      const found = clubPlayersWithTeams.find(({ player }) => player.id === playerId);
      return found ? `${found.player.first_name} ${found.player.last_name}` : `Joueur ${playerId.slice(0, 8)}`;
    },
    [clubPlayersWithTeams]
  );

  const sorted = useMemo(
    () =>
      [...players].sort((a, b) => {
        const aConv = !!convoqued[a.id];
        const bConv = !!convoqued[b.id];
        if (aConv !== bConv) return aConv ? -1 : 1;
        return (a.last_name || '').localeCompare(b.last_name || '', 'fr');
      }),
    [players, convoqued]
  );

  const convoquedCount = useMemo(
    () => players.filter((p) => convoqued[p.id]).length + invitedIds.length,
    [players, convoqued, invitedIds]
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const toggleConvoqued = (playerId: string) => {
    haptics.select();
    setConvoqued((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  const convokeAll = () => {
    haptics.success();
    setConvoqued(Object.fromEntries(players.map((p) => [p.id, true])));
  };

  const setInvitedStat = (playerId: string, key: keyof PlayerLine, delta: number) => {
    setInvited((prev) => {
      const cur = prev[playerId] ?? emptyLine();
      return { ...prev, [playerId]: { ...cur, [key]: Math.max(0, cur[key] + delta) } };
    });
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
    if (!title.trim()) {
      setTitleError('Le titre est obligatoire.');
      haptics.error();
      return;
    }
    setTitleError(null);

    const submitDate = resolveDate();
    if (!submitDate) {
      Alert.alert('Date ou heure invalide', 'Date : JJ/MM/AAAA. Heure : HH:MM (ex. 18:30).');
      return;
    }

    const st = parseInt(scoreTeam.trim(), 10);
    const so = parseInt(scoreOpponent.trim(), 10);
    if (Number.isNaN(st) || Number.isNaN(so) || st < 0 || so < 0) {
      Alert.alert('Score invalide', 'Indiquez des nombres entiers positifs.');
      return;
    }

    const squadConvoquedIds = players
      .filter((p) => convoqued[p.id])
      .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr'))
      .map((p) => p.id);

    const playerStats: Record<string, PlayerLine> = {};
    squadConvoquedIds.forEach((id) => {
      playerStats[id] = emptyLine();
    });
    invitedIds.forEach((id) => {
      playerStats[id] = invited[id] ?? emptyLine();
    });

    setSaving(true);
    try {
      const match = await createMatch(activeTeamId, {
        title: title.trim(),
        date: submitDate,
        location,
        competition,
        convoquedPlayerIds: [...squadConvoquedIds, ...invitedIds],
        score_team: st,
        score_opponent: so,
        playerStats,
      });
      haptics.success();
      Alert.alert('Match créé', undefined, [
        {
          text: 'Voir le détail',
          onPress: () => router.replace(`/(tabs)/calendar/matchDetail/${match.id}` as never),
        },
        { text: 'Retour au calendrier', onPress: () => router.replace('/(tabs)/calendar') },
      ]);
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de créer le match');
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
          <Input
            label="Titre"
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (titleError) setTitleError(null);
            }}
            error={titleError ?? undefined}
            placeholder="ex : J12 — Sporting Paris"
          />
          <DateTimeField
            value={dateTime}
            onChange={setDateTime}
            dateText={dateStr}
            timeText={timeStr}
            onDateTextChange={setDateStr}
            onTimeTextChange={setTimeStr}
          />
          <Field label="Lieu">
            <ChipGroup
              label="Lieu du match"
              options={LOCATION_OPTIONS}
              value={location}
              onChange={setLocation}
            />
          </Field>
          <Field label="Compétition">
            <ChipGroup
              label="Type de compétition"
              options={COMPETITION_OPTIONS}
              value={competition}
              onChange={setCompetition}
            />
          </Field>
          <Field label="Score" hint="Notre équipe – Adversaire. Laissez 0 – 0 si le match n'est pas joué.">
            <View style={[styles.scoreRow, { gap: theme.space.md }]}>
              <Input
                label="Buts marqués"
                value={scoreTeam}
                onChangeText={setScoreTeam}
                keyboardType="number-pad"
                numeric
                containerStyle={styles.scoreCell}
              />
              <Text variant="title" tone="tertiary" style={styles.scoreDash}>
                –
              </Text>
              <Input
                label="Buts encaissés"
                value={scoreOpponent}
                onChangeText={setScoreOpponent}
                keyboardType="number-pad"
                numeric
                containerStyle={styles.scoreCell}
              />
            </View>
          </Field>
        </Card>

        <Section
          title="Convocations"
          subtitle={
            convoquedCount > 0
              ? `${convoquedCount} joueur(s) convoqué(s).`
              : 'Seuls les joueurs convoqués verront ce match.'
          }
        >
          {loadingPlayers ? (
            <SkeletonList rows={4} />
          ) : players.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Effectif vide"
              description="Ajoutez des joueurs à l'équipe avant de créer un match."
              compact
            />
          ) : (
            <>
              <Button
                label="Convoquer tout l'effectif"
                variant="secondary"
                size="sm"
                icon="checkmark-done-outline"
                onPress={convokeAll}
                style={styles.selfStart}
              />
              <Card variant="flat" padding="none">
                {sorted.map((p, i) => {
                  const isConv = !!convoqued[p.id];
                  return (
                    <View
                      key={p.id}
                      style={[
                        styles.playerRow,
                        i > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: c.border.subtle,
                        },
                      ]}
                    >
                      <PlayerIdentity
                        firstName={p.first_name}
                        lastName={p.last_name}
                        number={p.number}
                        highlighted={isConv}
                        muted={!isConv}
                      />
                      <Switch
                        value={isConv}
                        onValueChange={() => toggleConvoqued(p.id)}
                        trackColor={{ false: c.bg.sunken, true: c.accent.fill }}
                        thumbColor={c.text.onFill}
                        accessibilityLabel={`Convoquer ${p.first_name} ${p.last_name}`}
                      />
                    </View>
                  );
                })}
              </Card>
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
              const line = invited[playerId] ?? emptyLine();
              const name = displayName(playerId);
              return (
                <Card key={playerId} variant="flat" padding="sm" style={styles.invitedCard}>
                  <View style={styles.invitedHeader}>
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
                  <View style={[styles.statRow, { gap: theme.space.xl }]}>
                    <Stepper
                      value={line.goals}
                      onChange={(d) => setInvitedStat(playerId, 'goals', d)}
                      label={`buts de ${name}`}
                      caption="Buts"
                      compact
                    />
                    <Stepper
                      value={line.yellow_cards}
                      onChange={(d) => setInvitedStat(playerId, 'yellow_cards', d)}
                      label={`cartons jaunes de ${name}`}
                      caption="Jaunes"
                      compact
                    />
                    <Stepper
                      value={line.red_cards}
                      onChange={(d) => setInvitedStat(playerId, 'red_cards', d)}
                      label={`cartons rouges de ${name}`}
                      caption="Rouges"
                      compact
                    />
                  </View>
                </Card>
              );
            })}
          </Section>
        )}

        <Button
          label={saving ? 'Création…' : 'Créer le match'}
          onPress={submit}
          loading={saving}
          disabled={saving}
          size="lg"
          block
          style={styles.submit}
        />
      </ScrollView>

      <InvitePlayersSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        candidates={inviteCandidates}
        teams={teams.filter((t) => t.id !== activeTeamId)}
        alreadyInvited={invitedSet}
        onConfirm={(ids) => {
          setInvited((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
              if (!next[id]) next[id] = emptyLine();
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
  selfStart: { alignSelf: 'flex-start' },
  content: { padding: 16, paddingBottom: 40 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end' },
  scoreCell: { flex: 1 },
  scoreDash: { paddingBottom: 12 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  invitedCard: { gap: 10 },
  invitedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap' },
  submit: { marginTop: 8 },
});
