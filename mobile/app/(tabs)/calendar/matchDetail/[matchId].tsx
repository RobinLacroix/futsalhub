import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { format, parse, parseISO, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsTablet } from '../../../../hooks/useIsTablet';
import { useTheme } from '../../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../../contexts/ActiveTeamContext';
import { getMatchById, updateMatch } from '../../../../lib/services/matches';
import {
  getPlayersByTeam,
  getPlayersByClubWithTeams,
  type PlayerWithTeams,
} from '../../../../lib/services/players';
import { getMatchEventsAggregate, hasMatchEvents } from '../../../../lib/services/matchEvents';
import { haptics } from '../../../../lib/design/haptics';
import {
  Text,
  Card,
  Button,
  Badge,
  Section,
  EmptyState,
  SkeletonDetail,
} from '../../../../components/ui';
import { Stepper } from '../../../../components/match/Stepper';
import {
  GoalTypesEditor,
  GoalTypesSummary,
  emptyGoalsByType,
  type GoalTypeKey,
} from '../../../../components/match/GoalTypes';
import { InvitePlayersSheet } from '../../../../components/match/InvitePlayersSheet';
import { DateTimeField, hasNativePicker } from '../../../../components/match/DateTimeField';
import type { Match, MatchPlayer, Player, GoalsByTypeRecord } from '../../../../types';

// ─── Modèle local ─────────────────────────────────────────────────────────────

interface PlayerLine {
  goals: number;
  yellow_cards: number;
  red_cards: number;
}

const emptyLine = (): PlayerLine => ({ goals: 0, yellow_cards: 0, red_cards: 0 });

function parseMatchPlayers(m: Match): MatchPlayer[] {
  if (!m.players) return [];
  const raw = m.players;
  if (Array.isArray(raw)) return raw;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// ─── Écran ────────────────────────────────────────────────────────────────────

export default function MatchDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const isTablet = useIsTablet();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, activeTeam, teams } = useActiveTeam();

  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [convoqued, setConvoqued] = useState<Record<string, boolean>>({});
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerLine>>({});
  const [scoreTeam, setScoreTeam] = useState('');
  const [scoreOpponent, setScoreOpponent] = useState('');
  const [hasEvents, setHasEvents] = useState(false);
  const [goalsByType, setGoalsByType] = useState<GoalsByTypeRecord>(emptyGoalsByType);
  const [concededByType, setConcededByType] = useState<GoalsByTypeRecord>(emptyGoalsByType);

  const [clubPlayersWithTeams, setClubPlayersWithTeams] = useState<PlayerWithTeams[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDateTime, setEditDateTime] = useState(() => new Date());
  const [editDateStr, setEditDateStr] = useState('');
  const [editTimeStr, setEditTimeStr] = useState('');

  // ── Chargement ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!matchId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [m, pl, eventsExist] = await Promise.all([
        getMatchById(matchId),
        activeTeamId ? getPlayersByTeam(activeTeamId) : Promise.resolve([]),
        hasMatchEvents(matchId),
      ]);
      setMatch(m ?? null);
      setPlayers(pl);
      setHasEvents(eventsExist);

      if (m) {
        const conv: Record<string, boolean> = {};
        const stats: Record<string, PlayerLine> = {};
        parseMatchPlayers(m).forEach((p) => {
          conv[p.id] = true;
          stats[p.id] = {
            goals: p.goals ?? 0,
            yellow_cards: p.yellow_cards ?? 0,
            red_cards: p.red_cards ?? 0,
          };
        });
        pl.forEach((p) => {
          if (conv[p.id] === undefined) conv[p.id] = false;
          if (!stats[p.id]) stats[p.id] = emptyLine();
        });
        setConvoqued(conv);
        setPlayerStats(stats);
        setScoreTeam(String(m.score_team ?? 0));
        setScoreOpponent(String(m.score_opponent ?? 0));
        setGoalsByType({ ...emptyGoalsByType(), ...(m.goals_by_type ?? {}) });
        setConcededByType({ ...emptyGoalsByType(), ...(m.conceded_by_type ?? {}) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setMatch(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [matchId, activeTeamId]);

  useEffect(() => {
    setLoading(true);
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
    () =>
      Object.entries(convoqued)
        .filter(([, v]) => v)
        .map(([id]) => id)
        .filter((id) => !squadIds.has(id)),
    [convoqued, squadIds]
  );

  const invitedSet = useMemo(() => new Set(invitedPlayerIds), [invitedPlayerIds]);

  const displayName = useCallback(
    (playerId: string) => {
      const found = clubPlayersWithTeams.find(({ player }) => player.id === playerId);
      if (found) return `${found.player.first_name} ${found.player.last_name}`;
      const p = players.find((x) => x.id === playerId);
      if (p) return `${p.first_name} ${p.last_name}`;
      return `Joueur ${playerId.slice(0, 8)}`;
    },
    [clubPlayersWithTeams, players]
  );

  const sortedForEdit = useMemo(
    () =>
      [...players].sort((a, b) => {
        const aConv = !!convoqued[a.id];
        const bConv = !!convoqued[b.id];
        if (aConv !== bConv) return aConv ? -1 : 1;
        return (a.last_name || '').localeCompare(b.last_name || '', 'fr');
      }),
    [players, convoqued]
  );

  const convoquedPlayers = useMemo(
    () =>
      players
        .filter((p) => convoqued[p.id])
        .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr')),
    [players, convoqued]
  );

  const scoreTeamNum = parseInt(scoreTeam.trim(), 10) || 0;
  const totalGoals = useMemo(
    () =>
      [...convoquedPlayers.map((p) => p.id), ...invitedPlayerIds].reduce(
        (acc, id) => acc + (playerStats[id]?.goals ?? 0),
        0
      ),
    [convoquedPlayers, invitedPlayerIds, playerStats]
  );
  const goalsOverflow = totalGoals > scoreTeamNum;

  // ── Actions ───────────────────────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const beginEditing = useCallback(() => {
    if (!match) return;
    setEditTitle(match.title);
    const ds = typeof match.date === 'string' ? match.date : (match.date as Date).toISOString?.() ?? '';
    const d = ds ? parseISO(ds) : new Date();
    setEditDateTime(d);
    setEditDateStr(format(d, 'dd/MM/yyyy', { locale: fr }));
    setEditTimeStr(format(d, 'HH:mm'));
    setEditing(true);
  }, [match]);

  const setStat = useCallback((playerId: string, key: keyof PlayerLine, delta: number) => {
    setPlayerStats((prev) => {
      const cur = prev[playerId] ?? emptyLine();
      return { ...prev, [playerId]: { ...cur, [key]: Math.max(0, cur[key] + delta) } };
    });
  }, []);

  const setGoalTypeStat = useCallback(
    (which: 'scored' | 'conceded', key: GoalTypeKey, delta: number) => {
      const setter = which === 'scored' ? setGoalsByType : setConcededByType;
      setter((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) + delta) }));
    },
    []
  );

  const toggleConvoqued = useCallback((playerId: string) => {
    haptics.select();
    setConvoqued((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
  }, []);

  const convokeAll = useCallback(() => {
    haptics.success();
    setConvoqued((prev) => {
      const next = { ...prev };
      players.forEach((p) => {
        next[p.id] = true;
      });
      return next;
    });
  }, [players]);

  const loadFromMatchRecorder = useCallback(async () => {
    if (!matchId) return;
    try {
      const agg = await getMatchEventsAggregate(matchId);
      setPlayerStats((prev) => {
        const next = { ...prev };
        agg.forEach((a) => {
          const cur = next[a.player_id] ?? emptyLine();
          next[a.player_id] = {
            goals: cur.goals + a.goals,
            yellow_cards: cur.yellow_cards + a.yellow_cards,
            red_cards: cur.red_cards + a.red_cards,
          };
        });
        return next;
      });
      haptics.success();
      Alert.alert('Récupéré', 'Les buts et cartons du match recorder ont été ajoutés.');
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de récupérer les événements');
    }
  }, [matchId]);

  const save = useCallback(async () => {
    if (!matchId) return;
    if (!editTitle.trim()) {
      Alert.alert('Champ requis', 'Veuillez renseigner le titre du match.');
      return;
    }

    let submitDate: Date;
    if (hasNativePicker) {
      submitDate = editDateTime;
    } else {
      const dParsed = parse(editDateStr.trim(), 'dd/MM/yyyy', new Date(), { locale: fr });
      const [h, mn] = editTimeStr.trim().split(':').map(Number);
      if (!isValid(dParsed) || Number.isNaN(h) || Number.isNaN(mn) || h < 0 || h > 23 || mn < 0 || mn > 59) {
        Alert.alert('Date ou heure invalide', 'Date : JJ/MM/AAAA. Heure : HH:MM (ex. 18:30).');
        return;
      }
      submitDate = new Date(dParsed);
      submitDate.setHours(h, mn, 0, 0);
    }

    const st = parseInt(scoreTeam.trim(), 10);
    const so = parseInt(scoreOpponent.trim(), 10);
    if (Number.isNaN(st) || Number.isNaN(so) || st < 0 || so < 0) {
      Alert.alert('Score invalide', 'Indiquez des nombres entiers positifs.');
      return;
    }

    const convoquedIds = Object.entries(convoqued)
      .filter(([, v]) => v)
      .map(([id]) => id)
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'fr'));

    const stats: Record<string, PlayerLine> = {};
    convoquedIds.forEach((id) => {
      stats[id] = playerStats[id] ?? emptyLine();
    });

    const sumGoals = convoquedIds.reduce((acc, id) => acc + (stats[id]?.goals ?? 0), 0);
    if (sumGoals > st) {
      Alert.alert(
        'Incohérence',
        `Le total des buteurs (${sumGoals}) dépasse le score de l'équipe (${st}).`
      );
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMatch(matchId, {
        title: editTitle.trim(),
        date: submitDate.toISOString(),
        convoquedPlayerIds: convoquedIds,
        score_team: st,
        score_opponent: so,
        playerStats: stats,
        goals_by_type: goalsByType,
        conceded_by_type: concededByType,
      });
      setMatch(updated);
      setEditing(false);
      haptics.success();
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer");
    } finally {
      setSaving(false);
    }
  }, [
    matchId,
    editTitle,
    editDateTime,
    editDateStr,
    editTimeStr,
    convoqued,
    scoreTeam,
    scoreOpponent,
    playerStats,
    goalsByType,
    concededByType,
    displayName,
  ]);

  // ── États non nominaux ────────────────────────────────────────────────────

  if (loading && !match) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <SkeletonDetail />
      </View>
    );
  }

  if (error || !match) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="alert-circle-outline"
          tone="negative"
          title="Match indisponible"
          description={error ?? 'Ce match est introuvable.'}
          action={{ label: 'Réessayer', onPress: onRefresh }}
        />
      </View>
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const dateStr = typeof match.date === 'string' ? match.date : (match.date as Date).toISOString?.() ?? '';
  const date = dateStr ? parseISO(dateStr) : new Date();
  const diff = (match.score_team ?? 0) - (match.score_opponent ?? 0);
  const resultTone = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'secondary';

  const inputStyle = {
    backgroundColor: c.bg.sunken,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border.subtle,
    color: c.text.primary,
    paddingHorizontal: theme.space.md,
    minHeight: 48,
    fontSize: 16,
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.bg.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { gap: theme.space.xl }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.accent.default}
            colors={[c.accent.default]}
          />
        }
      >
        {/* ── En-tête : identité et score ─────────────────────────────────── */}
        <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
          {editing ? (
            <>
              <View style={styles.field}>
                <Text variant="callout" tone="secondary" weight="600">
                  Titre
                </Text>
                <TextInput
                  style={inputStyle}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="ex : J12 — Sporting Paris"
                  placeholderTextColor={c.text.tertiary}
                  accessibilityLabel="Titre du match"
                />
              </View>
              <DateTimeField
                value={editDateTime}
                onChange={setEditDateTime}
                dateText={editDateStr}
                timeText={editTimeStr}
                onDateTextChange={setEditDateStr}
                onTimeTextChange={setEditTimeStr}
              />
            </>
          ) : (
            <View style={styles.identity}>
              <Text variant="title">{match.title}</Text>
              <Text variant="callout" tone="secondary">
                {format(date, "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
              </Text>
              <View style={styles.metaRow}>
                {match.location ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={13} color={c.text.tertiary} />
                    <Text variant="caption" tone="tertiary">
                      {match.location}
                    </Text>
                  </View>
                ) : null}
                {match.competition ? <Badge label={match.competition} size="sm" /> : null}
              </View>
            </View>
          )}

          {/* Le score est le chiffre héros de l'écran : une seule fois, en grand. */}
          <View style={[styles.scoreBlock, { borderTopColor: c.border.subtle }]}>
            {editing ? (
              <View style={[styles.scoreRow, { gap: theme.space.md }]}>
                <TextInput
                  style={[inputStyle, styles.scoreInput]}
                  value={scoreTeam}
                  onChangeText={setScoreTeam}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={c.text.tertiary}
                  accessibilityLabel="Buts marqués par l'équipe"
                />
                <Text variant="title" tone="tertiary">
                  –
                </Text>
                <TextInput
                  style={[inputStyle, styles.scoreInput]}
                  value={scoreOpponent}
                  onChangeText={setScoreOpponent}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={c.text.tertiary}
                  accessibilityLabel="Buts encaissés"
                />
              </View>
            ) : (
              <Text
                variant="hero"
                tone={resultTone}
                accessibilityLabel={`Score ${match.score_team ?? 0} à ${match.score_opponent ?? 0}`}
              >
                {match.score_team ?? 0} – {match.score_opponent ?? 0}
              </Text>
            )}
          </View>
        </Card>

        {/* ── Édition ─────────────────────────────────────────────────────── */}
        {editing ? (
          <>
            {hasEvents && (
              <Button
                label="Récupérer buts et cartons du recorder"
                icon="download-outline"
                variant="secondary"
                block
                onPress={loadFromMatchRecorder}
              />
            )}

            <Section
              title="Types de buts"
              subtitle="Répartition des buts marqués et encaissés."
            >
              <GoalTypesEditor
                scored={goalsByType}
                conceded={concededByType}
                onChange={setGoalTypeStat}
                compact={!isTablet}
              />
            </Section>

            <Section
              title="Convocations et buts"
              subtitle={`${convoquedPlayers.length + invitedPlayerIds.length} joueur(s) convoqué(s).`}
            >
              {/* Une incohérence de saisie doit se voir, pas se deviner dans un
                  texte gris entre parenthèses. */}
              {goalsOverflow && (
                <Card variant="flat" padding="sm" style={[styles.warnRow, { backgroundColor: c.warning.subtle }]}>
                  <Ionicons name="alert-circle" size={17} color={c.warning.default} />
                  <Text variant="callout" tone="warning" style={styles.flex}>
                    Total des buteurs ({totalGoals}) supérieur au score ({scoreTeamNum}).
                  </Text>
                </Card>
              )}

              {players.length > 0 && (
                <Button
                  label="Convoquer tout l'effectif"
                  variant="secondary"
                  size="sm"
                  icon="checkmark-done-outline"
                  onPress={convokeAll}
                  style={styles.selfStart}
                />
              )}

              {sortedForEdit.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  title="Effectif vide"
                  description="Ajoutez des joueurs à l'équipe pour pouvoir les convoquer."
                  compact
                />
              ) : (
                sortedForEdit.map((p) => {
                  const isConv = !!convoqued[p.id];
                  const line = playerStats[p.id] ?? emptyLine();
                  const name = `${p.first_name} ${p.last_name}`;
                  return (
                    <Card key={p.id} variant="flat" padding="sm" style={styles.playerCard}>
                      <View style={styles.playerHeader}>
                        <View style={styles.playerIdentity}>
                          {p.number != null && (
                            <View
                              style={[
                                styles.numberBadge,
                                { backgroundColor: isConv ? c.accent.fill : c.bg.sunken },
                              ]}
                            >
                              <Text
                                variant="caption"
                                tone={isConv ? 'onFill' : 'tertiary'}
                                weight="700"
                                numeric
                              >
                                {p.number}
                              </Text>
                            </View>
                          )}
                          <Text
                            variant="body"
                            tone={isConv ? 'primary' : 'tertiary'}
                            weight="600"
                            numberOfLines={1}
                            style={styles.flex}
                          >
                            {name}
                          </Text>
                        </View>
                        <Switch
                          value={isConv}
                          onValueChange={() => toggleConvoqued(p.id)}
                          trackColor={{ false: c.bg.sunken, true: c.accent.fill }}
                          thumbColor={c.text.onFill}
                          accessibilityLabel={`Convoquer ${name}`}
                        />
                      </View>
                      {isConv && (
                        <View style={[styles.statRow, { gap: theme.space.xl }]}>
                          <Stepper
                            value={line.goals}
                            onChange={(d) => setStat(p.id, 'goals', d)}
                            label={`buts de ${name}`}
                            caption="Buts"
                            compact
                          />
                        </View>
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
            </Section>

            {invitedPlayerIds.length > 0 && (
              <Section title="Joueurs d'autres équipes">
                {invitedPlayerIds.map((playerId) => {
                  const line = playerStats[playerId] ?? emptyLine();
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
                            setConvoqued((prev) => ({ ...prev, [playerId]: false }));
                            setPlayerStats((prev) => {
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
                          onChange={(d) => setStat(playerId, 'goals', d)}
                          label={`buts de ${name}`}
                          caption="Buts"
                          compact
                        />
                        <Stepper
                          value={line.yellow_cards}
                          onChange={(d) => setStat(playerId, 'yellow_cards', d)}
                          label={`cartons jaunes de ${name}`}
                          caption="Jaunes"
                          compact
                        />
                        <Stepper
                          value={line.red_cards}
                          onChange={(d) => setStat(playerId, 'red_cards', d)}
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
          </>
        ) : (
          /* ── Lecture ───────────────────────────────────────────────────── */
          <>
            <Section title="Types de buts">
              <GoalTypesSummary scored={goalsByType} conceded={concededByType} />
            </Section>

            <Section
              title="Joueurs convoqués"
              subtitle={`${convoquedPlayers.length + invitedPlayerIds.length} joueur(s).`}
            >
              {convoquedPlayers.length === 0 && invitedPlayerIds.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  title="Aucun joueur convoqué"
                  description="Passez en modification pour composer le groupe."
                  action={{ label: 'Modifier le match', onPress: beginEditing }}
                  compact
                />
              ) : (
                <Card variant="flat" padding="none">
                  {[...convoquedPlayers.map((p) => p.id), ...invitedPlayerIds].map((id, i) => {
                    const p = players.find((x) => x.id === id);
                    const goals = playerStats[id]?.goals ?? 0;
                    const name = p ? `${p.first_name} ${p.last_name}` : displayName(id);
                    return (
                      <View
                        key={id}
                        style={[
                          styles.readRow,
                          i > 0 && {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: c.border.subtle,
                          },
                        ]}
                        accessibilityLabel={
                          goals > 0 ? `${name}, ${goals} but${goals > 1 ? 's' : ''}` : name
                        }
                      >
                        {p?.number != null ? (
                          <View style={[styles.numberBadge, { backgroundColor: c.bg.sunken }]}>
                            <Text variant="caption" tone="secondary" weight="700" numeric>
                              {p.number}
                            </Text>
                          </View>
                        ) : (
                          <View style={[styles.numberBadge, styles.numberPlaceholder]} />
                        )}
                        <Text variant="body" numberOfLines={1} style={styles.flex}>
                          {name}
                        </Text>
                        {invitedSet.has(id) && <Badge label="Invité" size="sm" />}
                        {goals > 0 && (
                          <View style={styles.goalTag}>
                            <Ionicons name="football" size={13} color={c.text.secondary} />
                            <Text variant="callout" tone="secondary" weight="600" numeric>
                              {goals}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </Card>
              )}
            </Section>
          </>
        )}

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <View style={[styles.footer, { gap: theme.space.md }]}>
          {editing ? (
            <>
              <Button
                label={saving ? 'Enregistrement…' : 'Enregistrer'}
                onPress={save}
                loading={saving}
                disabled={saving}
                size="lg"
                block
              />
              <Button
                label="Annuler"
                variant="ghost"
                onPress={() => setEditing(false)}
                disabled={saving}
                block
              />
            </>
          ) : (
            <Button
              label="Modifier le match"
              icon="create-outline"
              onPress={beginEditing}
              size="lg"
              block
            />
          )}
        </View>
      </ScrollView>

      <InvitePlayersSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        candidates={inviteCandidates}
        teams={teams.filter((t) => t.id !== activeTeamId)}
        alreadyInvited={invitedSet}
        onConfirm={(ids) => {
          setConvoqued((prev) => {
            const next = { ...prev };
            ids.forEach((id) => {
              next[id] = true;
            });
            return next;
          });
          setPlayerStats((prev) => {
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
  field: { gap: 6 },
  identity: { gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreBlock: {
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreInput: { minWidth: 76, textAlign: 'center', fontSize: 24, fontWeight: '700' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerCard: { gap: 10 },
  playerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  playerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  numberBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  numberPlaceholder: { backgroundColor: 'transparent' },
  statRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap' },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  goalTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footer: { marginTop: 8 },
});
