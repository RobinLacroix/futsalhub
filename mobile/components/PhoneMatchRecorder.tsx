/**
 * Match Recorder optimisé téléphone
 * Header persistant · 3 onglets : Temps | Stats | Bilan
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TouchableWithoutFeedback, ActivityIndicator, Alert, SafeAreaView, Modal,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { getMatchesByTeam, getMatchById, updateMatch } from '../lib/services/matches';
import { getEventsByMatchId, createMatchEvent, deleteLastMatchEventByType, type GoalType } from '../lib/services/matchEvents';
import { getPlayersByTeam } from '../lib/services/players';
import type { Match, MatchPlayer } from '../types';
import type { Player } from '../types';
import type { MatchEventType } from '../types';

// ─── Constantes ─────────────────────────────────────────────────────────────

const HALF_DURATION_SEC = 20 * 60;
const DEFAULT_SEQUENCE_LIMIT = 180;

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'offensive', label: 'Phase offensive' },
  { value: 'transition', label: 'Transition' },
  { value: 'cpa', label: 'CPA' },
  { value: 'superiority', label: 'Supériorité' },
];

const PLAYER_ACTIONS: {
  eventType: MatchEventType; statKey: string;
  label: string; icon: string; color: string;
}[] = [
  { eventType: 'goal',           statKey: 'goals',          label: 'But',       icon: '⚽', color: '#3b82f6' },
  { eventType: 'shot_on_target', statKey: 'shotsOnTarget',  label: 'Tir cadré', icon: '🎯', color: '#22c55e' },
  { eventType: 'shot',           statKey: 'shotsOffTarget', label: 'Tir',       icon: '○',  color: '#eab308' },
  { eventType: 'assist',         statKey: 'assists',        label: 'Passe déc.',icon: '🎯', color: '#a855f7' },
  { eventType: 'recovery',       statKey: 'ballRecovery',   label: 'Récup',     icon: '↑',  color: '#16a34a' },
  { eventType: 'ball_loss',      statKey: 'ballLoss',       label: 'Perte',     icon: '↓',  color: '#ef4444' },
  { eventType: 'yellow_card',    statKey: '',               label: 'Jaune',     icon: '⚠',  color: '#f59e0b' },
  { eventType: 'red_card',       statKey: '',               label: 'Rouge',     icon: '🔴', color: '#dc2626' },
];

// Colonnes du tableau Bilan joueurs
type StatCol = { key: string; label: string; color: string };
const STAT_COLS: StatCol[] = [
  { key: 'goals',         label: 'Buts',   color: '#3b82f6' },
  { key: 'shotsOnTarget', label: 'T.cad',  color: '#22c55e' },
  { key: 'totalShots',    label: 'T.tot',  color: '#64748b' },
  { key: 'ballRecovery',  label: 'Récup',  color: '#16a34a' },
  { key: 'ballLoss',      label: 'Pertes', color: '#ef4444' },
  { key: 'assists',       label: 'Pdec',   color: '#a855f7' },
  { key: 'totalTime',     label: 'Tps',    color: '#0f172a' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlayerState {
  id: string;
  totalTime: number;
  currentSequenceTime: number;
  sequenceTimeLimit: number;
  yellowCards: number;
  redCards: number;
  stats: Record<string, number>;
}

interface PhoneMatchRecorderProps {
  initialMatchId?: string | null;
  onMatchFinished?: () => void;
  onBack?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMatchPlayers(m: Match): MatchPlayer[] {
  if (!m.players) return [];
  const raw = m.players;
  if (Array.isArray(raw)) return raw;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function PhoneMatchRecorder({ initialMatchId, onMatchFinished, onBack }: PhoneMatchRecorderProps) {
  const { activeTeamId } = useActiveTeam();
  const router = useRouter();

  // ── Navigation / UI
  const [step, setStep]         = useState<'select' | 'record'>(initialMatchId ? 'record' : 'select');
  const [matchId, setMatchId]   = useState<string | null>(initialMatchId ?? null);
  const [activeTab, setActiveTab] = useState<'changements' | 'actions' | 'bilan'>('changements');

  // ── Data
  const [matches, setMatches]   = useState<Match[]>([]);
  const [match, setMatch]       = useState<Match | null>(null);
  const [players, setPlayers]   = useState<Player[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // ── Chrono
  const [half, setHalf]         = useState<1 | 2>(1);
  const [seconds, setSeconds]   = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Score & fautes
  const [scoreUs, setScoreUs]               = useState(0);
  const [scoreOpponent, setScoreOpponent]   = useState(0);
  const [foulsUs, setFoulsUs]               = useState(0);
  const [foulsOpponent, setFoulsOpponent]   = useState(0);
  const [opponentShotsTotal, setOpponentShotsTotal]       = useState(0);
  const [opponentShotsOnTarget, setOpponentShotsOnTarget] = useState(0);

  // ── Joueurs
  const [playersOnField, setPlayersOnField] = useState<string[]>([]);
  const [playerStates, setPlayerStates]     = useState<Record<string, PlayerState>>({});
  const [selectedForAction, setSelectedForAction] = useState<string | null>(null);

  // ── Modal changement (remplacement)
  const [subModalPlayer, setSubModalPlayer] = useState<Player | null>(null); // joueur sur terrain sélectionné

  // ── Modal type de but
  const [goalModal, setGoalModal] = useState<{
    eventType: 'goal' | 'opponent_goal'; playerId?: string | null; statKey?: string;
  } | null>(null);

  // ── Tri tableau Bilan
  const [sortCol, setSortCol]   = useState<string>('name');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');

  // ── Données dérivées ─────────────────────────────────────────────────

  const convoquedIds = useMemo(() => {
    if (!match) return [];
    return parseMatchPlayers(match).map((p) => p.id);
  }, [match]);

  const convoquedPlayers = useMemo(() => {
    const idSet = new Set(convoquedIds);
    return players.filter((p) => idSet.has(p.id));
  }, [players, convoquedIds]);

  const fieldPlayers = useMemo(() =>
    playersOnField.map((id) => convoquedPlayers.find((p) => p.id === id)).filter(Boolean) as Player[],
    [playersOnField, convoquedPlayers]
  );

  const benchPlayers = useMemo(() => {
    const onField = new Set(playersOnField);
    return convoquedPlayers.filter((p) => !onField.has(p.id));
  }, [convoquedPlayers, playersOnField]);

  const teamStats = useMemo(() => {
    let onTarget = 0, offTarget = 0, recoveries = 0, ballLoss = 0;
    Object.values(playerStates).forEach((st) => {
      onTarget   += st.stats.shotsOnTarget  ?? 0;
      offTarget  += st.stats.shotsOffTarget ?? 0;
      recoveries += st.stats.ballRecovery   ?? 0;
      ballLoss   += st.stats.ballLoss       ?? 0;
    });
    return { onTarget, offTarget, total: onTarget + offTarget, recoveries, ballLoss };
  }, [playerStates]);

  const statsTableRows = useMemo(() => {
    const rows = convoquedPlayers.map((p) => {
      const st = playerStates[p.id];
      const sOnTarget  = st?.stats.shotsOnTarget  ?? 0;
      const sOffTarget = st?.stats.shotsOffTarget ?? 0;
      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        firstName: p.first_name,
        lastName: p.last_name,
        number: p.number ?? 0,
        goals:          st?.stats.goals          ?? 0,
        shotsOnTarget:  sOnTarget,
        totalShots:     sOnTarget + sOffTarget,
        ballRecovery:   st?.stats.ballRecovery   ?? 0,
        ballLoss:       st?.stats.ballLoss       ?? 0,
        assists:        st?.stats.assists        ?? 0,
        totalTime:      st?.totalTime            ?? 0,
        yellowCards:    st?.yellowCards          ?? 0,
        redCards:       st?.redCards             ?? 0,
      };
    });
    return [...rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortCol === 'name') return dir * a.name.localeCompare(b.name);
      const va = (a as any)[sortCol] ?? 0;
      const vb = (b as any)[sortCol] ?? 0;
      return dir * (va - vb);
    });
  }, [convoquedPlayers, playerStates, sortCol, sortDir]);

  const handleSort = (col: string) => {
    setSortCol((prev) => {
      setSortDir(prev === col ? (d => d === 'asc' ? 'desc' : 'asc') : () => 'desc');
      return col;
    });
  };

  // ── Chargement ───────────────────────────────────────────────────────

  const loadMatches = useCallback(async () => {
    if (!activeTeamId) { setMatches([]); setLoading(false); return; }
    try { setMatches(await getMatchesByTeam(activeTeamId)); }
    catch { setMatches([]); }
    finally { setLoading(false); }
  }, [activeTeamId]);

  useEffect(() => { setLoading(true); loadMatches(); }, [loadMatches]);

  useEffect(() => {
    if (initialMatchId && matches.length > 0 && matches.some((m) => m.id === initialMatchId)) {
      setMatchId(initialMatchId); setStep('record');
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
          setMatch(m); setPlayers(pl);
          const ids = parseMatchPlayers(m).map((p) => p.id);
          setPlayersOnField(ids.slice(0, 5));
          setScoreUs(m.score_team ?? 0);
          setScoreOpponent(m.score_opponent ?? 0);
          const timeMap = new Map(parseMatchPlayers(m).map((mp) => [mp.id, mp.time_played ?? 0]));
          const states: Record<string, PlayerState> = {};
          pl.forEach((p) => {
            if (ids.includes(p.id)) {
              const limit = (p as Player & { sequence_time_limit?: number }).sequence_time_limit ?? DEFAULT_SEQUENCE_LIMIT;
              states[p.id] = {
                id: p.id, totalTime: timeMap.get(p.id) ?? 0, currentSequenceTime: 0,
                sequenceTimeLimit: limit, yellowCards: 0, redCards: 0,
                stats: { shotsOnTarget: 0, shotsOffTarget: 0, goals: 0, ballLoss: 0, ballRecovery: 0, assists: 0 },
              };
            }
          });
          setPlayerStates(states);
          const events = await getEventsByMatchId(matchId);
          if (events.length > 0) {
            const last = events[events.length - 1];
            setHalf(last.half as 1 | 2); setSeconds(last.match_time_seconds);
            setScoreUs((p) => Math.max(p, events.filter((e) => e.event_type === 'goal').length));
            setScoreOpponent((p) => Math.max(p, events.filter((e) => e.event_type === 'opponent_goal').length));
            setOpponentShotsTotal(events.filter((e) => e.event_type === 'opponent_shot' || e.event_type === 'opponent_shot_on_target').length);
            setOpponentShotsOnTarget(events.filter((e) => e.event_type === 'opponent_shot_on_target').length);
            const evToStat: Record<string, string> = {
              goal: 'goals', shot_on_target: 'shotsOnTarget', shot: 'shotsOffTarget',
              ball_loss: 'ballLoss', recovery: 'ballRecovery', assist: 'assists',
            };
            setPlayerStates((prev) => {
              const next = { ...prev };
              events.forEach((ev) => {
                if (ev.player_id && next[ev.player_id]) {
                  const st = next[ev.player_id];
                  if (ev.event_type === 'yellow_card') next[ev.player_id] = { ...st, yellowCards: st.yellowCards + 1 };
                  else if (ev.event_type === 'red_card') next[ev.player_id] = { ...st, redCards: st.redCards + 1 };
                  else if (evToStat[ev.event_type]) {
                    const k = evToStat[ev.event_type];
                    next[ev.player_id] = { ...st, stats: { ...st.stats, [k]: (st.stats[k] ?? 0) + 1 } };
                  }
                }
              });
              return next;
            });
          }
        }
      } catch { if (!cancelled) setMatch(null); }
    })();
    return () => { cancelled = true; };
  }, [step, matchId, activeTeamId]);

  // ── Chrono ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
      setPlayerStates((prev) => {
        const next = { ...prev };
        playersOnField.forEach((id) => {
          const st = next[id];
          if (st) next[id] = { ...st, totalTime: st.totalTime + 1, currentSequenceTime: st.currentSequenceTime + 1 };
        });
        return next;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, playersOnField]);

  // ── Actions ───────────────────────────────────────────────────────────

  const recordEvent = useCallback(async (
    eventType: MatchEventType, playerId?: string | null, statKey?: string, goalType?: GoalType | null,
  ) => {
    if (!matchId) return;
    try {
      const base = { match_id: matchId, match_time_seconds: seconds, half, players_on_field: playersOnField };
      await createMatchEvent({ ...base, event_type: eventType, player_id: playerId ?? null,
        goal_type: (eventType === 'goal' || eventType === 'opponent_goal') ? goalType ?? null : undefined });
      if (eventType === 'goal') {
        setScoreUs((n) => n + 1);
        await createMatchEvent({ ...base, event_type: 'shot_on_target', player_id: playerId ?? null });
      }
      if (eventType === 'opponent_goal') {
        setScoreOpponent((n) => n + 1);
        await createMatchEvent({ ...base, event_type: 'opponent_shot_on_target', player_id: null });
        setOpponentShotsOnTarget((n) => n + 1); setOpponentShotsTotal((n) => n + 1);
      }
      if (eventType === 'opponent_shot') setOpponentShotsTotal((n) => n + 1);
      if (eventType === 'opponent_shot_on_target') { setOpponentShotsOnTarget((n) => n + 1); setOpponentShotsTotal((n) => n + 1); }
      if (playerId && statKey) {
        setPlayerStates((prev) => {
          const st = prev[playerId]; if (!st) return prev;
          const ns = { ...st.stats, [statKey]: (st.stats[statKey] ?? 0) + 1 };
          if (eventType === 'goal') ns.shotsOnTarget = (st.stats.shotsOnTarget ?? 0) + 1;
          return { ...prev, [playerId]: { ...st, stats: ns } };
        });
      }
      if (playerId && (eventType === 'yellow_card' || eventType === 'red_card')) {
        setPlayerStates((prev) => {
          const st = prev[playerId]; if (!st) return prev;
          return { ...prev, [playerId]: { ...st,
            yellowCards: eventType === 'yellow_card' ? st.yellowCards + 1 : st.yellowCards,
            redCards:    eventType === 'red_card'    ? st.redCards + 1    : st.redCards,
          }};
        });
      }
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer");
    }
  }, [matchId, seconds, half, playersOnField]);

  const handleSubstitution = useCallback((outId: string, inId: string) => {
    setPlayersOnField((prev) => prev.map((id) => (id === outId ? inId : id)));
    setPlayerStates((prev) => {
      const next = { ...prev };
      [outId, inId].forEach((id) => { if (next[id]) next[id] = { ...next[id], currentSequenceTime: 0 }; });
      return next;
    });
    setSubModalPlayer(null);
  }, []);

  const resetSequences = useCallback(() => {
    setPlayerStates((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => { next[id] = { ...next[id], currentSequenceTime: 0 }; });
      return next;
    });
  }, []);

  const nextHalf = useCallback(() => {
    setIsRunning(false); setHalf(2); setSeconds(0); setFoulsUs(0); setFoulsOpponent(0);
    setPlayerStates((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => { next[id] = { ...next[id], currentSequenceTime: 0 }; });
      return next;
    });
  }, []);

  // ── Annulation du dernier événement d'un type pour un joueur ─────────────
  const handleUndoAction = useCallback(async (
    eventType: MatchEventType,
    statKey: string,
    playerId: string | null,
  ) => {
    if (!matchId) return;
    if (playerId) {
      setPlayerStates((prev) => {
        const st = prev[playerId];
        if (!st) return prev;
        const next = { ...st, stats: { ...st.stats } };
        if (eventType === 'goal') {
          next.stats.goals         = Math.max(0, (next.stats.goals         ?? 0) - 1);
          next.stats.shotsOnTarget = Math.max(0, (next.stats.shotsOnTarget ?? 0) - 1);
        } else if (eventType === 'yellow_card') {
          next.yellowCards = Math.max(0, next.yellowCards - 1);
        } else if (eventType === 'red_card') {
          next.redCards = Math.max(0, next.redCards - 1);
        } else if (statKey) {
          (next.stats as any)[statKey] = Math.max(0, ((next.stats as any)[statKey] ?? 0) - 1);
        }
        return { ...prev, [playerId]: next };
      });
    }
    if (eventType === 'goal') setScoreUs((n) => Math.max(0, n - 1));
    await deleteLastMatchEventByType(matchId, eventType, playerId);
  }, [matchId]);

  const saveAndExit = useCallback(async () => {
    if (!matchId) return;
    setSaving(true);
    try {
      const statsMap: Record<string, { goals: number; yellow_cards: number; red_cards: number; time_played: number }> = {};
      Object.entries(playerStates).forEach(([id, st]) => {
        statsMap[id] = { goals: st.stats.goals ?? 0, yellow_cards: st.yellowCards, red_cards: st.redCards, time_played: st.totalTime ?? 0 };
      });
      await updateMatch(matchId, { score_team: scoreUs, score_opponent: scoreOpponent,
        convoquedPlayerIds: convoquedIds, playerStats: statsMap });
      Alert.alert('Match enregistré', 'Score et événements enregistrés.', [
        { text: 'Voir le rapport', onPress: () => { onMatchFinished?.(); router.push(`/(tabs)/tracker/match-report/${matchId}`); } },
        { text: 'Terminer', onPress: () => onMatchFinished?.() },
      ]);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer le match");
    } finally { setSaving(false); }
  }, [matchId, scoreUs, scoreOpponent, playerStates, convoquedIds]);

  // ── Sélection match ───────────────────────────────────────────────────

  if (step === 'select') {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.selectContent}>
        <Text style={s.selectTitle}>Enregistrer un match</Text>
        <Text style={s.selectSub}>Choisissez le match à suivre</Text>
        {loading
          ? <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 24 }} />
          : matches.length === 0
          ? <Text style={s.empty}>Aucun match. Créez-en un dans le Calendrier.</Text>
          : matches.slice(0, 20).map((m) => (
            <TouchableOpacity key={m.id} style={s.matchCard}
              onPress={() => { setMatchId(m.id); setStep('record'); }}>
              <View style={{ flex: 1 }}>
                <Text style={s.matchTitle} numberOfLines={1}>{m.title || m.opponent_team || 'Match'}</Text>
                <Text style={s.matchMeta}>{m.competition} · {m.date ? new Date(m.date).toLocaleDateString('fr-FR') : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>
          ))
        }
        {onBack && (
          <TouchableOpacity style={s.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={18} color="#3b82f6" />
            <Text style={s.backBtnText}>Retour</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  if (!match) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={s.loadingText}>Chargement du match…</Text>
      </View>
    );
  }

  // ── Rendu principal ───────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>

      {/* ─── Header persistant ─── */}
      <View style={s.header}>
        <Text style={s.headerTitle} numberOfLines={1}>
          {match.title || match.opponent_team || 'Match'}
        </Text>

        {/* Chrono + Score */}
        <View style={s.chronoRow}>
          <View style={s.chronoLeft}>
            <Text style={s.chronoTime}>{fmt(seconds)}</Text>
            <Text style={s.chronoHalf}>MT{half}</Text>
          </View>
          <TouchableOpacity style={[s.playBtn, isRunning && s.playBtnActive]} onPress={() => setIsRunning((r) => !r)}>
            <Ionicons name={isRunning ? 'pause' : 'play'} size={22} color="#fff" />
          </TouchableOpacity>
          <View style={s.scoreBox}>
            <Text style={s.scoreText}>{scoreUs} – {scoreOpponent}</Text>
            <Text style={s.scoreLabel}>Score</Text>
          </View>
        </View>

        {/* Fautes */}
        <View style={s.foulsRow}>
          <TouchableOpacity style={s.foulBtn}
            onPress={() => setFoulsUs((n) => n + 1)}
            onLongPress={() => setFoulsUs((n) => Math.max(0, n - 1))}>
            <Text style={s.foulBtnText}>+1 Éq</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.foulBtn, s.foulBtnAdv]}
            onPress={() => setFoulsOpponent((n) => n + 1)}
            onLongPress={() => setFoulsOpponent((n) => Math.max(0, n - 1))}>
            <Text style={s.foulBtnText}>+1 Adv</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.foulBtnSmall} onPress={() => setFoulsUs(0)}>
            <Text style={s.foulBtnSmallText}>F. Éq</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.foulBtnSmall, s.foulBtnSmallAdv]} onPress={() => setFoulsOpponent(0)}>
            <Text style={s.foulBtnSmallText}>F. Adv</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.foulsText}>Fautes {foulsUs} – {foulsOpponent} · appui long = −1 · idem actions adverses</Text>

        {/* Actions adverses */}
        <View style={s.oppRow}>
          <TouchableOpacity
            style={s.oppBtn}
            onPress={() => setGoalModal({ eventType: 'opponent_goal' })}
            onLongPress={() => {
              if (!matchId || scoreOpponent <= 0) return;
              setScoreOpponent((n) => Math.max(0, n - 1));
              setOpponentShotsOnTarget((n) => Math.max(0, n - 1));
              setOpponentShotsTotal((n) => Math.max(0, n - 1));
              deleteLastMatchEventByType(matchId, 'opponent_goal', null);
            }}
          >
            <Text style={s.oppBtnText}>But adv.</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.oppBtn, s.oppBtnOrange]}
            onPress={() => recordEvent('opponent_shot_on_target')}
            onLongPress={() => {
              if (!matchId || opponentShotsOnTarget <= 0) return;
              setOpponentShotsOnTarget((n) => Math.max(0, n - 1));
              setOpponentShotsTotal((n) => Math.max(0, n - 1));
              deleteLastMatchEventByType(matchId, 'opponent_shot_on_target', null);
            }}
          >
            <Text style={s.oppBtnText}>Tir cad.</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.oppBtn, s.oppBtnYellow]}
            onPress={() => recordEvent('opponent_shot')}
            onLongPress={() => {
              if (!matchId || opponentShotsTotal <= (opponentShotsOnTarget)) return;
              setOpponentShotsTotal((n) => Math.max(0, n - 1));
              deleteLastMatchEventByType(matchId, 'opponent_shot', null);
            }}
          >
            <Text style={[s.oppBtnText, { color: '#1e293b' }]}>Tir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Onglets ─── */}
      <View style={s.tabBar}>
        {(['changements', 'actions', 'bilan'] as const).map((tab) => (
          <TouchableOpacity key={tab} style={[s.tab, activeTab === tab && s.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === 'changements' ? 'Temps' : tab === 'actions' ? 'Stats' : 'Bilan'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── Contenu ─── */}
      <ScrollView style={s.tabContent} contentContainerStyle={s.tabInner} keyboardShouldPersistTaps="handled">

        {/* ──── TEMPS ──── */}
        {activeTab === 'changements' && (
          <View>
            {/* Info chrono */}
            <View style={s.chronoCards}>
              <View style={s.chronoCard}>
                <Text style={s.chronoCardLabel}>TEMPS MI-TEMPS</Text>
                <Text style={s.chronoCardValue}>{fmt(seconds)}</Text>
                <Text style={s.chronoCardSub}>Chrono match</Text>
              </View>
              <View style={[s.chronoCard, { borderColor: '#d1fae5' }]}>
                <Text style={[s.chronoCardLabel, { color: '#059669' }]}>SÉQUENCE</Text>
                <Text style={[s.chronoCardValue, { color: '#059669' }]}>
                  {fieldPlayers.length > 0
                    ? fmt(Math.min(...fieldPlayers.map((p) => playerStates[p.id]?.currentSequenceTime ?? 0)))
                    : '00:00'}
                </Text>
                <Text style={s.chronoCardSub}>Même groupe sur le terrain</Text>
              </View>
            </View>

            <Text style={s.sectionLabel}>{fieldPlayers.length} sur le terrain · touchez pour remplacer</Text>

            {/* Cartes joueurs terrain */}
            <View style={s.fieldCardsRow}>
              {fieldPlayers.map((p) => {
                const st = playerStates[p.id];
                const seqPct = st ? Math.min(1, st.currentSequenceTime / (st.sequenceTimeLimit || 1)) : 0;
                const over = st ? st.currentSequenceTime >= st.sequenceTimeLimit : false;
                const isGK = (p.position ?? '').toLowerCase().startsWith('gardien');
                return (
                  <TouchableOpacity key={p.id}
                    style={[s.playerCard, isGK && s.playerCardGK, over && s.playerCardOverLimit]}
                    onPress={() => setSubModalPlayer(p)}>
                    <Text style={s.playerCardFirst} numberOfLines={1}>{p.first_name}</Text>
                    <Text style={s.playerCardLast} numberOfLines={1}>{p.last_name}</Text>
                    <View style={s.playerCardTimes}>
                      <Text style={s.playerCardTimeRow}>
                        <Text style={s.tcLabel}>Cum. </Text>
                        <Text style={s.tcValue}>{fmt(st?.totalTime ?? 0)}</Text>
                      </Text>
                      <Text style={[s.playerCardTimeRow, { color: over ? '#ef4444' : '#f59e0b' }]}>
                        <Text style={s.tcLabel}>Séq. </Text>
                        <Text style={s.tcValue}>{fmt(st?.currentSequenceTime ?? 0)}</Text>
                      </Text>
                    </View>
                    <View style={s.seqBar}>
                      <View style={[s.seqBarFill, {
                        width: `${Math.round(seqPct * 100)}%` as any,
                        backgroundColor: over ? '#ef4444' : seqPct > 0.7 ? '#f59e0b' : '#22c55e',
                      }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Contrôles */}
            <View style={s.controlBtns}>
              {half === 1 && (
                <TouchableOpacity style={s.halfBtn} onPress={nextHalf}>
                  <Text style={s.halfBtnText}>Passer en 2e mi-temps</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.resetSeqBtn} onPress={resetSequences}>
                <Ionicons name="refresh" size={14} color="#475569" />
                <Text style={s.resetSeqBtnText}>Réinitialiser séquences</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ──── STATS (Actions) ──── */}
        {activeTab === 'actions' && (
          <View>
            <Text style={s.sectionLabel}>Joueur concerné</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.playerChipsRow}>
              {fieldPlayers.map((p) => {
                const isGK = (p.position ?? '').toLowerCase().startsWith('gardien');
                const isSelected = selectedForAction === p.id;
                return (
                  <TouchableOpacity key={p.id}
                    style={[s.playerChip, isGK && s.playerChipGK, isSelected && s.playerChipActive]}
                    onPress={() => setSelectedForAction((id) => id === p.id ? null : p.id)}>
                    <Text style={[s.playerChipText, isSelected && s.playerChipTextActive]}
                      numberOfLines={2}>{p.first_name}{'\n'}{p.last_name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={s.actionHint}>
              {selectedForAction
                ? fieldPlayers.find((p) => p.id === selectedForAction)?.first_name + ' sélectionné'
                : 'Sélectionnez un joueur, puis une action'}
            </Text>

            {/* Grille 4 colonnes */}
            <View style={s.actionsGrid}>
              {PLAYER_ACTIONS.map((a) => (
                <TouchableOpacity key={a.eventType} style={[s.actionBtn, { backgroundColor: a.color }]}
                  onPress={() => {
                    if ((a.eventType === 'goal' || a.eventType === 'yellow_card' || a.eventType === 'red_card') && !selectedForAction) {
                      Alert.alert('Joueur requis', 'Sélectionnez un joueur avant cette action.'); return;
                    }
                    if (a.eventType === 'goal') {
                      setGoalModal({ eventType: 'goal', playerId: selectedForAction, statKey: a.statKey });
                    } else {
                      recordEvent(a.eventType, selectedForAction, a.statKey);
                    }
                  }}
                  onLongPress={() => {
                    if ((a.eventType === 'goal' || a.eventType === 'yellow_card' || a.eventType === 'red_card') && !selectedForAction) {
                      Alert.alert('Joueur requis', 'Sélectionnez un joueur avant cette action.'); return;
                    }
                    handleUndoAction(a.eventType, a.statKey, selectedForAction);
                  }}
                  delayLongPress={400}
                >
                  <Text style={s.actionBtnIcon}>{a.icon}</Text>
                  <Text style={s.actionBtnLabel}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ──── BILAN ──── */}
        {activeTab === 'bilan' && (
          <View>
            {/* Stats équipe */}
            <Text style={s.bilanSection}>NOTRE ÉQUIPE</Text>
            <View style={s.bilanGrid}>
              <BilanCard value={teamStats.total}     label="Tirs totaux"    />
              <BilanCard value={teamStats.onTarget}  label="Tirs cadrés"   color="#16a34a" bg="#f0fdf4" border="#bbf7d0" />
              <BilanCard value={teamStats.recoveries}label="Récupérations" color="#7c3aed" bg="#faf5ff" border="#e9d5ff" />
              <BilanCard value={teamStats.ballLoss}  label="Pertes"        color="#dc2626" bg="#fff1f2" border="#fecdd3" />
            </View>

            <Text style={s.bilanSection}>ADVERSAIRE</Text>
            <View style={s.bilanGrid}>
              <BilanCard value={opponentShotsTotal}    label="Tirs concédés"        />
              <BilanCard value={opponentShotsOnTarget} label="Tirs cadrés concédés" color="#b45309" bg="#fefce8" border="#fde68a" />
            </View>

            {/* Tableau joueurs */}
            <Text style={s.bilanSection}>JOUEURS CONVOQUÉS</Text>

            {/* Header tableau */}
            <View style={s.tableHeader}>
              <TouchableOpacity style={[s.tableColName]} onPress={() => handleSort('name')}>
                <Text style={s.tableHeaderText}>Joueur {sortCol === 'name' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</Text>
              </TouchableOpacity>
              {STAT_COLS.map((col) => (
                <TouchableOpacity key={col.key} style={s.tableCol} onPress={() => handleSort(col.key)}>
                  <Text style={[s.tableHeaderText, { color: col.color }]}>
                    {col.label}{sortCol === col.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Lignes */}
            {statsTableRows.map((row, i) => (
              <View key={row.id} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
                <View style={s.tableColName}>
                  <Text style={s.tableCellName} numberOfLines={1}>{row.firstName[0]}. {row.lastName}</Text>
                  {(row.yellowCards > 0 || row.redCards > 0) && (
                    <View style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
                      {row.yellowCards > 0 && <Text style={{ fontSize: 8 }}>🟨×{row.yellowCards}</Text>}
                      {row.redCards > 0    && <Text style={{ fontSize: 8 }}>🟥×{row.redCards}</Text>}
                    </View>
                  )}
                </View>
                <Text style={[s.tableCol, s.tableCellStat, { color: '#3b82f6' }]}>{row.goals}</Text>
                <Text style={[s.tableCol, s.tableCellStat, { color: '#22c55e' }]}>{row.shotsOnTarget}</Text>
                <Text style={[s.tableCol, s.tableCellStat]}>{row.totalShots}</Text>
                <Text style={[s.tableCol, s.tableCellStat, { color: '#16a34a' }]}>{row.ballRecovery}</Text>
                <Text style={[s.tableCol, s.tableCellStat, { color: '#ef4444' }]}>{row.ballLoss}</Text>
                <Text style={[s.tableCol, s.tableCellStat, { color: '#a855f7' }]}>{row.assists}</Text>
                <Text style={[s.tableCol, s.tableCellStat, { fontSize: 9 }]}>{fmt(row.totalTime)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ─── Footer ─── */}
      <View style={s.footer}>
        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={saveAndExit} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={s.saveBtnText}>Enregistrer</Text></>
          }
        </TouchableOpacity>
        <TouchableOpacity style={s.quitBtn} onPress={() => Alert.alert('Quitter', 'Quitter sans enregistrer le score ?', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Quitter', style: 'destructive', onPress: () => onMatchFinished?.() },
        ])}>
          <Text style={s.quitBtnText}>Quitter sans enregistrer le score</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Modal remplacement ─── */}
      <Modal visible={!!subModalPlayer} transparent animationType="slide" onRequestClose={() => setSubModalPlayer(null)}>
        <TouchableWithoutFeedback onPress={() => setSubModalPlayer(null)}>
          <View style={s.subOverlay}>
            <TouchableWithoutFeedback>
              <View style={s.subSheet}>
                <View style={s.subSheetHandle} />
                <Text style={s.subSheetTitle}>
                  Remplacer <Text style={{ color: '#2563eb' }}>
                    {subModalPlayer?.first_name} {subModalPlayer?.last_name}
                  </Text>
                </Text>
                <Text style={s.subSheetSub}>Choisissez le remplaçant</Text>

                {benchPlayers.length === 0
                  ? <Text style={s.subEmpty}>Aucun remplaçant disponible</Text>
                  : benchPlayers.map((p) => {
                    const st = playerStates[p.id];
                    return (
                      <TouchableOpacity key={p.id} style={s.subPlayerRow}
                        onPress={() => subModalPlayer && handleSubstitution(subModalPlayer.id, p.id)}>
                        <View style={s.subPlayerLeft}>
                          <Text style={s.subPlayerName}>{p.first_name} {p.last_name}</Text>
                          <Text style={s.subPlayerTime}>Temps : {fmt(st?.totalTime ?? 0)}</Text>
                        </View>
                        <Ionicons name="swap-horizontal" size={20} color="#2563eb" />
                      </TouchableOpacity>
                    );
                  })
                }
                <TouchableOpacity style={s.subCancel} onPress={() => setSubModalPlayer(null)}>
                  <Text style={s.subCancelText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─── Modal type de but ─── */}
      {goalModal && (
        <TouchableWithoutFeedback onPress={() => setGoalModal(null)}>
          <View style={s.subOverlay}>
            <TouchableWithoutFeedback>
              <View style={s.subSheet}>
                <View style={s.subSheetHandle} />
                <Text style={s.subSheetTitle}>
                  {goalModal.eventType === 'goal' ? 'Type de but marqué' : 'Type de but encaissé'}
                </Text>
                {GOAL_TYPES.map((g) => (
                  <TouchableOpacity key={g.value} style={s.subPlayerRow}
                    onPress={() => { setGoalModal(null); recordEvent(goalModal.eventType, goalModal.playerId ?? null, goalModal.statKey, g.value); }}>
                    <Text style={s.subPlayerName}>{g.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={s.subCancel} onPress={() => setGoalModal(null)}>
                  <Text style={s.subCancelText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      )}
    </SafeAreaView>
  );
}

// ─── Sous-composant ───────────────────────────────────────────────────────────

function BilanCard({ value, label, color = '#1e293b', bg = '#f8fafc', border = '#e2e8f0' }: {
  value: number; label: string; color?: string; bg?: string; border?: string;
}) {
  return (
    <View style={[s.bilanCard, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[s.bilanValue, { color }]}>{value}</Text>
      <Text style={s.bilanCardLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#f1f5f9' },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:  { marginTop: 12, fontSize: 14, color: '#64748b' },

  // Sélection
  container:    { flex: 1, backgroundColor: '#f8fafc' },
  selectContent:{ padding: 20, paddingBottom: 40 },
  selectTitle:  { fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  selectSub:    { fontSize: 14, color: '#64748b', marginBottom: 20 },
  matchCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8 },
  matchTitle:   { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  matchMeta:    { fontSize: 12, color: '#64748b', marginTop: 2 },
  empty:        { fontSize: 14, color: '#64748b', marginTop: 20 },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, paddingVertical: 10 },
  backBtnText:  { fontSize: 15, color: '#3b82f6', fontWeight: '500' },

  // Header
  header:       { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8, gap: 7 },
  headerTitle:  { fontSize: 13, fontWeight: '700', color: '#fff', textAlign: 'center' },

  chronoRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chronoLeft:   { flex: 1 },
  chronoTime:   { fontSize: 32, fontWeight: '800', color: '#fff', lineHeight: 36 },
  chronoHalf:   { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  playBtn:      { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  playBtnActive:{ backgroundColor: 'rgba(255,255,255,0.35)' },
  scoreBox:     { flex: 1, alignItems: 'flex-end' },
  scoreText:    { fontSize: 22, fontWeight: '800', color: '#fff' },
  scoreLabel:   { fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  foulsRow:     { flexDirection: 'row', gap: 5 },
  foulBtn:      { flex: 1, backgroundColor: '#1d4ed8', paddingVertical: 7, borderRadius: 7, alignItems: 'center' },
  foulBtnAdv:   { backgroundColor: '#dc2626' },
  foulBtnText:  { color: '#fff', fontWeight: '700', fontSize: 12 },
  foulBtnSmall: { flex: 1, backgroundColor: '#1e40af', paddingVertical: 7, borderRadius: 7, alignItems: 'center' },
  foulBtnSmallAdv: { backgroundColor: '#b91c1c' },
  foulBtnSmallText: { color: '#fff', fontWeight: '600', fontSize: 11 },
  foulsText:    { fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },

  oppRow:       { flexDirection: 'row', gap: 5 },
  oppBtn:       { flex: 1, backgroundColor: '#dc2626', paddingVertical: 8, borderRadius: 7, alignItems: 'center' },
  oppBtnOrange: { backgroundColor: '#ea580c' },
  oppBtnYellow: { backgroundColor: '#eab308' },
  oppBtnText:   { color: '#fff', fontWeight: '700', fontSize: 12 },

  // Onglets
  tabBar:       { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 10, margin: 8, padding: 3 },
  tab:          { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 7 },
  tabActive:    { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  tabText:      { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tabTextActive:{ color: '#1e293b', fontWeight: '700' },
  tabContent:   { flex: 1 },
  tabInner:     { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 20 },

  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 8 },

  // Temps — chrono cards
  chronoCards:  { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chronoCard:   { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  chronoCardLabel: { fontSize: 8, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  chronoCardValue: { fontSize: 22, fontWeight: '800', color: '#1e293b' },
  chronoCardSub:   { fontSize: 9, color: '#94a3b8', marginTop: 2, textAlign: 'center' },

  // Cartes terrain
  fieldCardsRow:{ flexDirection: 'row', gap: 3 },
  playerCard:   { flex: 1, minWidth: 0, backgroundColor: '#1e293b', borderRadius: 8, padding: 5, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  playerCardOverLimit: { borderColor: '#ef4444' },
  playerCardGK:        { borderColor: '#f59e0b' },
  playerCardFirst: { fontSize: 9, fontWeight: '600', color: '#cbd5e1', textAlign: 'center', width: '100%' },
  playerCardLast:  { fontSize: 10, fontWeight: '800', color: '#fff', textAlign: 'center', width: '100%' },
  playerCardTimes: { marginTop: 5, gap: 1, alignSelf: 'stretch' },
  playerCardTimeRow: { fontSize: 9, color: '#94a3b8' },
  tcLabel:      { fontSize: 9, color: '#94a3b8' },
  tcValue:      { fontSize: 9, fontWeight: '700', color: '#fff' },
  seqBar:       { height: 3, backgroundColor: '#334155', borderRadius: 99, marginTop: 5, alignSelf: 'stretch' },
  seqBarFill:   { height: 3, borderRadius: 99 },

  // Contrôles
  controlBtns:  { marginTop: 14, gap: 7 },
  halfBtn:      { backgroundColor: '#3b82f6', paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  halfBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  resetSeqBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  resetSeqBtnText: { color: '#475569', fontWeight: '600', fontSize: 13 },

  // Stats — chips joueurs
  playerChipsRow: { gap: 6, paddingBottom: 4 },
  playerChip:     { backgroundColor: '#e2e8f0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, minWidth: 64, alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  playerChipGK:   { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  playerChipActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  playerChipText:   { fontSize: 10, fontWeight: '600', color: '#475569', textAlign: 'center', lineHeight: 13 },
  playerChipTextActive: { color: '#2563eb' },
  actionHint:   { fontSize: 10, color: '#94a3b8', textAlign: 'center', marginBottom: 8, fontStyle: 'italic' },

  // Grille 4 colonnes
  actionsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionBtn:    { width: '23%', aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionBtnIcon:{ fontSize: 18 },
  actionBtnLabel: { fontSize: 11, fontWeight: '700', color: '#fff', textAlign: 'center' },

  // Bilan
  bilanSection: { fontSize: 11, fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 6 },
  bilanGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  bilanCard:    { flex: 1, minWidth: '44%', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1 },
  bilanValue:   { fontSize: 26, fontWeight: '800', color: '#1e293b' },
  bilanCardLabel: { fontSize: 11, color: '#64748b', marginTop: 2, textAlign: 'center' },

  // Tableau joueurs
  tableHeader:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4, marginBottom: 2 },
  tableRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 4, borderRadius: 6 },
  tableRowAlt:  { backgroundColor: '#f8fafc' },
  tableColName: { flex: 2.5, paddingRight: 4 },
  tableCol:     { flex: 1, alignItems: 'center', textAlign: 'center' },
  tableHeaderText: { fontSize: 9, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center' },
  tableCellName:{ fontSize: 11, fontWeight: '600', color: '#1e293b' },
  tableCellStat:{ fontSize: 12, fontWeight: '700', textAlign: 'center' },

  // Footer
  footer:       { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 6 },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', paddingVertical: 13, borderRadius: 12 },
  saveBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  quitBtn:      { alignItems: 'center', paddingVertical: 3 },
  quitBtnText:  { fontSize: 12, color: '#2563eb', fontWeight: '500' },

  // Modal remplacement / but (bottom sheet)
  subOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  subSheet:     { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  subSheetHandle: { width: 36, height: 4, backgroundColor: '#e2e8f0', borderRadius: 99, alignSelf: 'center', marginBottom: 16 },
  subSheetTitle:{ fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  subSheetSub:  { fontSize: 12, color: '#94a3b8', marginBottom: 14 },
  subEmpty:     { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 20 },
  subPlayerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  subPlayerLeft:{ flex: 1 },
  subPlayerName:{ fontSize: 14, fontWeight: '600', color: '#1e293b' },
  subPlayerTime:{ fontSize: 11, color: '#94a3b8', marginTop: 1 },
  subCancel:    { marginTop: 14, paddingVertical: 12, alignItems: 'center' },
  subCancelText:{ fontSize: 14, color: '#94a3b8', fontWeight: '500' },
});
