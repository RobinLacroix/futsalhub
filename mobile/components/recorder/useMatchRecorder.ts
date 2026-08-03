/**
 * useMatchRecorder — état partagé des deux match recorders (P1-3)
 *
 * `PhoneMatchRecorder` (1 283 l.) et `TabletMatchRecorder` (1 984 l.) portaient
 * chacun leur copie du chrono, du chargement, de l'enregistrement d'événement,
 * de la substitution et de la sauvegarde. Deux copies qui ont divergé sur des
 * points qui touchent la donnée réelle. Ce hook est la version unique, et il
 * corrige quatre défauts qui étaient dans les deux, ou dans une seule :
 *
 * ## 1. Le chrono repartait de zéro à chaque changement
 *
 * L'effet du `setInterval` dépendait de `playersOnField`. Chaque substitution
 * détruisait l'intervalle et en recréait un : la fraction de seconde en cours
 * était perdue. Sur un match à vingt changements, le chrono retardait d'autant.
 * Il perdait aussi tout le temps passé en arrière-plan, iOS suspendant les
 * timers JS — un téléphone rangé dans la poche arrêtait le match.
 *
 * Le temps se calcule maintenant par différence d'horodatage : l'intervalle ne
 * fait que déclencher la relecture de l'horloge, il ne compte plus. Il ne
 * dépend plus que de `isRunning` et rattrape le retard au retour de veille.
 *
 * ## 2. L'annulation d'un but laissait un tir cadré orphelin
 *
 * Un but écrit deux lignes : le but, plus le tir cadré qui l'accompagne.
 * L'annulation n'en supprimait qu'une. Le tir fantôme restait en base et
 * remontait dans le rapport de match et les analytics, pour toujours.
 * `PAIRED_EVENT` traite les deux.
 *
 * ## 3. La tablette ne sauvegardait rien
 *
 * Le téléphone persistait l'état dans `AsyncStorage` toutes les 5 s. La
 * tablette n'importait même pas le module. Un plantage sur iPad — l'appareil de
 * bord de terrain — perdait le match entier : temps de jeu, fautes, séquences.
 * La persistance est maintenant dans le hook, donc dans les deux.
 *
 * ## 4. Les fautes de première mi-temps disparaissaient
 *
 * Le règlement futsal remet les fautes cumulées à zéro à la mi-temps, donc
 * `nextHalf()` remettait le compteur à 0 — et la sauvegarde n'écrivait que la
 * valeur courante. Les fautes de la première période n'étaient enregistrées
 * nulle part. Elles sont maintenant conservées par mi-temps et additionnées à
 * la sauvegarde.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { getMatchesByTeam, getMatchById, updateMatch } from '../../lib/services/matches';
import {
  getEventsByMatchId,
  createMatchEvent,
  deleteLastMatchEventByType,
  type GoalType,
} from '../../lib/services/matchEvents';
import { getPlayersByTeam } from '../../lib/services/players';
import { getOutboxLength } from '../../lib/offline/matchRecorderOutbox';
import {
  saveRecorderState,
  loadRecorderState,
  clearRecorderState,
} from '../../lib/offline/matchRecorderState';
import { parseMatchPlayers } from '../../utils/matchUtils';
import { haptics } from '../../lib/design/haptics';
import type { Match, MatchEventType, Player } from '../../types';
import {
  DEFAULT_SEQUENCE_LIMIT,
  EVENT_TO_STAT,
  FIELD_SIZE,
  OPPONENT_ACTIONS,
  PAIRED_EVENT,
  PLAYER_ACTIONS,
  emptyPlayerState,
  type PlayerState,
  type StatRow,
} from './recorderModel';

const labelOf = (e: MatchEventType) =>
  PLAYER_ACTIONS.find((a) => a.eventType === e)?.label ??
  OPPONENT_ACTIONS.find((a) => a.eventType === e)?.label ??
  'Action';

export type GoalTypeTally = Record<string, number>;

const EMPTY_TALLY: GoalTypeTally = { offensive: 0, transition: 0, cpa: 0, superiority: 0 };

/**
 * Dernière saisie, pour l'annulation globale.
 *
 * Aucune des deux versions n'offrait « annuler ce que je viens de faire » :
 * il fallait retrouver le bouton exact de l'action et faire un appui long
 * dessus. Or la faute de frappe en direct, c'est toujours la dernière — le
 * coach a appuyé sur le mauvais joueur ou la mauvaise action une seconde plus
 * tôt, et ne sait déjà plus laquelle.
 */
export interface RecordedAction {
  eventType: MatchEventType;
  statKey: string;
  playerId: string | null;
  label: string;
  at: number;
}

/** Profondeur de la pile d'annulation. Au-delà, le coach passe par le bilan. */
const UNDO_DEPTH = 12;

/**
 * Délai avant de signaler un chrono à l'arrêt, hors saisie d'action.
 * 25 s : plus long qu'une pause volontaire pour souffler, bien plus court que
 * la minute d'un temps mort — dont la reprise oubliée est justement le cas
 * qu'on veut rattraper.
 */
const IDLE_GRACE_MS = 25_000;

export interface UseMatchRecorderOptions {
  initialMatchId?: string | null;
  onMatchFinished?: () => void;
}

export function useMatchRecorder({ initialMatchId, onMatchFinished }: UseMatchRecorderOptions) {
  const { activeTeamId } = useActiveTeam();

  const [step, setStep] = useState<'select' | 'record'>(initialMatchId ? 'record' : 'select');
  const [matchId, setMatchId] = useState<string | null>(initialMatchId ?? null);

  const [matches, setMatches] = useState<Match[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [half, setHalf] = useState<1 | 2>(1);
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const [scoreUs, setScoreUs] = useState(0);
  const [scoreOpponent, setScoreOpponent] = useState(0);
  const [foulsUs, setFoulsUs] = useState(0);
  const [foulsOpponent, setFoulsOpponent] = useState(0);
  // Fautes des mi-temps déjà terminées : le règlement les remet à zéro à
  // l'affichage, la base doit garder le total du match.
  const [pastFoulsUs, setPastFoulsUs] = useState(0);
  const [pastFoulsOpponent, setPastFoulsOpponent] = useState(0);

  const [opponentShotsTotal, setOpponentShotsTotal] = useState(0);
  const [opponentShotsOnTarget, setOpponentShotsOnTarget] = useState(0);

  const [playersOnField, setPlayersOnField] = useState<string[]>([]);
  const [playerStates, setPlayerStates] = useState<Record<string, PlayerState>>({});
  const [plusMinusByPlayer, setPlusMinusByPlayer] = useState<Record<string, number>>({});
  const [goalsByType, setGoalsByType] = useState<GoalTypeTally>(EMPTY_TALLY);
  const [concededByType, setConcededByType] = useState<GoalTypeTally>(EMPTY_TALLY);

  const [timeoutUs, setTimeoutUs] = useState(false);
  const [timeoutOpponent, setTimeoutOpponent] = useState(false);
  const [outboxLength, setOutboxLength] = useState(0);
  const [history, setHistory] = useState<RecordedAction[]>([]);

  // ── Dérivées ──────────────────────────────────────────────────────────────

  const convoquedIds = useMemo(
    () => (match ? parseMatchPlayers(match).map((p) => p.id) : []),
    [match]
  );

  const convoquedPlayers = useMemo(() => {
    const ids = new Set(convoquedIds);
    return players.filter((p) => ids.has(p.id));
  }, [players, convoquedIds]);

  const fieldPlayers = useMemo(
    () =>
      playersOnField
        .map((id) => convoquedPlayers.find((p) => p.id === id))
        .filter((p): p is Player => !!p),
    [playersOnField, convoquedPlayers]
  );

  const benchPlayers = useMemo(() => {
    const onField = new Set(playersOnField);
    return convoquedPlayers.filter((p) => !onField.has(p.id));
  }, [convoquedPlayers, playersOnField]);

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

  const statRows: StatRow[] = useMemo(
    () =>
      convoquedPlayers.map((p) => {
        const st = playerStates[p.id];
        const onTarget = st?.stats.shotsOnTarget ?? 0;
        const offTarget = st?.stats.shotsOffTarget ?? 0;
        return {
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          firstName: p.first_name,
          lastName: p.last_name,
          number: p.number ?? 0,
          goals: st?.stats.goals ?? 0,
          shotsOnTarget: onTarget,
          totalShots: onTarget + offTarget,
          ballRecovery: st?.stats.ballRecovery ?? 0,
          ballLoss: st?.stats.ballLoss ?? 0,
          assists: st?.stats.assists ?? 0,
          totalTime: st?.totalTime ?? 0,
          plusMinus: plusMinusByPlayer[p.id] ?? 0,
          yellowCards: st?.yellowCards ?? 0,
          redCards: st?.redCards ?? 0,
        };
      }),
    [convoquedPlayers, playerStates, plusMinusByPlayer]
  );

  // ── Chargement ────────────────────────────────────────────────────────────

  const loadMatches = useCallback(async () => {
    if (!activeTeamId) {
      setMatches([]);
      setLoading(false);
      return;
    }
    try {
      setMatches(await getMatchesByTeam(activeTeamId));
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
    if (initialMatchId && matches.some((m) => m.id === initialMatchId)) {
      setMatchId(initialMatchId);
      setStep('record');
    }
  }, [initialMatchId, matches]);

  useEffect(() => {
    if (step !== 'record' || !matchId) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, roster] = await Promise.all([
          getMatchById(matchId),
          activeTeamId ? getPlayersByTeam(activeTeamId) : Promise.resolve([]),
        ]);
        if (cancelled || !m) return;
        setMatch(m);

        const called = parseMatchPlayers(m);
        const ids = called.map((p) => p.id);
        const calledSet = new Set(ids);
        // Les joueurs partis restent visibles s'ils étaient convoqués : on ne
        // réécrit pas l'histoire d'un match déjà joué.
        setPlayers(roster.filter((p) => p.status !== 'left' || calledSet.has(p.id)));
        setPlayersOnField(ids.slice(0, FIELD_SIZE));
        setScoreUs(m.score_team ?? 0);
        setScoreOpponent(m.score_opponent ?? 0);
        setFoulsUs(m.fouls_team ?? 0);
        setFoulsOpponent(m.fouls_opponent ?? 0);

        const playedByPlayer = new Map(called.map((mp) => [mp.id, mp.time_played ?? 0]));
        const states: Record<string, PlayerState> = {};
        roster.forEach((p) => {
          if (!calledSet.has(p.id)) return;
          const limit =
            (p as Player & { sequence_time_limit?: number }).sequence_time_limit ??
            DEFAULT_SEQUENCE_LIMIT;
          states[p.id] = emptyPlayerState(p.id, limit, playedByPlayer.get(p.id) ?? 0);
        });
        setPlayerStates(states);

        const events = await getEventsByMatchId(matchId);
        if (cancelled || events.length === 0) return;

        const last = events[events.length - 1];
        setHalf(last.half as 1 | 2);
        setSeconds(last.match_time_seconds);
        setScoreUs((prev) => Math.max(prev, events.filter((e) => e.event_type === 'goal').length));
        setScoreOpponent((prev) =>
          Math.max(prev, events.filter((e) => e.event_type === 'opponent_goal').length)
        );
        setOpponentShotsTotal(
          events.filter(
            (e) => e.event_type === 'opponent_shot' || e.event_type === 'opponent_shot_on_target'
          ).length
        );
        setOpponentShotsOnTarget(
          events.filter((e) => e.event_type === 'opponent_shot_on_target').length
        );

        setPlayerStates((prev) => {
          const next = { ...prev };
          events.forEach((ev) => {
            if (!ev.player_id || !next[ev.player_id]) return;
            const st = next[ev.player_id];
            if (ev.event_type === 'yellow_card') {
              next[ev.player_id] = { ...st, yellowCards: st.yellowCards + 1 };
            } else if (ev.event_type === 'red_card') {
              next[ev.player_id] = { ...st, redCards: st.redCards + 1 };
            } else if (EVENT_TO_STAT[ev.event_type]) {
              const k = EVENT_TO_STAT[ev.event_type];
              next[ev.player_id] = { ...st, stats: { ...st.stats, [k]: (st.stats[k] ?? 0) + 1 } };
            }
          });
          return next;
        });

        const pm: Record<string, number> = {};
        const scored: GoalTypeTally = { ...EMPTY_TALLY };
        const conceded: GoalTypeTally = { ...EMPTY_TALLY };
        events.forEach((ev) => {
          const isGoal = ev.event_type === 'goal';
          const isConceded = ev.event_type === 'opponent_goal';
          if (!isGoal && !isConceded) return;
          if (Array.isArray(ev.players_on_field)) {
            const delta = isGoal ? 1 : -1;
            ev.players_on_field.forEach((pid) => {
              pm[pid] = (pm[pid] ?? 0) + delta;
            });
          }
          if (ev.goal_type) {
            const tally = isGoal ? scored : conceded;
            tally[ev.goal_type] = (tally[ev.goal_type] ?? 0) + 1;
          }
        });
        setPlusMinusByPlayer(pm);
        setGoalsByType(scored);
        setConcededByType(conceded);
      } catch {
        if (!cancelled) setMatch(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, matchId, activeTeamId]);

  // Reprise après plantage : écrase ce qui vient d'être chargé depuis la base,
  // parce que l'état local est plus récent que le dernier `updateMatch`.
  useEffect(() => {
    if (step !== 'record' || !matchId) return;
    loadRecorderState(matchId)
      .then((saved) => {
        if (!saved) return;
        setHalf(saved.half);
        setSeconds(saved.seconds);
        setScoreUs(saved.scoreUs);
        setScoreOpponent(saved.scoreOpponent);
        setFoulsUs(saved.foulsUs);
        setFoulsOpponent(saved.foulsOpponent);
        setPlayersOnField(saved.playersOnField);
        setPlayerStates((prev) => {
          const merged = { ...prev };
          Object.entries(saved.playerStates).forEach(([id, st]) => {
            if (merged[id]) merged[id] = { ...merged[id], ...st };
          });
          return merged;
        });
      })
      .catch(() => {});
  }, [step, matchId]);

  // ── Chrono par horodatage ─────────────────────────────────────────────────

  // Miroir des joueurs sur le terrain : lu dans le tick sans le mettre en
  // dépendance, pour que l'intervalle survive aux substitutions.
  const fieldRef = useRef<string[]>(playersOnField);
  useEffect(() => {
    fieldRef.current = playersOnField;
  }, [playersOnField]);

  const lastTickRef = useRef<number>(Date.now());

  const applyElapsed = useCallback(() => {
    const now = Date.now();
    const delta = Math.floor((now - lastTickRef.current) / 1000);
    if (delta <= 0) return;
    lastTickRef.current += delta * 1000;
    setSeconds((s) => s + delta);
    setPlayerStates((prev) => {
      const next = { ...prev };
      fieldRef.current.forEach((id) => {
        const st = next[id];
        if (st) {
          next[id] = {
            ...st,
            totalTime: st.totalTime + delta,
            currentSequenceTime: st.currentSequenceTime + delta,
          };
        }
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    lastTickRef.current = Date.now();
    const id = setInterval(applyElapsed, 1000);
    // Au retour d'arrière-plan, iOS a pu suspendre l'intervalle : on rattrape
    // immédiatement au lieu d'attendre le tick suivant.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') applyElapsed();
    });
    return () => {
      clearInterval(id);
      sub.remove();
      applyElapsed();
    };
  }, [isRunning, applyElapsed]);

  const toggleClock = useCallback(() => {
    haptics.tapMedium();
    setIsRunning((r) => !r);
  }, []);

  const startClock = useCallback(() => {
    haptics.tapMedium();
    setIsRunning(true);
  }, []);

  // ── Détection du chrono oublié ────────────────────────────────────────────

  /**
   * Deux oublis coûtent la même chose : le coup d'envoi non lancé, et la reprise
   * après temps mort. Dans les deux cas les temps de jeu de la séquence sont
   * perdus — la donnée que ce recorder existe pour produire.
   *
   * Deux déclencheurs, de sensibilité différente :
   *
   * - **Immédiat** si une action est saisie alors que le chrono est arrêté.
   *   C'est le signal le plus net qu'il y a du jeu : personne ne note un tir
   *   pendant un temps mort.
   * - **Après {@link IDLE_GRACE_MS}** sinon. Assez long pour ne pas harceler
   *   pendant une pause volontaire, assez court pour rattraper un coup d'envoi.
   */
  const [stoppedSince, setStoppedSince] = useState<number>(() => Date.now());
  const [idleTick, setIdleTick] = useState(0);

  useEffect(() => {
    if (!isRunning) setStoppedSince(Date.now());
  }, [isRunning]);

  const matchIsLive = seconds > 0 || history.length > 0;

  useEffect(() => {
    if (isRunning || !matchIsLive || step !== 'record') return;
    const id = setInterval(() => setIdleTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning, matchIsLive, step]);

  const clockForgotten = useMemo(() => {
    void idleTick; // relance l'évaluation à chaque seconde d'arrêt
    if (isRunning || !matchIsLive || step !== 'record') return false;
    const last = history[0];
    if (last && last.at > stoppedSince) return true;
    return Date.now() - stoppedSince > IDLE_GRACE_MS;
  }, [idleTick, isRunning, matchIsLive, step, history, stoppedSince]);

  // ── Persistance locale ────────────────────────────────────────────────────

  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!matchId || step !== 'record') return;
    if (throttleRef.current) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => {
      saveRecorderState({
        matchId,
        half,
        seconds,
        scoreUs,
        scoreOpponent,
        foulsUs,
        foulsOpponent,
        playersOnField,
        playerStates,
        savedAt: Date.now(),
      });
    }, 5000);
    return () => {
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [
    matchId,
    step,
    half,
    seconds,
    scoreUs,
    scoreOpponent,
    foulsUs,
    foulsOpponent,
    playersOnField,
    playerStates,
  ]);

  useEffect(() => {
    if (step !== 'record') return;
    const check = () => getOutboxLength().then(setOutboxLength).catch(() => {});
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [step]);

  // ── Enregistrement d'un événement ─────────────────────────────────────────

  const recordEvent = useCallback(
    async (
      eventType: MatchEventType,
      playerId?: string | null,
      statKey?: string,
      goalType?: GoalType | null
    ) => {
      if (!matchId) return;
      // Retour haptique avant tout aller-retour réseau : le coach regarde le
      // terrain, pas son écran. Un but est plus marquant qu'une récupération.
      if (eventType === 'goal' || eventType === 'opponent_goal') haptics.tapMedium();
      else haptics.tapLight();

      const base = {
        match_id: matchId,
        match_time_seconds: seconds,
        half,
        players_on_field: playersOnField,
      };
      const pid = playerId ?? null;

      try {
        await createMatchEvent({
          ...base,
          event_type: eventType,
          player_id: pid,
          goal_type:
            eventType === 'goal' || eventType === 'opponent_goal' ? goalType ?? null : undefined,
        });

        const paired = PAIRED_EVENT[eventType];
        if (paired) {
          await createMatchEvent({
            ...base,
            event_type: paired,
            player_id: eventType === 'goal' ? pid : null,
          });
        }

        if (eventType === 'goal') {
          setScoreUs((n) => n + 1);
          if (goalType) setGoalsByType((prev) => ({ ...prev, [goalType]: (prev[goalType] ?? 0) + 1 }));
          setPlusMinusByPlayer((prev) => {
            const next = { ...prev };
            playersOnField.forEach((p) => {
              next[p] = (next[p] ?? 0) + 1;
            });
            return next;
          });
        }

        if (eventType === 'opponent_goal') {
          setScoreOpponent((n) => n + 1);
          if (goalType)
            setConcededByType((prev) => ({ ...prev, [goalType]: (prev[goalType] ?? 0) + 1 }));
          setPlusMinusByPlayer((prev) => {
            const next = { ...prev };
            playersOnField.forEach((p) => {
              next[p] = (next[p] ?? 0) - 1;
            });
            return next;
          });
        }

        if (eventType === 'opponent_goal' || eventType === 'opponent_shot_on_target') {
          setOpponentShotsOnTarget((n) => n + 1);
          setOpponentShotsTotal((n) => n + 1);
        }
        if (eventType === 'opponent_shot') setOpponentShotsTotal((n) => n + 1);

        if (pid && statKey) {
          setPlayerStates((prev) => {
            const st = prev[pid];
            if (!st) return prev;
            const stats = { ...st.stats, [statKey]: (st.stats[statKey] ?? 0) + 1 };
            if (eventType === 'goal') stats.shotsOnTarget = (st.stats.shotsOnTarget ?? 0) + 1;
            return { ...prev, [pid]: { ...st, stats } };
          });
        }

        if (pid && (eventType === 'yellow_card' || eventType === 'red_card')) {
          setPlayerStates((prev) => {
            const st = prev[pid];
            if (!st) return prev;
            return {
              ...prev,
              [pid]: {
                ...st,
                yellowCards: eventType === 'yellow_card' ? st.yellowCards + 1 : st.yellowCards,
                redCards: eventType === 'red_card' ? st.redCards + 1 : st.redCards,
              },
            };
          });
        }
        setHistory((h) =>
          [
            {
              eventType,
              statKey: statKey ?? '',
              playerId: pid,
              label: labelOf(eventType),
              at: Date.now(),
            },
            ...h,
          ].slice(0, UNDO_DEPTH)
        );
      } catch (e) {
        Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer l'action");
      }
    },
    [matchId, seconds, half, playersOnField]
  );

  // ── Annulation ────────────────────────────────────────────────────────────

  const undoEvent = useCallback(
    async (eventType: MatchEventType, statKey: string, playerId: string | null) => {
      if (!matchId) return;
      haptics.tapLight();

      if (playerId) {
        setPlayerStates((prev) => {
          const st = prev[playerId];
          if (!st) return prev;
          const next = { ...st, stats: { ...st.stats } };
          if (eventType === 'goal') {
            next.stats.goals = Math.max(0, (next.stats.goals ?? 0) - 1);
            next.stats.shotsOnTarget = Math.max(0, (next.stats.shotsOnTarget ?? 0) - 1);
          } else if (eventType === 'yellow_card') {
            next.yellowCards = Math.max(0, next.yellowCards - 1);
          } else if (eventType === 'red_card') {
            next.redCards = Math.max(0, next.redCards - 1);
          } else if (statKey) {
            next.stats[statKey] = Math.max(0, (next.stats[statKey] ?? 0) - 1);
          }
          return { ...prev, [playerId]: next };
        });
      }

      if (eventType === 'goal') {
        setScoreUs((n) => Math.max(0, n - 1));
        setPlusMinusByPlayer((prev) => {
          const next = { ...prev };
          playersOnField.forEach((p) => {
            next[p] = (next[p] ?? 0) - 1;
          });
          return next;
        });
      }
      if (eventType === 'opponent_goal') {
        setScoreOpponent((n) => Math.max(0, n - 1));
        setPlusMinusByPlayer((prev) => {
          const next = { ...prev };
          playersOnField.forEach((p) => {
            next[p] = (next[p] ?? 0) + 1;
          });
          return next;
        });
      }
      if (eventType === 'opponent_goal' || eventType === 'opponent_shot_on_target') {
        setOpponentShotsOnTarget((n) => Math.max(0, n - 1));
        setOpponentShotsTotal((n) => Math.max(0, n - 1));
      }
      if (eventType === 'opponent_shot') setOpponentShotsTotal((n) => Math.max(0, n - 1));

      try {
        await deleteLastMatchEventByType(matchId, eventType, playerId);
        // Le tir cadré créé avec le but doit partir avec lui, sinon il reste
        // orphelin en base et gonfle définitivement le rapport de match.
        const paired = PAIRED_EVENT[eventType];
        if (paired) {
          await deleteLastMatchEventByType(
            matchId,
            paired,
            eventType === 'goal' ? playerId : null
          );
        }
      } catch {
        // L'annulation locale reste appliquée : le coach a vu l'effet, forcer
        // un retour arrière visuel sur un échec réseau serait pire.
      }
    },
    [matchId, playersOnField]
  );

  /** Annule la dernière saisie, quelle qu'elle soit. */
  const undoLast = useCallback(async () => {
    const last = history[0];
    if (!last) return null;
    setHistory((h) => h.slice(1));
    await undoEvent(last.eventType, last.statKey, last.playerId);
    return last;
  }, [history, undoEvent]);

  // ── Substitution ──────────────────────────────────────────────────────────

  const substitute = useCallback(
    (outId: string, inId: string) => {
      haptics.tapMedium();
      const next = playersOnField.map((id) => (id === outId ? inId : id));
      setPlayersOnField(next);
      setPlayerStates((prev) => {
        const copy = { ...prev };
        [outId, inId].forEach((id) => {
          if (copy[id]) copy[id] = { ...copy[id], currentSequenceTime: 0 };
        });
        return copy;
      });
      if (matchId) {
        createMatchEvent({
          match_id: matchId,
          event_type: 'substitution',
          match_time_seconds: seconds,
          half,
          player_id: outId,
          players_on_field: next,
        }).catch(() => {});
      }
    },
    [matchId, seconds, half, playersOnField]
  );

  const resetSequences = useCallback(() => {
    haptics.tapLight();
    setPlayerStates((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = { ...next[id], currentSequenceTime: 0 };
      });
      return next;
    });
  }, []);

  const nextHalf = useCallback(() => {
    haptics.tapMedium();
    setIsRunning(false);
    setHalf(2);
    setSeconds(0);
    // Le règlement remet les fautes cumulées à zéro, mais le total du match
    // doit survivre à la sauvegarde.
    setPastFoulsUs((n) => n + foulsUs);
    setPastFoulsOpponent((n) => n + foulsOpponent);
    setFoulsUs(0);
    setFoulsOpponent(0);
    setTimeoutUs(false);
    setTimeoutOpponent(false);
    resetSequences();
  }, [foulsUs, foulsOpponent, resetSequences]);

  // ── Sauvegarde ────────────────────────────────────────────────────────────

  const saveMatch = useCallback(async (): Promise<boolean> => {
    if (!matchId) return false;
    setSaving(true);
    try {
      const playerStats: Record<
        string,
        { goals: number; yellow_cards: number; red_cards: number; time_played: number }
      > = {};
      Object.entries(playerStates).forEach(([id, st]) => {
        playerStats[id] = {
          goals: st.stats.goals ?? 0,
          yellow_cards: st.yellowCards,
          red_cards: st.redCards,
          time_played: st.totalTime,
        };
      });
      await updateMatch(matchId, {
        score_team: scoreUs,
        score_opponent: scoreOpponent,
        fouls_team: pastFoulsUs + foulsUs,
        fouls_opponent: pastFoulsOpponent + foulsOpponent,
        convoquedPlayerIds: convoquedIds,
        playerStats,
      });
      await clearRecorderState(matchId);
      return true;
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer le match");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    matchId,
    scoreUs,
    scoreOpponent,
    foulsUs,
    foulsOpponent,
    pastFoulsUs,
    pastFoulsOpponent,
    playerStates,
    convoquedIds,
  ]);

  const selectMatch = useCallback((id: string) => {
    setMatchId(id);
    setStep('record');
  }, []);

  return {
    // navigation
    step,
    matchId,
    selectMatch,
    onMatchFinished,
    // données
    matches,
    match,
    loading,
    saving,
    convoquedIds,
    convoquedPlayers,
    fieldPlayers,
    benchPlayers,
    playerStates,
    statRows,
    teamStats,
    plusMinusByPlayer,
    goalsByType,
    concededByType,
    outboxLength,
    // chrono
    half,
    seconds,
    isRunning,
    toggleClock,
    startClock,
    clockForgotten,
    clockNeverStarted: seconds === 0,
    nextHalf,
    resetSequences,
    // score et fautes
    scoreUs,
    scoreOpponent,
    setScoreUs,
    setScoreOpponent,
    foulsUs,
    foulsOpponent,
    setFoulsUs,
    setFoulsOpponent,
    opponentShotsTotal,
    opponentShotsOnTarget,
    timeoutUs,
    setTimeoutUs,
    timeoutOpponent,
    setTimeoutOpponent,
    // actions
    playersOnField,
    recordEvent,
    undoEvent,
    undoLast,
    lastAction: history[0] ?? null,
    substitute,
    saveMatch,
  };
}

export type MatchRecorder = ReturnType<typeof useMatchRecorder>;
