import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useIsTablet } from '../../../hooks/useIsTablet';
import TabletMatchRecorder from '../../../components/TabletMatchRecorder';
import { getMatchesByTeam, getMatchById, updateMatch } from '../../../lib/services/matches';
import { getEventsByMatchId, createMatchEvent, type GoalType } from '../../../lib/services/matchEvents';
import { getPlayersByTeam } from '../../../lib/services/players';
import type { Match, MatchPlayer } from '../../../types';
import type { Player } from '../../../types';
import type { MatchEventType } from '../../../types';

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'offensive', label: 'Phase offensive' },
  { value: 'transition', label: 'Transition' },
  { value: 'cpa', label: 'CPA' },
  { value: 'superiority', label: 'Supériorité' },
];

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

const HALF_DURATION_SEC = 20 * 60; // 20 min

export default function MatchRecorderScreen() {
  const router = useRouter();
  const isTablet = useIsTablet();
  const { matchId: paramMatchId } = useLocalSearchParams<{ matchId?: string }>();
  const { activeTeamId } = useActiveTeam();

  // Sur tablette : utiliser l'interface dédiée (style webapp)
  if (isTablet) {
    return (
      <TabletMatchRecorder
        initialMatchId={paramMatchId ?? null}
        onMatchFinished={() => router.replace('/(tabs)/tracker')}
        onBack={() => router.back()}
      />
    );
  }
  const [step, setStep] = useState<'select' | 'record'>('select');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(paramMatchId ?? null);
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const convoquedPlayerIds = useMemo(() => {
    if (!match) return [];
    return parseMatchPlayers(match).map((p) => p.id);
  }, [match]);

  const convoquedPlayers = useMemo(() => {
    const idSet = new Set(convoquedPlayerIds);
    return players.filter((p) => idSet.has(p.id));
  }, [players, convoquedPlayerIds]);

  const playerName = (playerId: string) => {
    const p = players.find((x) => x.id === playerId);
    return p ? `${p.first_name} ${p.last_name}` : playerId.slice(0, 8);
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
    if (paramMatchId && matches.length > 0) {
      const found = matches.some((m) => m.id === paramMatchId);
      if (found) {
        setSelectedMatchId(paramMatchId);
        setStep('record');
      }
    }
  }, [paramMatchId, matches]);

  useEffect(() => {
    if (step !== 'record' || !selectedMatchId) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, pl] = await Promise.all([
          getMatchById(selectedMatchId),
          activeTeamId ? getPlayersByTeam(activeTeamId) : Promise.resolve([]),
        ]);
        if (!cancelled && m) {
          setMatch(m);
          setPlayers(pl);
          setScoreUs(m.score_team ?? 0);
          setScoreOpponent(m.score_opponent ?? 0);
          const events = await getEventsByMatchId(selectedMatchId);
          if (events.length > 0) {
            const last = events[events.length - 1];
            setHalf(last.half);
            setSeconds(last.match_time_seconds);
            const goalsUs = events.filter((e) => e.event_type === 'goal').length;
            const goalsOpp = events.filter((e) => e.event_type === 'opponent_goal').length;
            setScoreUs((prev) => Math.max(prev, goalsUs));
            setScoreOpponent((prev) => Math.max(prev, goalsOpp));
          }
        }
      } catch {
        if (!cancelled) setMatch(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, selectedMatchId, activeTeamId]);

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
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const recordEvent = useCallback(
    async (eventType: MatchEventType, playerId?: string | null, goalType?: GoalType | null) => {
      if (!selectedMatchId) return;
      const playersOnField = convoquedPlayerIds;
      const basePayload = {
        match_id: selectedMatchId,
        match_time_seconds: seconds,
        half,
        players_on_field: playersOnField,
      };
      try {
        await createMatchEvent({
          ...basePayload,
          event_type: eventType,
          player_id: playerId ?? null,
          goal_type: (eventType === 'goal' || eventType === 'opponent_goal') ? goalType ?? null : undefined,
        });
        if (eventType === 'goal') {
          setScoreUs((n) => n + 1);
          await createMatchEvent({
            ...basePayload,
            event_type: 'shot_on_target',
            player_id: playerId ?? null,
          });
        }
        if (eventType === 'opponent_goal') {
          setScoreOpponent((n) => n + 1);
          await createMatchEvent({
            ...basePayload,
            event_type: 'opponent_shot_on_target',
            player_id: null,
          });
        }
      } catch (e) {
        console.error('[Tracker] createMatchEvent failed:', e);
        Alert.alert('Erreur enregistrement', e instanceof Error ? e.message : "Impossible d'enregistrer l'événement");
      }
    },
    [selectedMatchId, seconds, half, convoquedPlayerIds]
  );

  const showGoalTypePicker = useCallback(
    (eventType: 'goal' | 'opponent_goal', playerId?: string | null) => {
      Alert.alert(
        eventType === 'goal' ? 'Type de but marqué' : 'Type de but encaissé',
        'Choisissez le type de but',
        [
          ...GOAL_TYPES.map((g) => ({
            text: g.label,
            onPress: () => recordEvent(eventType, playerId ?? null, g.value),
          })),
          { text: 'Annuler', style: 'cancel' as const },
        ]
      );
    },
    [recordEvent]
  );

  const saveAndExit = useCallback(async () => {
    if (!selectedMatchId) return;
    setSaving(true);
    try {
      await updateMatch(selectedMatchId, {
        score_team: scoreUs,
        score_opponent: scoreOpponent,
      });
      Alert.alert('Match enregistré', 'Score et événements enregistrés.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/tracker') },
      ]);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'enregistrer le match');
    } finally {
      setSaving(false);
    }
  }, [selectedMatchId, scoreUs, scoreOpponent, router]);

  const playerActions: { type: MatchEventType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { type: 'goal', label: 'But', icon: 'football' },
    { type: 'shot_on_target', label: 'Tir cadré', icon: 'locate' },
    { type: 'shot', label: 'Tir', icon: 'ellipse-outline' },
    { type: 'ball_loss', label: 'Perte balle', icon: 'arrow-down-circle-outline' },
    { type: 'recovery', label: 'Récupération', icon: 'arrow-up-circle-outline' },
    { type: 'dribble', label: 'Dribble', icon: 'flash-outline' },
    { type: 'yellow_card', label: 'Carton jaune', icon: 'warning-outline' },
    { type: 'red_card', label: 'Carton rouge', icon: 'warning' },
  ];

  const opponentActions: { type: MatchEventType; label: string }[] = [
    { type: 'opponent_goal', label: 'But adverse' },
    { type: 'opponent_shot_on_target', label: 'Tir cadré adverse' },
    { type: 'opponent_shot', label: 'Tir adverse' },
  ];

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (step === 'select') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Enregistrer un match</Text>
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
                  setSelectedMatchId(m.id);
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
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.recordContent}>
      <View style={styles.recordHeader}>
        <Text style={styles.recordTitle} numberOfLines={1}>
          {match.title || match.opponent_team || 'Match'}
        </Text>
        <Text style={styles.recordMeta}>{match.competition}</Text>
      </View>

      <View style={styles.chronoRow}>
        <View style={styles.chronoBox}>
          <Text style={styles.chronoTime}>{formatTime(seconds)}</Text>
          <Text style={styles.chronoHalf}>Mi-temps {half}</Text>
          <View style={styles.chronoButtons}>
            <TouchableOpacity
              style={[styles.chronoBtn, isRunning && styles.chronoBtnActive]}
              onPress={() => setIsRunning((r) => !r)}
            >
              <Ionicons name={isRunning ? 'pause' : 'play'} size={28} color="#fff" />
            </TouchableOpacity>
            {half === 1 && (
              <TouchableOpacity
                style={styles.chronoBtnHalf}
                onPress={() => {
                  setIsRunning(false);
                  setHalf(2);
                  setSeconds(0);
                }}
              >
                <Text style={styles.chronoBtnHalfText}>2e mi-temps</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Nous</Text>
          <Text style={styles.scoreValue}>{scoreUs}</Text>
          <Text style={styles.scoreDash}>–</Text>
          <Text style={styles.scoreValue}>{scoreOpponent}</Text>
          <Text style={styles.scoreLabel}>Adversaire</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Joueur concerné</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playersRow}>
        {convoquedPlayers.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.playerChip, selectedPlayerId === p.id && styles.playerChipSelected]}
              onPress={() => setSelectedPlayerId((id) => (id === p.id ? null : p.id))}
            >
              <Text
                style={[
                  styles.playerChipText,
                  selectedPlayerId === p.id && styles.playerChipTextSelected,
                ]}
                numberOfLines={1}
              >
                {p.first_name} {p.last_name}
              </Text>
            </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>Actions joueur</Text>
      <View style={styles.actionsGrid}>
        {playerActions.map((a) => (
          <TouchableOpacity
            key={a.type}
            style={styles.actionBtn}
            onPress={() => {
              if (a.type === 'goal' || a.type === 'yellow_card' || a.type === 'red_card') {
                if (!selectedPlayerId) {
                  Alert.alert('Choisir un joueur', 'Sélectionnez un joueur avant d\'enregistrer cette action.');
                  return;
                }
              }
              if (a.type === 'goal') {
                showGoalTypePicker('goal', selectedPlayerId);
              } else {
                recordEvent(a.type, selectedPlayerId ?? undefined);
              }
            }}
          >
            <Ionicons name={a.icon} size={22} color="#1e293b" />
            <Text style={styles.actionBtnText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Actions adverses</Text>
      <View style={styles.actionsRow}>
        {opponentActions.map((a) => (
          <TouchableOpacity
            key={a.type}
            style={styles.opponentBtn}
            onPress={() =>
              a.type === 'opponent_goal' ? showGoalTypePicker('opponent_goal') : recordEvent(a.type)
            }
          >
            <Text style={styles.opponentBtnText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={saveAndExit}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.saveBtnText}>Enregistrer et terminer</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color="#3b82f6" />
        <Text style={styles.backBtnText}>Retour sans enregistrer</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 20 },
  empty: { fontSize: 15, color: '#64748b', marginTop: 24 },
  matchList: { gap: 8, marginBottom: 24 },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  matchTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1e293b' },
  matchMeta: { fontSize: 13, color: '#64748b', marginRight: 8 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 16,
  },
  backBtnText: { fontSize: 16, color: '#3b82f6', fontWeight: '500' },

  recordContent: { padding: 16, paddingBottom: 48 },
  recordHeader: { marginBottom: 20 },
  recordTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  recordMeta: { fontSize: 14, color: '#64748b', marginTop: 4 },
  chronoRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  chronoBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    minWidth: 140,
    alignItems: 'center',
  },
  chronoTime: { fontSize: 28, fontWeight: '700', color: '#fff' },
  chronoHalf: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  chronoButtons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  chronoBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chronoBtnActive: { backgroundColor: '#16a34a' },
  chronoBtnHalf: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  chronoBtnHalfText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scoreBox: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  scoreLabel: { fontSize: 12, color: '#64748b' },
  scoreValue: { fontSize: 24, fontWeight: '700', color: '#1e293b' },
  scoreDash: { fontSize: 18, color: '#94a3b8' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8 },
  playersRow: { marginBottom: 16, marginHorizontal: -4 },
  playerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    marginRight: 8,
  },
  playerChipSelected: { backgroundColor: '#3b82f6' },
  playerChipText: { fontSize: 14, color: '#334155', maxWidth: 100 },
  playerChipTextSelected: { color: '#fff' },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
  },
  actionBtnText: { fontSize: 13, color: '#334155', fontWeight: '500' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  opponentBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  opponentBtnText: { fontSize: 13, color: '#b91c1c', fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
