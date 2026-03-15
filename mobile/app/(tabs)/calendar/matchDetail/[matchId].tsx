import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getMatchById, updateMatch } from '../../../../lib/services/matches';
import { getPlayersByTeam, getPlayersByClubWithTeams, type PlayerWithTeams } from '../../../../lib/services/players';
import { getMatchEventsAggregate, hasMatchEvents } from '../../../../lib/services/matchEvents';
import { useActiveTeam } from '../../../../contexts/ActiveTeamContext';
import type { Match, MatchPlayer } from '../../../../types';
import type { Player } from '../../../../types';

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

const defaultPlayerStats = () => ({ goals: 0, yellow_cards: 0, red_cards: 0 });

export default function MatchDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { activeTeamId, activeTeam, teams } = useActiveTeam();
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [convoqued, setConvoqued] = useState<Record<string, boolean>>({});
  const [scoreTeam, setScoreTeam] = useState('');
  const [scoreOpponent, setScoreOpponent] = useState('');
  const [playerStats, setPlayerStats] = useState<Record<string, { goals: number; yellow_cards: number; red_cards: number }>>({});
  const [hasEvents, setHasEvents] = useState(false);

  const [clubPlayersWithTeams, setClubPlayersWithTeams] = useState<PlayerWithTeams[]>([]);
  const [inviteFilterTeamId, setInviteFilterTeamId] = useState<string>('all');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteModalSelectedIds, setInviteModalSelectedIds] = useState<Record<string, boolean>>({});

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
        const list = parseMatchPlayers(m);
        const conv: Record<string, boolean> = {};
        const stats: Record<string, { goals: number; yellow_cards: number; red_cards: number }> = {};
        list.forEach((p) => {
          conv[p.id] = true;
          stats[p.id] = {
            goals: p.goals ?? 0,
            yellow_cards: p.yellow_cards ?? 0,
            red_cards: p.red_cards ?? 0,
          };
        });
        pl.forEach((p) => {
          if (conv[p.id] === undefined) conv[p.id] = false;
          if (!stats[p.id]) stats[p.id] = { goals: 0, yellow_cards: 0, red_cards: 0 };
        });
        setConvoqued(conv);
        setPlayerStats(stats);
        setScoreTeam(String(m.score_team ?? 0));
        setScoreOpponent(String(m.score_opponent ?? 0));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setMatch(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [matchId, activeTeamId]);

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
  const invitedPlayerIds = useMemo(
    () => Object.entries(convoqued).filter(([, v]) => v).map(([id]) => id).filter((id) => !squadIds.has(id)),
    [convoqued, squadIds]
  );

  const getPlayerDisplayName = (playerId: string) => {
    const found = clubPlayersWithTeams.find(({ player }) => player.id === playerId);
    if (found) return `${found.player.first_name} ${found.player.last_name}`;
    const p = players.find((x) => x.id === playerId);
    if (p) return `${p.first_name} ${p.last_name}`;
    return `Joueur ${playerId.slice(0, 8)}`;
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const loadFromMatchRecorder = useCallback(async () => {
    if (!matchId) return;
    try {
      const agg = await getMatchEventsAggregate(matchId);
      setPlayerStats((prev) => {
        const next = { ...prev };
        agg.forEach((a) => {
          const cur = next[a.player_id] ?? { goals: 0, yellow_cards: 0, red_cards: 0 };
          next[a.player_id] = {
            goals: cur.goals + a.goals,
            yellow_cards: cur.yellow_cards + a.yellow_cards,
            red_cards: cur.red_cards + a.red_cards,
          };
        });
        return next;
      });
      Alert.alert('Récupéré', 'Les buts et cartons du match recorder ont été ajoutés.');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de récupérer les événements');
    }
  }, [matchId]);

  const toggleConvoqued = (playerId: string) => {
    setConvoqued((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  const setStat = (playerId: string, key: 'goals' | 'yellow_cards' | 'red_cards', delta: number) => {
    setPlayerStats((prev) => {
      const cur = prev[playerId] ?? { goals: 0, yellow_cards: 0, red_cards: 0 };
      let v = cur[key] + delta;
      if (v < 0) v = 0;
      return { ...prev, [playerId]: { ...cur, [key]: v } };
    });
  };

  const save = useCallback(async () => {
    if (!matchId) return;
    const st = parseInt(scoreTeam.trim(), 10);
    const so = parseInt(scoreOpponent.trim(), 10);
    if (Number.isNaN(st) || Number.isNaN(so) || st < 0 || so < 0) {
      Alert.alert('Score invalide', 'Indiquez des nombres entiers positifs.');
      return;
    }
    const convoquedIds = Object.entries(convoqued)
      .filter(([, v]) => v)
      .map(([id]) => id)
      .sort((a, b) => getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b), 'fr'));
    const stats: Record<string, { goals: number; yellow_cards: number; red_cards: number }> = {};
    convoquedIds.forEach((id) => {
      stats[id] = playerStats[id] ?? { goals: 0, yellow_cards: 0, red_cards: 0 };
    });
    const totalGoals = convoquedIds.reduce((acc, id) => acc + (stats[id]?.goals ?? 0), 0);
    if (totalGoals > st) {
      Alert.alert('Incohérence', `Total des buteurs (${totalGoals}) ne peut pas dépasser le score de l'équipe (${st}).`);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMatch(matchId, {
        convoquedPlayerIds: convoquedIds,
        score_team: st,
        score_opponent: so,
        playerStats: stats,
      });
      setMatch(updated);
      setEditing(false);
      Alert.alert('Enregistré', 'Les modifications du match ont été enregistrées.');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'enregistrer');
    } finally {
      setSaving(false);
    }
  }, [matchId, convoqued, scoreTeam, scoreOpponent, playerStats, players, clubPlayersWithTeams]);

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
  const convoquedPlayers = useMemo(
    () =>
      players
        .filter((p) => convoqued[p.id])
        .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr')),
    [players, convoqued]
  );

  if (loading && !match) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#dc2626" />
      </View>
    );
  }

  if (error || !match) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Match introuvable'}</Text>
      </View>
    );
  }

  const dateStr = typeof match.date === 'string' ? match.date : (match.date as Date).toISOString?.() ?? '';
  const date = dateStr ? parseISO(dateStr) : new Date();
  const convoquedIds = Object.entries(convoqued).filter(([, v]) => v).map(([id]) => id);
  const totalGoals = convoquedPlayers.reduce((acc, p) => acc + (playerStats[p.id]?.goals ?? 0), 0);
  const scoreTeamNum = parseInt(scoreTeam.trim(), 10) || 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#dc2626']} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.title}>{match.title}</Text>
          <Text style={styles.date}>{format(date, "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{match.location}</Text>
            <Text style={styles.metaDot}> · </Text>
            <Text style={styles.meta}>{match.competition}</Text>
          </View>

          <View style={styles.scoreSection}>
            <Text style={styles.scoreLabel}>Score</Text>
            {editing ? (
              <View style={styles.scoreRow}>
                <TextInput
                  style={styles.scoreInput}
                  value={scoreTeam}
                  onChangeText={setScoreTeam}
                  keyboardType="number-pad"
                  placeholder="0"
                />
                <Text style={styles.scoreSeparator}>–</Text>
                <TextInput
                  style={styles.scoreInput}
                  value={scoreOpponent}
                  onChangeText={setScoreOpponent}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
            ) : (
              <Text style={styles.scoreText}>
                {match.score_team} – {match.score_opponent}
              </Text>
            )}
          </View>
        </View>

        {editing && (
          <>
            {hasEvents && (
              <TouchableOpacity style={styles.fetchEventsBtn} onPress={loadFromMatchRecorder}>
                <Text style={styles.fetchEventsText}>Récupérer buts et cartons depuis le match recorder</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.sectionTitle}>Joueurs convoqués et buts</Text>
            <Text style={styles.sectionHint}>
              Convoqué ou non, puis buts pour chaque convoqué. {totalGoals > scoreTeamNum ? '(Total buts > score)' : ''}
            </Text>
            {sortedPlayersForMatch.length === 0 ? (
              <Text style={styles.emptyText}>Aucun joueur convoqué. Enregistrez d’abord les convoqués.</Text>
            ) : (
              <View style={styles.playerList}>
                {sortedPlayersForMatch.map((p) => {
                  const isConv = !!convoqued[p.id];
                  const s = playerStats[p.id] ?? { goals: 0, yellow_cards: 0, red_cards: 0 };
                  return (
                    <View key={p.id} style={styles.playerRow}>
                      <View style={styles.playerMain}>
                        <View style={styles.playerInfo}>
                          {p.number != null && (
                            <View style={[styles.numberBadge, !isConv && styles.numberBadgeInactive]}>
                              <Text style={styles.numberText}>{p.number}</Text>
                            </View>
                          )}
                          <Text style={[styles.playerName, !isConv && styles.playerNameInactive]}>
                            {p.first_name} {p.last_name}
                          </Text>
                        </View>
                        {isConv && (
                          <View style={styles.inlineStats}>
                            <View style={styles.inlineStat}>
                              <Text style={styles.inlineLabel}>Buts</Text>
                              <View style={styles.stepperRow}>
                                <TouchableOpacity style={styles.stepperBtn} onPress={() => setStat(p.id, 'goals', -1)}>
                                  <Text style={styles.stepperText}>−</Text>
                                </TouchableOpacity>
                                <Text style={styles.stepperValue}>{s.goals}</Text>
                                <TouchableOpacity style={styles.stepperBtn} onPress={() => setStat(p.id, 'goals', 1)}>
                                  <Text style={styles.stepperText}>+</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                      <Switch
                        value={isConv}
                        onValueChange={() => toggleConvoqued(p.id)}
                        trackColor={{ false: '#e5e7eb', true: '#dc2626' }}
                        thumbColor="#fff"
                      />
                    </View>
                  );
                })}
              </View>
            )}

            {otherTeamPlayersForForm.length > 0 && (
              <TouchableOpacity
                style={styles.addOtherTeamsBtn}
                onPress={() => setInviteModalOpen(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.addOtherTeamsBtnText}>+ Ajouter joueurs autres équipes</Text>
              </TouchableOpacity>
            )}

            {invitedPlayerIds.length > 0 && (
              <View style={styles.invitedSection}>
                <Text style={styles.invitedSectionTitle}>Joueurs d&apos;autres équipes convoqués</Text>
                {invitedPlayerIds.map((playerId) => {
                  const s = playerStats[playerId] ?? defaultPlayerStats();
                  return (
                    <View key={playerId} style={styles.invitedMatchRow}>
                      <Text style={styles.invitedPlayerName}>{getPlayerDisplayName(playerId)}</Text>
                      <View style={styles.statsRowInvited}>
                        <View style={styles.inlineStat}>
                          <Text style={styles.inlineLabel}>Buts</Text>
                          <View style={styles.stepperRow}>
                            <TouchableOpacity style={styles.stepperBtn} onPress={() => setStat(playerId, 'goals', -1)}>
                              <Text style={styles.stepperText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.stepperValue}>{s.goals}</Text>
                            <TouchableOpacity style={styles.stepperBtn} onPress={() => setStat(playerId, 'goals', 1)}>
                              <Text style={styles.stepperText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.inlineStat}>
                          <Text style={styles.inlineLabel}>Jaunes</Text>
                          <View style={styles.stepperRow}>
                            <TouchableOpacity style={styles.stepperBtn} onPress={() => setStat(playerId, 'yellow_cards', -1)}>
                              <Text style={styles.stepperText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.stepperValue}>{s.yellow_cards}</Text>
                            <TouchableOpacity style={styles.stepperBtn} onPress={() => setStat(playerId, 'yellow_cards', 1)}>
                              <Text style={styles.stepperText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.inlineStat}>
                          <Text style={styles.inlineLabel}>Rouges</Text>
                          <View style={styles.stepperRow}>
                            <TouchableOpacity style={styles.stepperBtn} onPress={() => setStat(playerId, 'red_cards', -1)}>
                              <Text style={styles.stepperText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.stepperValue}>{s.red_cards}</Text>
                            <TouchableOpacity style={styles.stepperBtn} onPress={() => setStat(playerId, 'red_cards', 1)}>
                              <Text style={styles.stepperText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setConvoqued((prev) => ({ ...prev, [playerId]: false }));
                          setPlayerStats((prev) => {
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
                  );
                })}
              </View>
            )}
          </>
        )}

        {!editing && (
          <>
            <Text style={styles.sectionTitle}>Joueurs convoqués</Text>
            {convoquedPlayers.length === 0 && invitedPlayerIds.length === 0 ? (
              <Text style={styles.emptyText}>Aucun joueur convoqué</Text>
            ) : (
              <View style={styles.playerList}>
                {convoquedPlayers.map((p) => {
                  const s = playerStats[p.id];
                  const hasStats = s && s.goals > 0;
                  return (
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
                        {hasStats && (
                          <Text style={styles.playerStatsInline}>
                            ⚽ {s!.goals}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
                {invitedPlayerIds.map((playerId) => {
                  const s = playerStats[playerId];
                  const hasStats = s && s.goals > 0;
                  return (
                    <View key={playerId} style={styles.playerRow}>
                      <View style={styles.playerInfo}>
                        <Text style={styles.playerName}>{getPlayerDisplayName(playerId)}</Text>
                        {hasStats && (
                          <Text style={styles.playerStatsInline}>⚽ {s!.goals}</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        <View style={styles.footer}>
          {editing ? (
            <>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={save}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)} disabled={saving}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editBtnText}>Modifier le match</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

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
                    .filter((id) => !convoqued[id]);
                  toAdd.forEach((id) => {
                    setConvoqued((prev) => ({ ...prev, [id]: true }));
                    setPlayerStats((prev) => ({ ...prev, [id]: defaultPlayerStats() }));
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 16, color: '#dc2626', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 },
  date: { fontSize: 16, color: '#374151', marginBottom: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 },
  meta: { fontSize: 14, color: '#6b7280' },
  metaDot: { fontSize: 14, color: '#9ca3af' },
  scoreSection: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', alignItems: 'center' },
  scoreLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreInput: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    fontSize: 24,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  scoreSeparator: { fontSize: 20, fontWeight: '600', color: '#6b7280' },
  scoreText: { fontSize: 28, fontWeight: '700', color: '#111' },
  fetchEventsBtn: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  fetchEventsText: { fontSize: 14, color: '#92400e', fontWeight: '500' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#111' },
  sectionHint: { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  playerList: { marginBottom: 16 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  playerMain: { flex: 1, marginRight: 12 },
  playerInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  inlineStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  inlineStat: { alignItems: 'center', minWidth: 48 },
  inlineLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  numberBadgeInactive: { backgroundColor: '#9ca3af', opacity: 0.7 },
  numberBadgeSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  numberText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  playerName: { fontSize: 15, fontWeight: '600', color: '#111' },
  playerNameInactive: { color: '#9ca3af' },
  playerStatsInline: { fontSize: 13, color: '#6b7280', marginLeft: 8 },
  statsList: { marginBottom: 16 },
  statsRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  statsPlayer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statsName: { fontSize: 15, fontWeight: '600', color: '#111', flex: 1 },
  statControls: { flexDirection: 'row', gap: 16 },
  statControl: { alignItems: 'center', minWidth: 64 },
  statLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperText: { fontSize: 18, fontWeight: '600', color: '#374151' },
  stepperValue: { fontSize: 16, fontWeight: '700', color: '#111', minWidth: 24, textAlign: 'center' },
  footer: { marginTop: 24, gap: 12 },
  editBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  editBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  saveBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cancelBtn: { padding: 16, alignItems: 'center' },
  cancelBtnText: { fontSize: 16, color: '#6b7280' },
  addOtherTeamsBtn: {
    marginTop: 12,
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    alignItems: 'center',
  },
  addOtherTeamsBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  invitedSection: { marginBottom: 16 },
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
  statsRowInvited: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  removeInvitedBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  removeInvitedText: { fontSize: 13, color: '#dc2626', fontWeight: '500' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
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
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
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
  modalDone: { fontSize: 17, fontWeight: '600', color: '#dc2626' },
});
