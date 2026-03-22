/**
 * Match Recorder optimisé pour tablette (iPad)
 * Interface similaire à la webapp : panneau contrôle, 5 cartes joueurs, banc, bilan, substitution tap-based
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { getMatchesByTeam, getMatchById, updateMatch } from '../lib/services/matches';
import { getEventsByMatchId, createMatchEvent } from '../lib/services/matchEvents';
import { getPlayersByTeam } from '../lib/services/players';
import type { Match, MatchPlayer } from '../types';
import type { Player } from '../types';
import type { MatchEventType } from '../types';

const HALF_DURATION_SEC = 20 * 60;
const DEFAULT_SEQUENCE_LIMIT = 180;

const ACTIONS: { id: string; eventType: MatchEventType; label: string; acronym: string; color: string }[] = [
  { id: 'shotsOnTarget', eventType: 'shot_on_target', label: 'Tir cadré', acronym: 'TC', color: '#22c55e' },
  { id: 'shotsOffTarget', eventType: 'shot', label: 'Tir non cadré', acronym: 'TnC', color: '#eab308' },
  { id: 'goals', eventType: 'goal', label: 'But', acronym: 'B', color: '#3b82f6' },
  { id: 'ballLoss', eventType: 'ball_loss', label: 'Perte de balle', acronym: 'PdB', color: '#ef4444' },
  { id: 'ballRecovery', eventType: 'recovery', label: 'Récupération', acronym: 'R', color: '#16a34a' },
  { id: 'dribbleSuccess', eventType: 'dribble', label: 'Dribble', acronym: 'D', color: '#a855f7' },
];

interface PlayerState {
  id: string;
  totalTime: number;
  currentSequenceTime: number;
  sequenceTimeLimit: number;
  yellowCards: number;
  redCards: number;
  stats: Record<string, number>;
}

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

interface TabletMatchRecorderProps {
  initialMatchId?: string | null;
  onMatchFinished?: () => void;
  onBack?: () => void;
}

export default function TabletMatchRecorder({ initialMatchId, onMatchFinished, onBack }: TabletMatchRecorderProps) {
  const { activeTeamId } = useActiveTeam();
  const [step, setStep] = useState<'select' | 'record'>(initialMatchId ? 'record' : 'select');
  const [matchId, setMatchId] = useState<string | null>(initialMatchId ?? null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'saisie' | 'bilan'>('saisie');
  const [selectedPlayerForChange, setSelectedPlayerForChange] = useState<string | null>(null);

  const [half, setHalf] = useState<1 | 2>(1);
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [scoreUs, setScoreUs] = useState(0);
  const [scoreOpponent, setScoreOpponent] = useState(0);
  const [foulsUs, setFoulsUs] = useState(0);
  const [foulsOpponent, setFoulsOpponent] = useState(0);
  const [playersOnField, setPlayersOnField] = useState<string[]>([]);
  const [playerStates, setPlayerStates] = useState<Record<string, PlayerState>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const convoquedIds = useMemo(() => {
    if (!match) return [];
    return parseMatchPlayers(match).map((p) => p.id);
  }, [match]);

  const convoquedPlayers = useMemo(() => {
    const idSet = new Set(convoquedIds);
    return players.filter((p) => idSet.has(p.id));
  }, [players, convoquedIds]);

  const fieldPlayers = useMemo(() => {
    return playersOnField
      .map((id) => convoquedPlayers.find((p) => p.id === id))
      .filter(Boolean) as Player[];
  }, [playersOnField, convoquedPlayers]);

  const benchPlayers = useMemo(() => {
    const onField = new Set(playersOnField);
    return convoquedPlayers.filter((p) => !onField.has(p.id));
  }, [convoquedPlayers, playersOnField]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const loadMatches = useCallback(async () => {
    if (!activeTeamId) {
      setMatches([]);
      setLoading(false);
      return;
    }
    try {
      const data = await getMatchesByTeam(activeTeamId);
      setMatches(data);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [activeTeamId]);

  useEffect(() => {
    setLoading(true);
    loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    if (initialMatchId && matches.length > 0 && matches.some((m) => m.id === initialMatchId)) {
      setMatchId(initialMatchId);
      setStep('record');
    }
  }, [initialMatchId, matches]);

  useEffect(() => {
    if (step !== 'record' || !matchId) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, pl] = await Promise.all([
          getMatchById(matchId),
          activeTeamId ? getPlayersByTeam(activeTeamId) : Promise.resolve([]),
        ]);
        if (!cancelled && m) {
          setMatch(m);
          setPlayers(pl);
          setScoreUs(m.score_team ?? 0);
          setScoreOpponent(m.score_opponent ?? 0);

          const ids = parseMatchPlayers(m).map((p) => p.id);
          const starters = ids.slice(0, 5);
          setPlayersOnField(starters);

          const states: Record<string, PlayerState> = {};
          pl.forEach((p) => {
            if (ids.includes(p.id)) {
              const limit =
                (p as Player & { sequence_time_limit?: number }).sequence_time_limit ?? DEFAULT_SEQUENCE_LIMIT;
              states[p.id] = {
                id: p.id,
                totalTime: 0,
                currentSequenceTime: 0,
                sequenceTimeLimit: limit,
                yellowCards: 0,
                redCards: 0,
                stats: {
                  shotsOnTarget: 0,
                  shotsOffTarget: 0,
                  goals: 0,
                  ballLoss: 0,
                  ballRecovery: 0,
                  dribbleSuccess: 0,
                },
              };
            }
          });
          setPlayerStates(states);

          const events = await getEventsByMatchId(matchId);
          if (events.length > 0) {
            const last = events[events.length - 1];
            setHalf(last.half as 1 | 2);
            setSeconds(last.match_time_seconds);
            setScoreUs((prev) => Math.max(prev, events.filter((e) => e.event_type === 'goal').length));
            setScoreOpponent((prev) => Math.max(prev, events.filter((e) => e.event_type === 'opponent_goal').length));

            const eventToStat: Record<string, string> = {
              goal: 'goals',
              shot_on_target: 'shotsOnTarget',
              shot: 'shotsOffTarget',
              ball_loss: 'ballLoss',
              recovery: 'ballRecovery',
              dribble: 'dribbleSuccess',
            };
            setPlayerStates((prev) => {
              const next = { ...prev };
              events.forEach((ev) => {
                if (ev.player_id && next[ev.player_id]) {
                  const st = next[ev.player_id];
                  if (ev.event_type === 'yellow_card') {
                    next[ev.player_id] = { ...st, yellowCards: st.yellowCards + 1 };
                  } else if (ev.event_type === 'red_card') {
                    next[ev.player_id] = { ...st, redCards: st.redCards + 1 };
                  } else if (eventToStat[ev.event_type]) {
                    const key = eventToStat[ev.event_type];
                    next[ev.player_id] = {
                      ...st,
                      stats: { ...st.stats, [key]: (st.stats[key] ?? 0) + 1 },
                    };
                  }
                }
              });
              return next;
            });
          }
        }
      } catch {
        if (!cancelled) setMatch(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, matchId, activeTeamId]);

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s >= HALF_DURATION_SEC - 1) {
          setIsRunning(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
          return HALF_DURATION_SEC;
        }
        return s + 1;
      });
      setPlayerStates((prev) => {
        const next = { ...prev };
        playersOnField.forEach((id) => {
          const st = next[id];
          if (st) {
            next[id] = {
              ...st,
              totalTime: st.totalTime + 1,
              currentSequenceTime: st.currentSequenceTime + 1,
            };
          }
        });
        return next;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, playersOnField]);

  const recordEvent = useCallback(
    async (
      eventType: MatchEventType,
      playerId?: string | null,
      statKey?: string
    ) => {
      if (!matchId) return;
      try {
        await createMatchEvent({
          match_id: matchId,
          event_type: eventType,
          match_time_seconds: seconds,
          half,
          player_id: playerId ?? null,
          players_on_field: playersOnField,
        });
        if (eventType === 'goal') setScoreUs((n) => n + 1);
        if (eventType === 'opponent_goal') setScoreOpponent((n) => n + 1);

        if (playerId && statKey) {
          setPlayerStates((prev) => {
            const st = prev[playerId];
            if (!st) return prev;
            const val = (st.stats[statKey] ?? 0) + 1;
            return {
              ...prev,
              [playerId]: {
                ...st,
                stats: { ...st.stats, [statKey]: val },
              },
            };
          });
        }
        if (playerId && (eventType === 'yellow_card' || eventType === 'red_card')) {
          setPlayerStates((prev) => {
            const st = prev[playerId];
            if (!st) return prev;
            return {
              ...prev,
              [playerId]: {
                ...st,
                yellowCards: eventType === 'yellow_card' ? st.yellowCards + 1 : st.yellowCards,
                redCards: eventType === 'red_card' ? st.redCards + 1 : st.redCards,
              },
            };
          });
        }
      } catch (e) {
        console.error('[Tracker] createMatchEvent failed:', e);
        Alert.alert('Erreur enregistrement', e instanceof Error ? e.message : "Impossible d'enregistrer l'événement");
      }
    },
    [matchId, seconds, half, playersOnField]
  );

  const handlePlayerAction = useCallback(
    (playerId: string, actionId: string) => {
      const action = ACTIONS.find((a) => a.id === actionId);
      if (!action) return;
      recordEvent(action.eventType, playerId, actionId);
    },
    [recordEvent]
  );

  const handlePlayerCard = useCallback(
    (playerId: string, card: 'yellow' | 'red') => {
      recordEvent(card === 'yellow' ? 'yellow_card' : 'red_card', playerId);
    },
    [recordEvent]
  );

  const handleSubstitution = useCallback((playerOutId: string, playerInId: string) => {
    setPlayersOnField((prev) => prev.map((id) => (id === playerOutId ? playerInId : id)));
    setPlayerStates((prev) => {
      const next = { ...prev };
      [playerOutId, playerInId].forEach((id) => {
        const st = next[id];
        if (st) next[id] = { ...st, currentSequenceTime: 0 };
      });
      return next;
    });
    setSelectedPlayerForChange(null);
  }, []);

  const handlePlayerSelection = useCallback(
    (playerId: string, isOnField: boolean) => {
      if (selectedPlayerForChange) {
        if (selectedPlayerForChange === playerId) {
          setSelectedPlayerForChange(null);
        } else if (playersOnField.includes(selectedPlayerForChange) && !isOnField) {
          handleSubstitution(selectedPlayerForChange, playerId);
        } else if (!playersOnField.includes(selectedPlayerForChange) && isOnField) {
          handleSubstitution(playerId, selectedPlayerForChange);
        }
      } else {
        setSelectedPlayerForChange(playerId);
      }
    },
    [selectedPlayerForChange, playersOnField, handleSubstitution]
  );

  const nextHalf = useCallback(() => {
    if (half === 1) {
      setHalf(2);
      setSeconds(0);
      setPlayerStates((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          next[id] = { ...next[id], currentSequenceTime: 0 };
        });
        return next;
      });
    }
  }, [half]);

  const saveAndExit = useCallback(async () => {
    if (!matchId) return;
    setSaving(true);
    try {
      const statsMap: Record<string, { goals: number; yellow_cards: number; red_cards: number }> = {};
      Object.entries(playerStates).forEach(([id, st]) => {
        statsMap[id] = {
          goals: st.stats.goals ?? 0,
          yellow_cards: st.yellowCards,
          red_cards: st.redCards,
        };
      });
      await updateMatch(matchId, {
        score_team: scoreUs,
        score_opponent: scoreOpponent,
        convoquedPlayerIds: convoquedIds,
        playerStats: statsMap,
      });
      Alert.alert('Match enregistré', 'Score et événements enregistrés.', [
        { text: 'OK', onPress: () => onMatchFinished?.() },
      ]);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer le match");
    } finally {
      setSaving(false);
    }
  }, [matchId, scoreUs, scoreOpponent, playerStates, convoquedIds]);

  const opponentActions = [
    { type: 'opponent_goal' as const, label: 'But adverse', color: '#ef4444' },
    { type: 'opponent_shot_on_target' as const, label: 'Tir cadré', color: '#f97316' },
    { type: 'opponent_shot' as const, label: 'Tir adverse', color: '#eab308' },
  ];

  // Bilan stats
  const teamShots = useMemo(() => {
    let onTarget = 0;
    let offTarget = 0;
    Object.values(playerStates).forEach((st) => {
      onTarget += st.stats.shotsOnTarget ?? 0;
      offTarget += st.stats.shotsOffTarget ?? 0;
    });
    return { onTarget, offTarget, total: onTarget + offTarget };
  }, [playerStates]);

  const topScorers = useMemo(() => {
    return Object.entries(playerStates)
      .map(([id, st]) => ({
        id,
        name: players.find((p) => p.id === id) ? `${players.find((p) => p.id === id)!.first_name} ${players.find((p) => p.id === id)!.last_name}` : id,
        goals: st.stats.goals ?? 0,
        onTarget: st.stats.shotsOnTarget ?? 0,
      }))
      .filter((p) => p.goals > 0 || p.onTarget > 0)
      .sort((a, b) => (b.goals + b.onTarget) - (a.goals + a.onTarget))
      .slice(0, 5);
  }, [playerStates, players]);

  if (step === 'select') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Enregistrement Match</Text>
        <Text style={styles.subtitle}>Choisissez le match à suivre</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 24 }} />
        ) : matches.length === 0 ? (
          <Text style={styles.empty}>Aucun match. Créez-en un dans le Calendrier.</Text>
        ) : (
          <View style={styles.matchList}>
            {matches.slice(0, 20).map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.matchCard}
                onPress={() => {
                  setMatchId(m.id);
                  setStep('record');
                }}
              >
                <Text style={styles.matchTitle} numberOfLines={1}>
                  {m.title || m.opponent_team || 'Match'}
                </Text>
                <Text style={styles.matchMeta}>
                  {m.competition} · {m.date ? new Date(m.date).toLocaleDateString('fr-FR') : ''}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={20} color="#3b82f6" />
            <Text style={styles.backBtnText}>Retour</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  if (!match) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Chargement du match…</Text>
      </View>
    );
  }

  const { width } = Dimensions.get('window');
  const isWide = width > 900;

  return (
    <View style={styles.flex}>
      {/* Header / Barre de contrôle */}
      <View style={styles.controlBar}>
        <View style={styles.controlRow}>
          <Text style={styles.controlTitle}>
            {match.title || match.opponent_team || 'Match'} - {match.competition}
          </Text>
          <View style={styles.controlActions}>
            <TouchableOpacity
              style={[styles.headerBtn, activeView === 'saisie' && styles.headerBtnActive]}
              onPress={() => setActiveView('saisie')}
            >
              <Ionicons name="pencil" size={16} color="#fff" />
              <Text style={styles.headerBtnText}>Saisie</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, activeView === 'bilan' && styles.headerBtnActive]}
              onPress={() => setActiveView('bilan')}
            >
              <Ionicons name="stats-chart" size={16} color="#fff" />
              <Text style={styles.headerBtnText}>Bilan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => {
                setStep('select');
                setMatchId(null);
                setMatch(null);
              }}
            >
              <Ionicons name="swap-horizontal" size={16} color="#fff" />
              <Text style={styles.headerBtnText}>Changer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerBtn, styles.finishBtn]} onPress={saveAndExit} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="flag" size={16} color="#fff" />}
              <Text style={styles.headerBtnText}>Fin Match</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Chrono + Score + Fautes + Actions adverses */}
        <View style={[styles.controlsGrid, isWide && styles.controlsGridWide]}>
          <View style={styles.chronoBox}>
            <Text style={styles.chronoLabel}>Chronomètre</Text>
            <Text style={styles.chronoTime}>{formatTime(seconds)}</Text>
            <Text style={styles.chronoHalf}>MT {half}/2</Text>
            <View style={styles.chronoButtons}>
              <TouchableOpacity
                style={[styles.chronoBtn, isRunning && styles.chronoBtnPlay]}
                onPress={() => setIsRunning((r) => !r)}
              >
                <Ionicons name={isRunning ? 'pause' : 'play'} size={24} color="#fff" />
              </TouchableOpacity>
              {half === 1 && (
                <TouchableOpacity style={styles.chronoBtnHalf} onPress={nextHalf}>
                  <Ionicons name="flash" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Score</Text>
            <Text style={styles.scoreValue}>{scoreUs} - {scoreOpponent}</Text>
            <View style={styles.scoreButtons}>
              <TouchableOpacity
                style={styles.scoreBtnEq}
                onPress={async () => {
                  await recordEvent('goal', null);
                }}
              >
                <Text style={styles.scoreBtnText}>+1 Éq</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.scoreBtnAdv}
                onPress={() => recordEvent('opponent_goal')}
              >
                <Text style={styles.scoreBtnText}>+1 Adv</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.foulBox}>
            <Text style={styles.foulLabel}>Fautes</Text>
            <Text style={styles.foulValues}>{foulsUs} - {foulsOpponent}</Text>
            <View style={styles.foulButtons}>
              <TouchableOpacity style={styles.foulBtnEq} onPress={() => setFoulsUs((n) => n + 1)}>
                <Text style={styles.foulBtnText}>Faute Éq</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.foulBtnAdv} onPress={() => setFoulsOpponent((n) => n + 1)}>
                <Text style={styles.foulBtnText}>Faute Adv</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.opponentBox}>
            <Text style={styles.opponentLabel}>Actions adverses</Text>
            <View style={styles.opponentButtons}>
              {opponentActions.map((a) => (
                <TouchableOpacity
                  key={a.type}
                  style={[styles.opponentBtn, { backgroundColor: a.color }]}
                  onPress={() => recordEvent(a.type)}
                >
                  <Text style={styles.opponentBtnText}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Contenu principal */}
      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}>
        {activeView === 'saisie' ? (
          <>
            {selectedPlayerForChange && (
              <View style={styles.selectionBanner}>
                <Text style={styles.selectionText}>Joueur sélectionné pour changement</Text>
                <TouchableOpacity style={styles.cancelSelectBtn} onPress={() => setSelectedPlayerForChange(null)}>
                  <Text style={styles.cancelSelectText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.sectionTitle}>Joueurs sur le terrain</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fieldCards}>
              {fieldPlayers
                .sort((a, b) => {
                  const isGK = (p: Player) => (p.position || '').toLowerCase().includes('gardien');
                  if (isGK(a) && !isGK(b)) return -1;
                  if (!isGK(a) && isGK(b)) return 1;
                  return 0;
                })
                .map((player) => {
                  const st = playerStates[player.id];
                  const isGK = (player.position || '').toLowerCase().includes('gardien');
                  const isOverLimit = st && st.currentSequenceTime >= st.sequenceTimeLimit;
                  const isSelected = selectedPlayerForChange === player.id;
                  return (
                    <View
                      key={player.id}
                      style={[
                        styles.playerCard,
                        isGK && styles.playerCardGK,
                        isSelected && styles.playerCardSelected,
                        isOverLimit && styles.playerCardOverLimit,
                      ]}
                    >
                      <Text style={styles.playerName} numberOfLines={1}>
                        {isGK && '🧤 '}
                        {player.first_name} {player.last_name}
                      </Text>
                      <Text style={styles.playerMeta}>
                        #{player.number ?? '-'} - {player.position || '-'}
                      </Text>
                      {st && (
                        <>
                          <View style={styles.playerTimeRow}>
                            <View>
                              <Text style={styles.playerTimeLabel}>Total</Text>
                              <Text style={styles.playerTimeValue}>{formatTime(st.totalTime)}</Text>
                            </View>
                            <View>
                              <Text style={styles.playerTimeLabel}>Séquence</Text>
                              <Text style={[styles.playerTimeValue, isOverLimit && styles.playerTimeOver]}>
                                {formatTime(st.currentSequenceTime)}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.playerLimit}>Limite: {formatTime(st.sequenceTimeLimit)}</Text>

                          <View style={styles.actionGrid}>
                            {ACTIONS.map((act) => (
                              <TouchableOpacity
                                key={act.id}
                                style={[styles.actionMiniBtn, { backgroundColor: act.color }]}
                                onPress={() => handlePlayerAction(player.id, act.id)}
                              >
                                <Text style={styles.actionMiniText}>{act.acronym}</Text>
                                <Text style={styles.actionMiniCount}>{st.stats[act.id] ?? 0}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <View style={styles.cardRow}>
                            <TouchableOpacity
                              style={styles.cardYellow}
                              onPress={() => handlePlayerCard(player.id, 'yellow')}
                            >
                              <Text style={styles.cardText}>{st.yellowCards}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.cardRed}
                              onPress={() => handlePlayerCard(player.id, 'red')}
                            >
                              <Text style={styles.cardText}>{st.redCards}</Text>
                            </TouchableOpacity>
                          </View>

                          <TouchableOpacity
                            style={[styles.changeBtn, isSelected && styles.changeBtnActive]}
                            onPress={() => handlePlayerSelection(player.id, true)}
                          >
                            <Text style={styles.changeBtnText}>
                              {isSelected ? 'Sélectionné' : 'Sélectionner pour changement'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  );
                })}
            </ScrollView>

            <Text style={styles.sectionTitle}>Remplaçants</Text>
            <View style={styles.benchGrid}>
              {benchPlayers.map((player) => {
                const st = playerStates[player.id];
                const isGK = (player.position || '').toLowerCase().includes('gardien');
                const isSelected = selectedPlayerForChange === player.id;
                return (
                  <TouchableOpacity
                    key={player.id}
                    style={[styles.benchCard, isGK && styles.benchCardGK, isSelected && styles.benchCardSelected]}
                    onPress={() => handlePlayerSelection(player.id, false)}
                  >
                    <Text style={styles.benchName} numberOfLines={1}>
                      {isGK && '🧤 '}
                      {player.first_name} {player.last_name}
                    </Text>
                    <Text style={styles.benchMeta}>#{player.number ?? '-'}</Text>
                    {st && (
                      <>
                        <Text style={styles.benchTime}>{formatTime(st.totalTime)}</Text>
                        <View style={styles.benchCards}>
                          <View style={[styles.benchCardDot, styles.cardYellow]} />
                          <Text style={styles.benchCardCount}>{st.yellowCards}</Text>
                          <View style={[styles.benchCardDot, styles.cardRed]} />
                          <Text style={styles.benchCardCount}>{st.redCards}</Text>
                        </View>
                        <Text style={[styles.changeBtnText, isSelected && { color: '#fff', fontWeight: '600' }]}>
                          {isSelected ? 'Sélectionné' : 'Entrer'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : (
          <View style={styles.bilanContainer}>
            <Text style={styles.bilanTitle}>Bilan du Match</Text>
            <View style={styles.bilanGrid}>
              <View style={[styles.bilanCard, styles.bilanUs]}>
                <Text style={styles.bilanCardTitle}>Notre Équipe</Text>
                <Text style={styles.bilanStat}>Tirs totaux: {teamShots.total}</Text>
                <Text style={styles.bilanStat}>Tirs cadrés: {teamShots.onTarget}</Text>
                <Text style={styles.bilanStat}>Tirs non cadrés: {teamShots.offTarget}</Text>
              </View>
              <View style={[styles.bilanCard, styles.bilanAdv]}>
                <Text style={styles.bilanCardTitle}>Équipe Adverse</Text>
                <Text style={styles.bilanStat}>Score: {scoreOpponent}</Text>
              </View>
            </View>
            {topScorers.length > 0 && (
              <View style={styles.bilanCard}>
                <Text style={styles.bilanCardTitle}>Plus de tirs</Text>
                {topScorers.map((p, i) => (
                  <Text key={p.id} style={styles.bilanLeader}>
                    {i + 1}. {p.name}: {(p.goals + p.onTarget)}
                    {p.goals > 0 && ` (${p.goals} buts)`}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  title: { fontSize: 24, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 15, color: '#64748b', marginTop: 4, marginBottom: 24 },
  empty: { fontSize: 15, color: '#64748b', marginTop: 24 },
  matchList: { gap: 12, marginBottom: 24 },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  matchTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#1e293b' },
  matchMeta: { fontSize: 13, color: '#64748b', marginRight: 12 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  backBtnText: { fontSize: 16, color: '#3b82f6', fontWeight: '500' },

  controlBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  controlTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', flex: 1 },
  controlActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#64748b',
  },
  headerBtnActive: { backgroundColor: '#8b5cf6' },
  finishBtn: { backgroundColor: '#dc2626' },
  headerBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  controlsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  controlsGridWide: { flexDirection: 'row' },
  chronoBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    minWidth: 130,
    alignItems: 'center',
  },
  chronoLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 4 },
  chronoTime: { fontSize: 26, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  chronoHalf: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  chronoButtons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chronoBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chronoBtnPlay: { backgroundColor: '#16a34a' },
  chronoBtnHalf: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 14,
    flex: 1,
    minWidth: 140,
  },
  scoreLabel: { fontSize: 11, color: '#64748b', marginBottom: 4 },
  scoreValue: { fontSize: 22, fontWeight: '700', color: '#1e293b', fontVariant: ['tabular-nums'] },
  scoreButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  scoreBtnEq: { flex: 1, backgroundColor: '#22c55e', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  scoreBtnAdv: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  scoreBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  foulBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 14,
    minWidth: 120,
  },
  foulLabel: { fontSize: 11, color: '#64748b', marginBottom: 4 },
  foulValues: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  foulButtons: { flexDirection: 'row', gap: 6, marginTop: 8 },
  foulBtnEq: { flex: 1, backgroundColor: '#3b82f6', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  foulBtnAdv: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  foulBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  opponentBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 14,
    flex: 1,
    minWidth: 160,
  },
  opponentLabel: { fontSize: 11, color: '#64748b', marginBottom: 6 },
  opponentButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opponentBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  opponentBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#dbeafe',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  selectionText: { fontSize: 14, color: '#1e40af', fontWeight: '600' },
  cancelSelectBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#dc2626', borderRadius: 8 },
  cancelSelectText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  mainScroll: { flex: 1 },
  mainContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 12, marginTop: 8 },

  fieldCards: { marginHorizontal: -4, marginBottom: 16 },
  playerCard: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 6,
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  playerCardGK: { borderColor: '#f59e0b' },
  playerCardSelected: { borderColor: '#3b82f6', shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8 },
  playerCardOverLimit: { borderColor: '#dc2626' },
  playerName: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  playerMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  playerTimeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  playerTimeLabel: { fontSize: 10, color: '#64748b' },
  playerTimeValue: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  playerTimeOver: { color: '#dc2626' },
  playerLimit: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 10,
  },
  actionMiniBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionMiniText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  actionMiniCount: { color: '#fff', fontSize: 10, fontWeight: '600' },
  cardRow: { flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'center' },
  cardYellow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eab308',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardRed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  changeBtn: {
    marginTop: 10,
    paddingVertical: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  changeBtnActive: { backgroundColor: '#3b82f6' },
  changeBtnText: { fontSize: 12, color: '#475569', fontWeight: '500' },

  benchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  benchCard: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  benchCardGK: { borderColor: '#f59e0b', borderWidth: 2 },
  benchCardSelected: { borderColor: '#3b82f6', borderWidth: 2, backgroundColor: '#eff6ff' },
  benchName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  benchMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  benchTime: { fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 6 },
  benchCards: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  benchCardDot: { width: 12, height: 12, borderRadius: 6 },
  benchCardCount: { fontSize: 11, marginLeft: 2 },

  bilanContainer: { paddingVertical: 8 },
  bilanTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  bilanGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 20 },
  bilanCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bilanUs: { borderLeftWidth: 4, borderLeftColor: '#3b82f6' },
  bilanAdv: { borderLeftWidth: 4, borderLeftColor: '#dc2626' },
  bilanCardTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  bilanStat: { fontSize: 14, color: '#475569', marginTop: 4 },
  bilanLeader: { fontSize: 13, color: '#334155', marginTop: 6 },
});
