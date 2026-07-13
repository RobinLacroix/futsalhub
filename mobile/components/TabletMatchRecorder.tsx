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
  Modal,
  Pressable,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { getMatchesByTeam, getMatchById, updateMatch } from '../lib/services/matches';
import { getEventsByMatchId, createMatchEvent, deleteLastMatchEventByType, type GoalType } from '../lib/services/matchEvents';
import { getPlayersByTeam } from '../lib/services/players';
import type { Match, MatchPlayer } from '../types';
import type { Player } from '../types';
import type { MatchEventType } from '../types';
import { useVoiceCommand } from '../hooks/useVoiceCommand';
import { getOutboxLength } from '../lib/offline/matchRecorderOutbox';
import { parseMatchPlayers, formatSeconds } from '../utils/matchUtils';

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'offensive', label: 'Phase offensive' },
  { value: 'transition', label: 'Transition' },
  { value: 'cpa', label: 'CPA' },
  { value: 'superiority', label: 'Supériorité' },
];

const HALF_DURATION_SEC = 20 * 60;
const DEFAULT_SEQUENCE_LIMIT = 180;

const ACTIONS: { id: string; eventType: MatchEventType; label: string; acronym: string; color: string }[] = [
  { id: 'shotsOnTarget', eventType: 'shot_on_target', label: 'Tir cadré', acronym: 'TC', color: '#22c55e' },
  { id: 'shotsOffTarget', eventType: 'shot', label: 'Tir non cadré', acronym: 'TnC', color: '#eab308' },
  { id: 'goals', eventType: 'goal', label: 'But', acronym: 'B', color: '#3b82f6' },
  { id: 'ballLoss', eventType: 'ball_loss', label: 'Perte de balle', acronym: 'PdB', color: '#ef4444' },
  { id: 'ballRecovery', eventType: 'recovery', label: 'Récupération', acronym: 'R', color: '#16a34a' },
  { id: 'assists', eventType: 'assist', label: 'Passe déc.', acronym: 'Pdec', color: '#a855f7' },
];

const STATS_TABLE_COLUMNS: { key: string; label: string; type: 'player' | 'circle' | 'time' | 'plusminus' | 'card'; color?: string; flex: number }[] = [
  { key: 'joueur', label: 'Joueur', type: 'player', flex: 3 },
  { key: 'goals', label: 'Buts', type: 'circle', color: '#3b82f6', flex: 1 },
  { key: 'shotsOnTarget', label: 'Tirs cadrés', type: 'circle', color: '#22c55e', flex: 1 },
  { key: 'totalShots', label: 'Tirs totaux', type: 'circle', color: '#1e293b', flex: 1 },
  { key: 'ballLoss', label: 'Pertes de balle', type: 'circle', color: '#ef4444', flex: 1 },
  { key: 'recovery', label: 'Récupérations', type: 'circle', color: '#a855f7', flex: 1 },
  { key: 'assist', label: 'Passes déc.', type: 'circle', color: '#a855f7', flex: 1 },
  { key: 'totalTime', label: 'Temps', type: 'time', flex: 1 },
  { key: 'plusMinus', label: '+/-', type: 'plusminus', flex: 1 },
  { key: 'yellowCards', label: 'Cartons J', type: 'card', flex: 1 },
  { key: 'redCards', label: 'Cartons R', type: 'card', flex: 1 },
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


interface TabletMatchRecorderProps {
  initialMatchId?: string | null;
  onMatchFinished?: () => void;
  onBack?: () => void;
}

export default function TabletMatchRecorder({ initialMatchId, onMatchFinished, onBack }: TabletMatchRecorderProps) {
  const { activeTeamId } = useActiveTeam();
  const router = useRouter();
  const [step, setStep] = useState<'select' | 'record'>(initialMatchId ? 'record' : 'select');
  const [matchId, setMatchId] = useState<string | null>(initialMatchId ?? null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'saisie' | 'bilan'>('saisie');
  const [selectedPlayerForChange, setSelectedPlayerForChange] = useState<string | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [dropTargetPlayerId, setDropTargetPlayerId] = useState<string | null>(null);
  const [statsSortBy, setStatsSortBy] = useState<string>('joueur');
  const [statsSortDir, setStatsSortDir] = useState<'asc' | 'desc'>('asc');
  const [goalTypeModal, setGoalTypeModal] = useState<{
    eventType: 'goal' | 'opponent_goal';
    playerId?: string | null;
    statKey?: string;
  } | null>(null);
  const modalOpenedAtRef = useRef<number>(0);
  const cardRefsRef = useRef<Record<string, View | null>>({});
  const cardLayoutsRef = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const dropTargetRef = useRef<string | null>(null);

  const [half, setHalf] = useState<1 | 2>(1);
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [scoreUs, setScoreUs] = useState(0);
  const [scoreOpponent, setScoreOpponent] = useState(0);
  const [opponentShotsTotal, setOpponentShotsTotal] = useState(0);
  const [opponentShotsOnTarget, setOpponentShotsOnTarget] = useState(0);
  const [foulsUs, setFoulsUs] = useState(0);
  const [foulsOpponent, setFoulsOpponent] = useState(0);
  const [playersOnField, setPlayersOnField] = useState<string[]>([]);
  const [playerStates, setPlayerStates] = useState<Record<string, PlayerState>>({});
  const [plusMinusByPlayer, setPlusMinusByPlayer] = useState<Record<string, number>>({});
  const [goalsByType,    setGoalsByType]    = useState<Record<string, number>>({ offensive: 0, transition: 0, cpa: 0, superiority: 0 });
  const [concededByType, setConcededByType] = useState<Record<string, number>>({ offensive: 0, transition: 0, cpa: 0, superiority: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const voiceFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [outboxLength, setOutboxLength] = useState(0);
  const [timeoutUs, setTimeoutUs] = useState(false);
  const [timeoutOpponent, setTimeoutOpponent] = useState(false);

  // Enregistre le timestamp à chaque ouverture du modal pour éviter le "ghost tap"
  // (l'événement "doigt levé" du bouton d'ouverture qui traverse vers l'overlay et ferme immédiatement)
  useEffect(() => {
    if (goalTypeModal) modalOpenedAtRef.current = Date.now();
  }, [goalTypeModal]);

  const showVoiceFeedback = useCallback((msg: string) => {
    if (voiceFeedbackTimeoutRef.current) clearTimeout(voiceFeedbackTimeoutRef.current);
    setVoiceFeedback(msg);
    voiceFeedbackTimeoutRef.current = setTimeout(() => setVoiceFeedback(null), 3000);
  }, []);

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

  const formatTime = formatSeconds;

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

          const ids = parseMatchPlayers(m).map((p) => p.id);
          // Exclure les joueurs partis ('left') du roster, sauf s'ils sont déjà
          // convoqués dans ce match (on garde l'historique d'un match joué).
          const convokedIds = new Set(ids);
          setPlayers(pl.filter((p) => p.status !== 'left' || convokedIds.has(p.id)));

          const starters = ids.slice(0, 5);

          setScoreUs(m.score_team ?? 0);
          setScoreOpponent(m.score_opponent ?? 0);
          setPlayersOnField(starters);
          const matchPlayers = parseMatchPlayers(m);
          const timePlayedByPlayer = new Map(matchPlayers.map((mp) => [mp.id, mp.time_played ?? 0]));
          const states: Record<string, PlayerState> = {};
          pl.forEach((p) => {
            if (ids.includes(p.id)) {
              const limit = (p as Player & { sequence_time_limit?: number }).sequence_time_limit ?? DEFAULT_SEQUENCE_LIMIT;
              const timeFromMatch = timePlayedByPlayer.get(p.id) ?? 0;
              states[p.id] = {
                id: p.id,
                totalTime: timeFromMatch > 0 ? timeFromMatch : 0,
                currentSequenceTime: 0,
                sequenceTimeLimit: limit,
                yellowCards: 0,
                redCards: 0,
                stats: { shotsOnTarget: 0, shotsOffTarget: 0, goals: 0, ballLoss: 0, ballRecovery: 0, assists: 0 },
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
            setOpponentShotsTotal(events.filter((e) => e.event_type === 'opponent_shot' || e.event_type === 'opponent_shot_on_target').length);
            setOpponentShotsOnTarget(events.filter((e) => e.event_type === 'opponent_shot_on_target').length);

            const eventToStat: Record<string, string> = {
              goal: 'goals',
              shot_on_target: 'shotsOnTarget',
              shot: 'shotsOffTarget',
              ball_loss: 'ballLoss',
              recovery: 'ballRecovery',
              assist: 'assists',
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

            // Calcul +/- depuis les événements existants
            const pmMap: Record<string, number> = {};
            events.forEach((ev) => {
              if (
                (ev.event_type === 'goal' || ev.event_type === 'opponent_goal') &&
                Array.isArray(ev.players_on_field)
              ) {
                const delta = ev.event_type === 'goal' ? 1 : -1;
                ev.players_on_field.forEach((pid) => {
                  pmMap[pid] = (pmMap[pid] ?? 0) + delta;
                });
              }
            });
            setPlusMinusByPlayer(pmMap);

            // Calcul types de buts/encaissés depuis les événements existants
            const gbtMap: Record<string, number> = { offensive: 0, transition: 0, cpa: 0, superiority: 0 };
            const cbtMap: Record<string, number> = { offensive: 0, transition: 0, cpa: 0, superiority: 0 };
            events.forEach((ev) => {
              if (ev.event_type === 'goal' && ev.goal_type) {
                gbtMap[ev.goal_type] = (gbtMap[ev.goal_type] ?? 0) + 1;
              }
              if (ev.event_type === 'opponent_goal' && ev.goal_type) {
                cbtMap[ev.goal_type] = (cbtMap[ev.goal_type] ?? 0) + 1;
              }
            });
            setGoalsByType(gbtMap);
            setConcededByType(cbtMap);
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
      setSeconds((s) => s + 1);
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
      statKey?: string,
      goalType?: GoalType | null
    ) => {
      if (!matchId) return;
      try {
        const basePayload = {
          match_id: matchId,
          match_time_seconds: seconds,
          half,
          players_on_field: playersOnField,
        };
        const playerIdVal = playerId ?? null;

        await createMatchEvent({
          ...basePayload,
          event_type: eventType,
          player_id: playerIdVal,
          goal_type: (eventType === 'goal' || eventType === 'opponent_goal') ? goalType ?? null : undefined,
        });

        if (eventType === 'goal') {
          setScoreUs((n) => n + 1);
          if (goalType) {
            setGoalsByType((prev) => ({ ...prev, [goalType]: (prev[goalType] ?? 0) + 1 }));
          }
          await createMatchEvent({
            ...basePayload,
            event_type: 'shot_on_target',
            player_id: playerIdVal,
          });
          // +1 pour chaque joueur sur le terrain
          setPlusMinusByPlayer((prev) => {
            const next = { ...prev };
            playersOnField.forEach((pid) => { next[pid] = (next[pid] ?? 0) + 1; });
            return next;
          });
        }
        if (eventType === 'opponent_goal') {
          setScoreOpponent((n) => n + 1);
          if (goalType) {
            setConcededByType((prev) => ({ ...prev, [goalType]: (prev[goalType] ?? 0) + 1 }));
          }
          await createMatchEvent({
            ...basePayload,
            event_type: 'opponent_shot_on_target',
            player_id: null,
          });
          // -1 pour chaque joueur sur le terrain
          setPlusMinusByPlayer((prev) => {
            const next = { ...prev };
            playersOnField.forEach((pid) => { next[pid] = (next[pid] ?? 0) - 1; });
            return next;
          });
        }
        if (eventType === 'opponent_shot') setOpponentShotsTotal((n) => n + 1);
        if (eventType === 'opponent_shot_on_target') {
          setOpponentShotsOnTarget((n) => n + 1);
          setOpponentShotsTotal((n) => n + 1);
        }

        if (playerId && statKey) {
          setPlayerStates((prev) => {
            const st = prev[playerId];
            if (!st) return prev;
            const val = (st.stats[statKey] ?? 0) + 1;
            const nextStats = { ...st.stats, [statKey]: val };
            if (eventType === 'goal') {
              nextStats.shotsOnTarget = (st.stats.shotsOnTarget ?? 0) + 1;
            }
            return {
              ...prev,
              [playerId]: { ...st, stats: nextStats },
            };
          });
        }
        if (eventType === 'opponent_goal') {
          setOpponentShotsOnTarget((n) => n + 1);
          setOpponentShotsTotal((n) => n + 1);
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
      if (action.eventType === 'goal') {
        setGoalTypeModal({ eventType: 'goal', playerId, statKey: actionId });
      } else {
        recordEvent(action.eventType, playerId, actionId);
      }
    },
    [recordEvent]
  );

  const handlePlayerCard = useCallback(
    (playerId: string, card: 'yellow' | 'red') => {
      recordEvent(card === 'yellow' ? 'yellow_card' : 'red_card', playerId);
    },
    [recordEvent]
  );

  const handleUndoPlayerAction = useCallback(
    (playerId: string, actionId: string) => {
      const action = ACTIONS.find((a) => a.id === actionId);
      if (!action || !matchId) return;
      setPlayerStates((prev) => {
        const st = prev[playerId];
        if (!st) return prev;
        const current = st.stats[actionId] ?? 0;
        if (current <= 0) return prev;
        return {
          ...prev,
          [playerId]: { ...st, stats: { ...st.stats, [actionId]: current - 1 } },
        };
      });
      if (action.eventType === 'goal') setScoreUs((n) => Math.max(0, n - 1));
      deleteLastMatchEventByType(matchId, action.eventType, playerId);
    },
    [matchId]
  );

  const handleUndoPlayerCard = useCallback(
    (playerId: string, card: 'yellow' | 'red') => {
      if (!matchId) return;
      const eventType = card === 'yellow' ? 'yellow_card' : 'red_card';
      setPlayerStates((prev) => {
        const st = prev[playerId];
        if (!st) return prev;
        const current = card === 'yellow' ? st.yellowCards : st.redCards;
        if (current <= 0) return prev;
        return {
          ...prev,
          [playerId]: {
            ...st,
            yellowCards: card === 'yellow' ? st.yellowCards - 1 : st.yellowCards,
            redCards: card === 'red' ? st.redCards - 1 : st.redCards,
          },
        };
      });
      deleteLastMatchEventByType(matchId, eventType, playerId);
    },
    [matchId]
  );

  const handleGoalTypeSelect = useCallback(
    async (goalType: GoalType) => {
      if (!goalTypeModal) return;
      const { eventType, playerId, statKey } = goalTypeModal;
      setGoalTypeModal(null);
      await recordEvent(eventType, playerId ?? null, statKey, goalType);
    },
    [goalTypeModal, recordEvent]
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

  const { isListening, startListening, stopListening } = useVoiceCommand({
    players: convoquedPlayers,
    playersOnField,
    onEvent: (eventType, player, statKey) => {
      if (eventType === 'goal' || eventType === 'opponent_goal') {
        setGoalTypeModal({ eventType, playerId: player?.id ?? null, statKey });
        const playerLabel = player ? `${player.first_name} · ` : '';
        showVoiceFeedback(`${playerLabel}But — choisissez le type`);
      } else {
        recordEvent(eventType, player?.id ?? null, statKey || undefined);
        const playerLabel = player ? `${player.first_name} ${player.last_name}` : 'Adversaire';
        const actionLabel = ACTIONS.find((a) => a.eventType === eventType)?.label ?? eventType;
        showVoiceFeedback(`${playerLabel} · ${actionLabel}`);
      }
    },
    onSubstitution: (outId, inId) => {
      handleSubstitution(outId, inId);
      const out = convoquedPlayers.find((p) => p.id === outId);
      const inn = convoquedPlayers.find((p) => p.id === inId);
      showVoiceFeedback(`Changement · ${out?.first_name ?? '?'} → ${inn?.first_name ?? '?'}`);
    },
    onUnknown: (transcript) => {
      showVoiceFeedback(`Non reconnu : "${transcript}"`);
    },
  });

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

  const handledRef = useRef(false);
  const handleDragEnd = useCallback(
    (sourcePlayerId: string, sourceIsOnField: boolean, absoluteX: number, absoluteY: number) => {
      const allPlayerIds = [...playersOnField, ...benchPlayers.map((p) => p.id)];
      handledRef.current = false;
      for (const targetPlayerId of allPlayerIds) {
        if (targetPlayerId === sourcePlayerId) continue;
        const ref = cardRefsRef.current[targetPlayerId];
        if (!ref || !('measureInWindow' in ref)) continue;
        (ref as any).measureInWindow((x: number, y: number, w: number, h: number) => {
          if (handledRef.current) return;
          if (
            absoluteX >= x &&
            absoluteX <= x + w &&
            absoluteY >= y &&
            absoluteY <= y + h
          ) {
            const targetIsOnField = playersOnField.includes(targetPlayerId);
            if (sourceIsOnField && !targetIsOnField) {
              handleSubstitution(sourcePlayerId, targetPlayerId);
              handledRef.current = true;
            } else if (!sourceIsOnField && targetIsOnField) {
              handleSubstitution(targetPlayerId, sourcePlayerId);
              handledRef.current = true;
            }
          }
        });
      }
    },
    [playersOnField, benchPlayers, handleSubstitution]
  );

  const updateCardLayout = useCallback((playerId: string, x: number, y: number, w: number, h: number) => {
    cardLayoutsRef.current[playerId] = { x, y, w, h };
  }, []);

  const handleDragUpdate = useCallback(
    (sourcePlayerId: string, sourceIsOnField: boolean, absoluteX: number, absoluteY: number) => {
      const layouts = cardLayoutsRef.current;
      let found: string | null = null;
      for (const [targetPlayerId, layout] of Object.entries(layouts)) {
        if (targetPlayerId === sourcePlayerId) continue;
        const { x, y, w, h } = layout;
        if (absoluteX >= x && absoluteX <= x + w && absoluteY >= y && absoluteY <= y + h) {
          const targetIsOnField = playersOnField.includes(targetPlayerId);
          if ((sourceIsOnField && !targetIsOnField) || (!sourceIsOnField && targetIsOnField)) {
            found = targetPlayerId;
            break;
          }
        }
      }
      if (found !== dropTargetRef.current) {
        dropTargetRef.current = found;
        setDropTargetPlayerId(found);
      }
    },
    [playersOnField]
  );

  useEffect(() => {
    if (step !== 'record') return;
    const poll = setInterval(async () => {
      setOutboxLength(await getOutboxLength());
    }, 5000);
    return () => clearInterval(poll);
  }, [step]);

  const nextHalf = useCallback(() => {
    if (half === 1) {
      setHalf(2);
      setSeconds(0);
      setFoulsUs(0);
      setFoulsOpponent(0);
      setTimeoutUs(false);
      setTimeoutOpponent(false);
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
      const statsMap: Record<string, { goals: number; yellow_cards: number; red_cards: number; time_played: number }> = {};
      Object.entries(playerStates).forEach(([id, st]) => {
        statsMap[id] = {
          goals: st.stats.goals ?? 0,
          yellow_cards: st.yellowCards,
          red_cards: st.redCards,
          time_played: st.totalTime ?? 0,
        };
      });
      await updateMatch(matchId, {
        score_team: scoreUs,
        score_opponent: scoreOpponent,
        convoquedPlayerIds: convoquedIds,
        playerStats: statsMap,
        goals_by_type: {
          offensive:   goalsByType.offensive   ?? 0,
          transition:  goalsByType.transition  ?? 0,
          cpa:         goalsByType.cpa         ?? 0,
          superiority: goalsByType.superiority ?? 0,
        },
        conceded_by_type: {
          offensive:   concededByType.offensive   ?? 0,
          transition:  concededByType.transition  ?? 0,
          cpa:         concededByType.cpa         ?? 0,
          superiority: concededByType.superiority ?? 0,
        },
      });
      Alert.alert('Match enregistré', 'Score et événements enregistrés.', [
        {
          text: 'Voir le rapport',
          onPress: () => {
            onMatchFinished?.();
            router.push(`/(tabs)/tracker/match-report/${matchId}`);
          },
        },
        { text: 'Terminer', onPress: () => onMatchFinished?.() },
      ]);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer le match");
    } finally {
      setSaving(false);
    }
  }, [matchId, scoreUs, scoreOpponent, playerStates, convoquedIds, goalsByType, concededByType]);

  const opponentActions = [
    { type: 'opponent_goal' as const, label: 'But adverse', color: '#ef4444' },
    { type: 'opponent_shot_on_target' as const, label: 'Tir cadré', color: '#f97316' },
    { type: 'opponent_shot' as const, label: 'Tir adverse', color: '#eab308' },
  ];

  // Bilan stats
  const teamStats = useMemo(() => {
    let onTarget = 0;
    let offTarget = 0;
    let recoveries = 0;
    let ballLoss = 0;
    Object.values(playerStates).forEach((st) => {
      onTarget += st.stats.shotsOnTarget ?? 0;
      offTarget += st.stats.shotsOffTarget ?? 0;
      recoveries += st.stats.ballRecovery ?? 0;
      ballLoss += st.stats.ballLoss ?? 0;
    });
    return { onTarget, offTarget, total: onTarget + offTarget, recoveries, ballLoss };
  }, [playerStates]);

  const statsTableRows = useMemo(() => {
    const rows = convoquedPlayers.map((p) => {
      const st = playerStates[p.id];
      const goals = st?.stats.goals ?? 0;
      const shotsOnTarget = st?.stats.shotsOnTarget ?? 0;
      const shotsOffTarget = st?.stats.shotsOffTarget ?? 0;
      const totalShots = shotsOnTarget + shotsOffTarget;
      const ballLoss = st?.stats.ballLoss ?? 0;
      const recovery = st?.stats.ballRecovery ?? 0;
      const assist = st?.stats.assists ?? 0;
      const totalTime = st?.totalTime ?? 0;
      const yellowCards = st?.yellowCards ?? 0;
      const redCards = st?.redCards ?? 0;
      return {
        id: p.id,
        player: p,
        number: p.number ?? '-',
        name: `${p.first_name} ${p.last_name}`,
        position: p.position ?? '-',
        goals,
        shotsOnTarget,
        totalShots,
        ballLoss,
        recovery,
        assist,
        totalTime,
        plusMinus: plusMinusByPlayer[p.id] ?? 0,
        yellowCards,
        redCards,
      };
    });
    const key = statsSortBy;
    const dir = statsSortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = (a as any)[key];
      const vb = (b as any)[key];
      if (key === 'joueur' || key === 'name') {
        return dir * (a.name.localeCompare(b.name));
      }
      const na = typeof va === 'number' ? va : 0;
      const nb = typeof vb === 'number' ? vb : 0;
      return dir * (na - nb);
    });
  }, [convoquedPlayers, playerStates, plusMinusByPlayer, statsSortBy, statsSortDir]);

  const handleStatsSort = useCallback((col: string) => {
    setStatsSortBy((prevCol) => {
      setStatsSortDir((prevDir) => (prevCol === col ? (prevDir === 'asc' ? 'desc' : 'asc') : 'desc'));
      return col;
    });
  }, []);

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
            {[...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((m) => (
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
  // Le layout tablette a déjà un header qui réserve la safe area, on évite le double padding
  const topPadding = 12;

  return (
    <View style={styles.flex}>
      {/* Header / Barre de contrôle */}
      <View style={[styles.controlBar, { paddingTop: topPadding + 16 }]}>
        <View style={styles.controlRow}>
          <Text style={styles.controlTitle}>
            {match.title || match.opponent_team || 'Match'} - {match.competition}
          </Text>
          <View style={styles.controlActions}>
            {outboxLength > 0 && (
              <View style={styles.syncBadge}>
                <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
                <Text style={styles.syncBadgeText}>{outboxLength}</Text>
              </View>
            )}
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
            <TouchableOpacity
              style={[styles.headerBtn, isListening && styles.headerBtnVoiceActive]}
              onPress={isListening ? stopListening : startListening}
            >
              <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={16} color="#fff" />
              <Text style={styles.headerBtnText}>{isListening ? 'Écoute…' : 'Voix'}</Text>
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
            <View style={styles.chronoHeader}>
              <Text style={styles.chronoLabel}>Chronomètre</Text>
              <Text style={styles.chronoTime}>{formatTime(seconds)}</Text>
              <Text style={styles.chronoHalf}>MT {half}/2</Text>
            </View>
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
            <View style={styles.scoreHeader}>
              <Text style={styles.scoreLabel}>Score</Text>
              <Text style={styles.scoreValue}>{scoreUs} - {scoreOpponent}</Text>
            </View>
            <View style={styles.scoreButtons}>
              <TouchableOpacity
                style={styles.scoreBtnEq}
                onPress={() => setGoalTypeModal({ eventType: 'goal' })}
              >
                <Text style={styles.scoreBtnText}>+1 Éq</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.scoreBtnAdv}
                onPress={() => setGoalTypeModal({ eventType: 'opponent_goal' })}
              >
                <Text style={styles.scoreBtnText}>+1 Adv</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.foulBox}>
            <View style={styles.foulHeader}>
              <Text style={styles.foulLabel}>Fautes</Text>
              <Text style={styles.foulValues}>{foulsUs} - {foulsOpponent}</Text>
            </View>
            <View style={styles.foulButtons}>
              <TouchableOpacity
                style={[styles.foulBtnEq, foulsUs >= 5 && styles.foulBtnWarning]}
                onPress={() => setFoulsUs((n) => {
                  const next = n + 1;
                  if (next === 5) Alert.alert('5e faute équipe', 'La prochaine = jet franc adverse à 10m !');
                  return next;
                })}
              >
                <Text style={styles.foulBtnText}>F. Éq ({foulsUs})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.foulBtnAdv, foulsOpponent >= 5 && styles.foulBtnWarning]}
                onPress={() => setFoulsOpponent((n) => {
                  const next = n + 1;
                  if (next === 5) Alert.alert('5e faute adverse', 'La prochaine = jet franc pour vous à 10m !');
                  return next;
                })}
              >
                <Text style={styles.foulBtnText}>F. Adv ({foulsOpponent})</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.opponentBox}>
            <Text style={styles.opponentLabel}>Actions adverses</Text>
            <View style={styles.opponentButtonsWrapper}>
              <View style={styles.opponentButtons}>
                {opponentActions.map((a) => (
                  <TouchableOpacity
                    key={a.type}
                    style={[styles.opponentBtn, { backgroundColor: a.color }]}
                    onPress={() =>
                      a.type === 'opponent_goal'
                        ? setGoalTypeModal({ eventType: 'opponent_goal' })
                        : recordEvent(a.type)
                    }
                    onLongPress={() => {
                      if (!matchId) return;
                      if (a.type === 'opponent_goal' && scoreOpponent > 0) {
                        setScoreOpponent((n) => Math.max(0, n - 1));
                        setOpponentShotsOnTarget((n) => Math.max(0, n - 1));
                        setOpponentShotsTotal((n) => Math.max(0, n - 1));
                        deleteLastMatchEventByType(matchId, 'opponent_goal', null);
                      } else if (a.type === 'opponent_shot_on_target' && opponentShotsOnTarget > 0) {
                        setOpponentShotsOnTarget((n) => Math.max(0, n - 1));
                        setOpponentShotsTotal((n) => Math.max(0, n - 1));
                        deleteLastMatchEventByType(matchId, 'opponent_shot_on_target', null);
                      } else if (a.type === 'opponent_shot' && opponentShotsTotal > opponentShotsOnTarget) {
                        setOpponentShotsTotal((n) => Math.max(0, n - 1));
                        deleteLastMatchEventByType(matchId, 'opponent_shot', null);
                      }
                    }}
                  >
                    <Text style={styles.opponentBtnText}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.timeoutBox}>
            <Text style={styles.opponentLabel}>Temps morts</Text>
            <View style={styles.timeoutButtons}>
              <TouchableOpacity
                style={[styles.timeoutBtn, timeoutUs && styles.timeoutBtnUsed]}
                onPress={() => setTimeoutUs((v) => !v)}
              >
                <Text style={styles.timeoutBtnText}>{timeoutUs ? 'TM Éq ✓' : 'TM Éq'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeoutBtn, timeoutOpponent && styles.timeoutBtnUsedAdv]}
                onPress={() => setTimeoutOpponent((v) => !v)}
              >
                <Text style={styles.timeoutBtnText}>{timeoutOpponent ? 'TM Adv ✓' : 'TM Adv'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Joueurs sur le terrain - HORS du ScrollView pour un layout horizontal correct */}
      {activeView === 'saisie' && (
        <View style={styles.fieldSection}>
          <Text style={styles.sectionTitle}>Joueurs sur le terrain</Text>
          <View style={styles.fieldCardsRow}>
            {fieldPlayers
              .slice()
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
                const isDragging = draggingPlayerId === player.id;
                const isDropTarget = dropTargetPlayerId === player.id;
                const draggedPlayer = draggingPlayerId
                  ? convoquedPlayers.find((p) => p.id === draggingPlayerId)
                  : null;
                const panGesture = Gesture.Pan()
                  .activateAfterLongPress(700)
                  .runOnJS(true)
                  .onStart(() => {
                    setDraggingPlayerId(player.id);
                    setDropTargetPlayerId(null);
                    dropTargetRef.current = null;
                  })
                  .onUpdate((e) => {
                    handleDragUpdate(player.id, true, e.absoluteX, e.absoluteY);
                  })
                  .onEnd((e) => {
                    handleDragEnd(player.id, true, e.absoluteX, e.absoluteY);
                    setDraggingPlayerId(null);
                    setDropTargetPlayerId(null);
                    dropTargetRef.current = null;
                  })
                  .onFinalize(() => {
                    setDraggingPlayerId(null);
                    setDropTargetPlayerId(null);
                    dropTargetRef.current = null;
                  });
                return (
                  <GestureDetector key={player.id} gesture={panGesture}>
                    <View
                      ref={(r) => {
                        cardRefsRef.current[player.id] = r;
                      }}
                      onLayout={() => {
                        const ref = cardRefsRef.current[player.id];
                        if (ref && 'measureInWindow' in ref) {
                          (ref as any).measureInWindow(
                            (x: number, y: number, w: number, h: number) =>
                              updateCardLayout(player.id, x, y, w, h)
                          );
                        }
                      }}
                      style={[
                        styles.playerCard,
                        isGK && styles.playerCardGK,
                        (isSelected || isDragging) && styles.playerCardSelected,
                        isOverLimit && styles.playerCardOverLimit,
                        isDropTarget && styles.playerCardDropTarget,
                      ]}
                    >
                    {isDropTarget && draggedPlayer && (
                      <View style={styles.dropTargetBadge}>
                        <Text style={styles.dropTargetText} numberOfLines={1}>
                          ↔ Remplacer {draggedPlayer.first_name} {draggedPlayer.last_name}
                        </Text>
                      </View>
                    )}
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
                            <View style={styles.actionRow}>
                              {ACTIONS.slice(0, 3).map((act) => (
                                <TouchableOpacity
                                  key={act.id}
                                  style={[styles.actionMiniBtn, { backgroundColor: act.color }]}
                                  onPress={() => handlePlayerAction(player.id, act.id)}
                                  onLongPress={() => handleUndoPlayerAction(player.id, act.id)}
                                  delayLongPress={300}
                                >
                                  <Text style={styles.actionMiniText}>{act.acronym}</Text>
                                  <Text style={styles.actionMiniCount}>{st.stats[act.id] ?? 0}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <View style={styles.actionRow}>
                              {ACTIONS.slice(3, 6).map((act) => (
                                <TouchableOpacity
                                  key={act.id}
                                  style={[styles.actionMiniBtn, { backgroundColor: act.color }]}
                                  onPress={() => handlePlayerAction(player.id, act.id)}
                                  onLongPress={() => handleUndoPlayerAction(player.id, act.id)}
                                  delayLongPress={300}
                                >
                                  <Text style={styles.actionMiniText}>{act.acronym}</Text>
                                  <Text style={styles.actionMiniCount}>{st.stats[act.id] ?? 0}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>

                        <View style={styles.cardRow}>
                          <TouchableOpacity
                            style={styles.cardYellow}
                            onPress={() => handlePlayerCard(player.id, 'yellow')}
                            onLongPress={() => handleUndoPlayerCard(player.id, 'yellow')}
                            delayLongPress={300}
                          >
                            <Text style={styles.cardText}>{st.yellowCards}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.cardRed}
                            onPress={() => handlePlayerCard(player.id, 'red')}
                            onLongPress={() => handleUndoPlayerCard(player.id, 'red')}
                            delayLongPress={300}
                          >
                            <Text style={styles.cardText}>{st.redCards}</Text>
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          style={[styles.changeBtn, (isSelected || isDragging) && styles.changeBtnActive]}
                          onPress={() => handlePlayerSelection(player.id, true)}
                        >
                          <Text style={styles.changeBtnText}>
                            {isSelected || isDragging ? 'Sélectionné' : 'Sélectionner pour changement'}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                    </View>
                  </GestureDetector>
                );
              })}
          </View>
        </View>
      )}

      {/* Remplaçants - HORS du ScrollView pour un layout horizontal optimisé (7 max) */}
      {activeView === 'saisie' && (
        <View style={styles.benchSection}>
          <Text style={styles.sectionTitle}>Remplaçants</Text>
          <View style={styles.benchGrid}>
              {benchPlayers.map((player) => {
                const st = playerStates[player.id];
                const isGK = (player.position || '').toLowerCase().includes('gardien');
                const isSelected = selectedPlayerForChange === player.id;
                const isDragging = draggingPlayerId === player.id;
                const isDropTarget = dropTargetPlayerId === player.id;
                const draggedPlayer = draggingPlayerId
                  ? convoquedPlayers.find((p) => p.id === draggingPlayerId)
                  : null;
                const benchPanGesture = Gesture.Pan()
                  .activateAfterLongPress(400)
                  .runOnJS(true)
                  .onStart(() => {
                    setDraggingPlayerId(player.id);
                    setDropTargetPlayerId(null);
                    dropTargetRef.current = null;
                  })
                  .onUpdate((e) => {
                    handleDragUpdate(player.id, false, e.absoluteX, e.absoluteY);
                  })
                  .onEnd((e) => {
                    handleDragEnd(player.id, false, e.absoluteX, e.absoluteY);
                    setDraggingPlayerId(null);
                    setDropTargetPlayerId(null);
                    dropTargetRef.current = null;
                  })
                  .onFinalize(() => {
                    setDraggingPlayerId(null);
                    setDropTargetPlayerId(null);
                    dropTargetRef.current = null;
                  });
                return (
                  <GestureDetector key={player.id} gesture={benchPanGesture}>
                    <TouchableOpacity
                      ref={(r) => {
                        cardRefsRef.current[player.id] = r as any;
                      }}
                      onLayout={() => {
                        const ref = cardRefsRef.current[player.id];
                        if (ref && 'measureInWindow' in ref) {
                          (ref as any).measureInWindow(
                            (x: number, y: number, w: number, h: number) =>
                              updateCardLayout(player.id, x, y, w, h)
                          );
                        }
                      }}
                      style={[
                        styles.benchCard,
                        isGK && styles.benchCardGK,
                        (isSelected || isDragging) && styles.benchCardSelected,
                        isDropTarget && styles.benchCardDropTarget,
                      ]}
                      onPress={() => handlePlayerSelection(player.id, false)}
                    >
                    {isDropTarget && draggedPlayer && (
                      <View style={styles.dropTargetBadge}>
                        <Text style={styles.dropTargetText} numberOfLines={1}>
                          ↔ Remplacer {draggedPlayer.first_name} {draggedPlayer.last_name}
                        </Text>
                      </View>
                    )}
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
                        <Text style={[styles.changeBtnText, (isSelected || isDragging) && { color: '#fff', fontWeight: '600' }]}>
                          {isSelected || isDragging ? 'Sélectionné' : 'Entrer'}
                        </Text>
                      </>
                    )}
                    </TouchableOpacity>
                  </GestureDetector>
                );
              })}
          </View>
        </View>
      )}

      {/* Contenu principal */}
      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}>
        {activeView === 'bilan' ? (
          <View style={styles.bilanContainer}>
            <View style={styles.bilanGrid}>
              <View style={styles.bilanCard}>
                <Text style={styles.bilanCardTitle}>Statistiques de l'équipe</Text>
                <View style={styles.bilanStatsGrid}>
                  <View style={[styles.bilanStatBox, styles.bilanStatGray]}>
                    <Text style={[styles.bilanStatNumber, styles.bilanStatNumberGray]}>{teamStats.total}</Text>
                    <Text style={[styles.bilanStatLabel, styles.bilanStatLabelGray]}>Tirs totaux</Text>
                  </View>
                  <View style={[styles.bilanStatBox, styles.bilanStatGreen]}>
                    <Text style={[styles.bilanStatNumber, styles.bilanStatNumberGreen]}>{teamStats.onTarget}</Text>
                    <Text style={[styles.bilanStatLabel, styles.bilanStatLabelGreen]}>Tirs cadrés</Text>
                  </View>
                  <View style={[styles.bilanStatBox, styles.bilanStatPurple]}>
                    <Text style={[styles.bilanStatNumber, styles.bilanStatNumberPurple]}>{teamStats.recoveries}</Text>
                    <Text style={[styles.bilanStatLabel, styles.bilanStatLabelPurple]}>Récupérations</Text>
                  </View>
                  <View style={[styles.bilanStatBox, styles.bilanStatRed]}>
                    <Text style={[styles.bilanStatNumber, styles.bilanStatNumberRed]}>{teamStats.ballLoss}</Text>
                    <Text style={[styles.bilanStatLabel, styles.bilanStatLabelRed]} numberOfLines={2}>Pertes de balles amenant une transition</Text>
                  </View>
                </View>
              </View>
              <View style={styles.bilanCard}>
                <Text style={styles.bilanCardTitle}>Statistiques de l'adversaire</Text>
                <View style={styles.bilanStatsRow}>
                  <View style={[styles.bilanStatBox, styles.bilanStatGray]}>
                    <Text style={[styles.bilanStatNumber, styles.bilanStatNumberGray]}>{opponentShotsTotal}</Text>
                    <Text style={[styles.bilanStatLabel, styles.bilanStatLabelGray]}>Nombre de tirs concédés</Text>
                  </View>
                  <View style={[styles.bilanStatBox, styles.bilanStatYellow]}>
                    <Text style={[styles.bilanStatNumber, styles.bilanStatNumberYellow]}>{opponentShotsOnTarget}</Text>
                    <Text style={[styles.bilanStatLabel, styles.bilanStatLabelYellow]}>Nombre tirs cadrés concédés</Text>
                  </View>
                </View>
              </View>
            </View>
            {/* Tableau des stats individuelles (triable) */}
            <View style={styles.statsTableCard}>
              <View style={styles.statsTableInner}>
                {/* Header */}
                <View style={styles.statsTableHeader}>
                  {STATS_TABLE_COLUMNS.map((col) => (
                    <TouchableOpacity
                      key={col.key}
                      style={[
                        styles.statsTableHeaderCell,
                        { flex: col.flex },
                        col.type === 'player' && styles.statsTableHeaderCellPlayer,
                      ]}
                        onPress={() => handleStatsSort(col.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.statsTableHeaderText} numberOfLines={1}>{col.label}</Text>
                        <View style={styles.statsTableSortIcons}>
                          <Ionicons
                            name="chevron-up"
                            size={12}
                            color={statsSortBy === col.key && statsSortDir === 'asc' ? '#3b82f6' : '#94a3b8'}
                          />
                          <Ionicons
                            name="chevron-down"
                            size={12}
                            color={statsSortBy === col.key && statsSortDir === 'desc' ? '#3b82f6' : '#94a3b8'}
                          />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Rows */}
                  {statsTableRows.map((row, idx) => (
                    <View
                      key={row.id}
                      style={[
                        styles.statsTableRow,
                        idx % 2 === 1 && styles.statsTableRowZebra,
                      ]}
                    >
                      {STATS_TABLE_COLUMNS.map((col) => {
                        const val = (row as any)[col.key] ?? (col.type === 'player' ? row : 0);
                        const cellStyle = [styles.statsTableCell, { flex: col.flex }];
                        if (col.type === 'player') {
                          return (
                            <View key={col.key} style={[...cellStyle, styles.statsTableCellPlayer]}>
                              <View style={styles.statsTablePlayerNum}>
                                <Text style={styles.statsTablePlayerNumText}>{row.number}</Text>
                              </View>
                              <View style={styles.statsTablePlayerInfo}>
                                <Text style={styles.statsTablePlayerName} numberOfLines={1}>{row.name}</Text>
                                <Text style={styles.statsTablePlayerPos}>{row.position}</Text>
                              </View>
                            </View>
                          );
                        }
                        if (col.type === 'circle') {
                          return (
                            <View key={col.key} style={cellStyle}>
                              <View style={[styles.statsTableCircle, { backgroundColor: col.color }]}>
                                <Text style={styles.statsTableCircleText}>{Number(val)}</Text>
                              </View>
                            </View>
                          );
                        }
                        if (col.type === 'time') {
                          return (
                            <View key={col.key} style={cellStyle}>
                              <View style={styles.statsTableTimePill}>
                                <Text style={styles.statsTableTimePillText}>{formatTime(Number(val))}</Text>
                              </View>
                            </View>
                          );
                        }
                        if (col.type === 'plusminus') {
                          const n = Number(val);
                          const isNeg = n < 0;
                          return (
                            <View key={col.key} style={cellStyle}>
                              <View style={[styles.statsTablePmPill, isNeg && styles.statsTablePmPillNeg]}>
                                <Text style={[styles.statsTablePmText, isNeg && styles.statsTablePmTextNeg]}>
                                  {n > 0 ? `+${n}` : n}
                                </Text>
                              </View>
                            </View>
                          );
                        }
                        return (
                          <View key={col.key} style={cellStyle}>
                            <Text style={styles.statsTableCardText}>{Number(val)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {voiceFeedback && (
        <View style={styles.voiceFeedbackOverlay} pointerEvents="none">
          <View style={styles.voiceFeedbackBox}>
            <Ionicons name="mic" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.voiceFeedbackText} numberOfLines={2}>{voiceFeedback}</Text>
          </View>
        </View>
      )}

      <Modal visible={!!goalTypeModal} transparent animationType="fade">
        <Pressable
          style={styles.goalTypeOverlay}
          onPress={() => {
            // Ignorer les taps dans les 300 ms suivant l'ouverture (ghost-tap passthrough)
            if (Date.now() - modalOpenedAtRef.current > 300) setGoalTypeModal(null);
          }}
        >
          <Pressable style={styles.goalTypeBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.goalTypeTitle}>
              {goalTypeModal?.eventType === 'goal' ? 'Type de but marqué' : 'Type de but encaissé'}
            </Text>
            {GOAL_TYPES.map((g) => (
              <TouchableOpacity
                key={g.value}
                style={styles.goalTypeOption}
                onPress={() => handleGoalTypeSelect(g.value)}
              >
                <Text style={styles.goalTypeOptionText}>{g.label}</Text>
                <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.goalTypeCancel} onPress={() => setGoalTypeModal(null)}>
              <Text style={styles.goalTypeCancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  headerBtnVoiceActive: { backgroundColor: '#16a34a' },
  finishBtn: { backgroundColor: '#dc2626' },
  headerBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  voiceFeedbackOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  voiceFeedbackBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.88)', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, maxWidth: '80%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 },
  voiceFeedbackText: { color: '#fff', fontWeight: '700', fontSize: 15, flexShrink: 1 },

  controlsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignSelf: 'stretch',
  },
  controlsGridWide: { flexDirection: 'row', flexWrap: 'nowrap' },
  chronoBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 8,
    flex: 22,
    minWidth: 120,
    alignItems: 'center',
  },
  chronoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginBottom: 4, gap: 8 },
  chronoLabel: { fontSize: 11, color: '#94a3b8' },
  chronoTime: { fontSize: 20, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  chronoHalf: { fontSize: 11, color: '#94a3b8' },
  chronoButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chronoBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chronoBtnPlay: { backgroundColor: '#16a34a' },
  chronoBtnHalf: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 8,
    flex: 15,
    minWidth: 100,
    alignItems: 'center',
  },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginBottom: 4 },
  scoreLabel: { fontSize: 11, color: '#64748b' },
  scoreValue: { fontSize: 18, fontWeight: '700', color: '#1e293b', fontVariant: ['tabular-nums'] },
  scoreButtons: { flexDirection: 'row', gap: 6, marginTop: 4 },
  scoreBtnEq: { flex: 1, backgroundColor: '#22c55e', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', minHeight: 40 },
  scoreBtnAdv: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', minHeight: 40 },
  scoreBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  foulBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 8,
    flex: 20,
    minWidth: 110,
  },
  foulHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  foulLabel: { fontSize: 11, color: '#64748b' },
  foulValues: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  foulButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  foulBtnEq: { flex: 1, backgroundColor: '#3b82f6', paddingVertical: 10, borderRadius: 8, alignItems: 'center', minHeight: 40 },
  foulBtnAdv: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 10, borderRadius: 8, alignItems: 'center', minHeight: 40 },
  foulBtnWarning: { backgroundColor: '#f97316' },
  foulBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  timeoutBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 8,
    flex: 16,
    minWidth: 100,
  },
  timeoutButtons: { flexDirection: 'row', gap: 6, marginTop: 4 },
  timeoutBtn: { flex: 1, backgroundColor: '#64748b', paddingVertical: 10, borderRadius: 8, alignItems: 'center', minHeight: 40 },
  timeoutBtnUsed: { backgroundColor: '#3b82f6' },
  timeoutBtnUsedAdv: { backgroundColor: '#dc2626' },
  timeoutBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  syncBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  opponentBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 8,
    flex: 30,
    minWidth: 130,
    height: 100,
    alignItems: 'center',
  },
  opponentLabel: { fontSize: 11, color: '#64748b', marginBottom: 4, alignSelf: 'stretch', textAlign: 'center' },
  opponentButtonsWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', alignSelf: 'stretch' },
  opponentButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  opponentBtn: { paddingHorizontal: 8, paddingVertical: 10, borderRadius: 8, minHeight: 40, justifyContent: 'center' },
  opponentBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  mainScroll: { flex: 1 },
  mainContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 12, marginTop: 8 },

  fieldSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  fieldCardsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 8,
  },
  playerCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: '#22c55e',
    alignItems: 'center',
  },
  playerCardGK: { borderColor: '#f59e0b' },
  playerCardSelected: { borderColor: '#3b82f6', shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8 },
  playerCardOverLimit: { borderColor: '#dc2626' },
  playerCardDropTarget: {
    borderColor: '#16a34a',
    borderWidth: 3,
    backgroundColor: '#dcfce7',
  },
  dropTargetBadge: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  dropTargetText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  playerName: { fontSize: 14, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  playerMeta: { fontSize: 11, color: '#64748b', marginTop: 2, textAlign: 'center' },
  playerTimeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, alignSelf: 'stretch' },
  playerTimeLabel: { fontSize: 10, color: '#64748b' },
  playerTimeValue: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  playerTimeOver: { color: '#dc2626' },
  playerLimit: { fontSize: 10, color: '#94a3b8', marginTop: 2, textAlign: 'center' },
  actionGrid: {
    flexDirection: 'column',
    gap: 6,
    marginTop: 10,
    alignSelf: 'stretch',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 5,
  },
  actionMiniBtn: {
    flex: 1,
    minWidth: 32,
    minHeight: 36,
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
    paddingHorizontal: 12,
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  changeBtnActive: { backgroundColor: '#3b82f6' },
  changeBtnText: { fontSize: 12, color: '#475569', fontWeight: '500' },

  benchSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  benchGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 8,
  },
  benchCard: {
    flex: 1,
    minWidth: 80,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  benchCardGK: { borderColor: '#f59e0b', borderWidth: 2 },
  benchCardSelected: { borderColor: '#3b82f6', borderWidth: 2, backgroundColor: '#eff6ff' },
  benchCardDropTarget: {
    borderColor: '#16a34a',
    borderWidth: 3,
    backgroundColor: '#dcfce7',
  },
  benchName: { fontSize: 13, fontWeight: '600', color: '#1e293b', textAlign: 'center' },
  benchMeta: { fontSize: 11, color: '#64748b', marginTop: 2, textAlign: 'center' },
  benchTime: { fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 6, textAlign: 'center' },
  benchCards: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 },
  benchCardDot: { width: 12, height: 12, borderRadius: 6 },
  benchCardCount: { fontSize: 11, marginLeft: 2 },

  bilanContainer: { paddingVertical: 4 },
  bilanGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  bilanCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  bilanCardTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  bilanStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bilanStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bilanStatBox: {
    flex: 1,
    minWidth: 100,
    height: 72,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bilanStatGray: { backgroundColor: '#f1f5f9' },
  bilanStatGreen: { backgroundColor: '#dcfce7' },
  bilanStatPurple: { backgroundColor: '#f3e8ff' },
  bilanStatRed: { backgroundColor: '#fee2e2' },
  bilanStatYellow: { backgroundColor: '#fef9c3' },
  bilanStatNumber: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bilanStatNumberGray: { color: '#475569' },
  bilanStatNumberGreen: { color: '#16a34a' },
  bilanStatNumberPurple: { color: '#a855f7' },
  bilanStatNumberRed: { color: '#dc2626' },
  bilanStatNumberYellow: { color: '#eab308' },
  bilanStatLabel: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  bilanStatLabelGray: { color: '#64748b' },
  bilanStatLabelGreen: { color: '#16a34a', fontWeight: '500' },
  bilanStatLabelPurple: { color: '#a855f7', fontWeight: '500' },
  bilanStatLabelRed: { color: '#dc2626', fontWeight: '500' },
  bilanStatLabelYellow: { color: '#ca8a04', fontWeight: '500' },

  statsTableCard: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  statsTableInner: {
    alignSelf: 'stretch',
  },
  statsTableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 10,
    marginBottom: 4,
  },
  statsTableHeaderCell: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statsTableHeaderCellPlayer: {
    alignItems: 'flex-start',
  },
  statsTableHeaderText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  statsTableSortIcons: {
    flexDirection: 'row',
    marginTop: 2,
  },
  statsTableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    flexShrink: 0,
  },
  statsTableRowZebra: {
    backgroundColor: '#f8fafc',
  },
  statsTableCell: {
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statsTableCellPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  statsTablePlayerInfo: {
    flex: 1,
    minWidth: 0,
  },
  statsTablePlayerNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsTablePlayerNumText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  statsTablePlayerName: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  statsTablePlayerPos: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  statsTableCircle: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  statsTableCircleText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  statsTableTimePill: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statsTableTimePillText: { fontSize: 12, fontWeight: '600', color: '#fff', fontVariant: ['tabular-nums'] },
  statsTablePmPill: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statsTablePmPillNeg: { backgroundColor: '#dc2626' },
  statsTablePmText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  statsTablePmTextNeg: { color: '#fff' },
  statsTableCardText: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  goalTypeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  goalTypeBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  goalTypeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
  },
  goalTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    marginBottom: 8,
  },
  goalTypeOptionText: { fontSize: 16, fontWeight: '500', color: '#1e293b' },
  goalTypeCancel: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  goalTypeCancelText: { fontSize: 15, color: '#64748b', fontWeight: '500' },
});
