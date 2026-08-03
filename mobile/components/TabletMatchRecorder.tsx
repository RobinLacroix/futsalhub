/**
 * Match recorder — tablette (P1-3)
 *
 * 1 984 lignes et 163 couleurs en dur ramenées à un assemblage du noyau
 * `components/recorder/`, partagé avec le téléphone.
 *
 * ## Ce que la tablette garde, et pourquoi
 *
 * **La saisie directe sur la carte du joueur.** Pas de sélection préalable, pas
 * de mode : le coach touche la bonne case du bon joueur. C'est le bon geste sur
 * cette surface, il est conservé tel quel.
 *
 * **Le changement par glisser-déposer** (appui long puis glissé vers un
 * remplaçant) et par double touche. Les deux existaient, les deux restent.
 *
 * ## Ce que la tablette gagne
 *
 * - **La persistance d'état.** Elle n'en avait aucune : un plantage en plein
 *   match perdait tout, sur l'appareil de bord de terrain. Elle vient du noyau.
 * - **L'événement de changement en base.** `handleSubstitution` ne l'écrivait
 *   pas côté tablette alors que le téléphone le faisait : l'historique des
 *   changements d'un match enregistré sur iPad était vide dans le rapport.
 * - **Une annulation globale.** Il fallait retrouver le bouton exact de
 *   l'action et faire un appui long dessus. Or l'erreur en direct est toujours
 *   la dernière saisie, et le coach ne sait déjà plus laquelle c'était.
 * - **Le chrono qui ne dérive plus** et survit à la mise en veille.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Alert, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useNavigation } from 'expo-router';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import {
  useMatchRecorderExitGuard,
  confirmLeaveMatchRecorder,
} from '../contexts/MatchRecorderExitGuardContext';
import { useVoiceCommand } from '../hooks/useVoiceCommand';
import { haptics } from '../lib/design/haptics';
import { HIT_SLOP_MIN } from '../lib/design/tokens';
import { Text, Card, Button, Stat, EmptyState } from './ui';
import {
  useMatchRecorder,
  MatchPicker,
  ClockBar,
  FoulCounter,
  OpponentBar,
  VoiceButton,
  SyncBadge,
  VoiceOverlay,
  PlayerActionCard,
  BenchCard,
  GoalTypeSheet,
  ScoreSheet,
  StatsTable,
  isGoalkeeper,
  PLAYER_ACTIONS,
  type RecorderAction,
} from './recorder';
import type { GoalType } from '../lib/services/matchEvents';
import type { MatchEventType } from '../types';

type View2 = 'saisie' | 'bilan';

export interface TabletMatchRecorderProps {
  initialMatchId?: string | null;
  onMatchFinished?: () => void;
  onBack?: () => void;
}

export default function TabletMatchRecorder({
  initialMatchId,
  onMatchFinished,
  onBack,
}: TabletMatchRecorderProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { setIsRecordingActive, suppressExitGuard, setSuppressExitGuard } =
    useMatchRecorderExitGuard();

  const r = useMatchRecorder({ initialMatchId, onMatchFinished });

  const [view, setView] = useState<View2>('saisie');
  const [selectedForChange, setSelectedForChange] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [scoreSheet, setScoreSheet] = useState(false);
  const [goalSheet, setGoalSheet] = useState<{
    eventType: 'goal' | 'opponent_goal';
    playerId?: string | null;
    statKey?: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const layoutsRef = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const dropRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => setToast(msg), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Garde de sortie ───────────────────────────────────────────────────────

  useEffect(() => {
    const active = r.step === 'record' && !!r.match;
    setIsRecordingActive(active);
    if (active) setSuppressExitGuard(false);
    return () => setIsRecordingActive(false);
  }, [r.step, r.match, setIsRecordingActive, setSuppressExitGuard]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (r.step !== 'record' || !r.match || suppressExitGuard) return;
        e.preventDefault();
        confirmLeaveMatchRecorder(() => navigation.dispatch(e.data.action), setSuppressExitGuard);
      }),
    [navigation, r.step, r.match, suppressExitGuard, setSuppressExitGuard]
  );

  // ── Saisie ────────────────────────────────────────────────────────────────

  const handleAction = useCallback(
    (playerId: string, a: RecorderAction) => {
      if (a.eventType === 'goal') {
        setGoalSheet({ eventType: 'goal', playerId, statKey: a.statKey });
        return;
      }
      r.recordEvent(a.eventType, playerId, a.statKey || undefined);
    },
    [r]
  );

  const handleCardUndo = useCallback(
    (playerId: string, a: RecorderAction) => {
      r.undoEvent(a.eventType, a.statKey, playerId);
      showToast(`${a.label} annulé`);
    },
    [r, showToast]
  );

  const handleGoalType = useCallback(
    (type: GoalType) => {
      if (!goalSheet) return;
      r.recordEvent(goalSheet.eventType, goalSheet.playerId ?? null, goalSheet.statKey, type);
      setGoalSheet(null);
    },
    [goalSheet, r]
  );

  const handleOpponent = useCallback(
    (eventType: MatchEventType) => {
      if (eventType === 'opponent_goal') {
        setGoalSheet({ eventType: 'opponent_goal' });
        return;
      }
      r.recordEvent(eventType);
    },
    [r]
  );

  const handleUndoLast = useCallback(async () => {
    const undone = await r.undoLast();
    showToast(undone ? `${undone.label} annulé` : 'Rien à annuler');
  }, [r, showToast]);

  // ── Changement : double touche ou glisser-déposer ─────────────────────────

  const substitute = useCallback(
    (outId: string, inId: string) => {
      r.substitute(outId, inId);
      setSelectedForChange(null);
      const out = r.convoquedPlayers.find((p) => p.id === outId);
      const inn = r.convoquedPlayers.find((p) => p.id === inId);
      showToast(`${out?.last_name ?? '?'} → ${inn?.last_name ?? '?'}`);
    },
    [r, showToast]
  );

  const handleSelect = useCallback(
    (playerId: string, onField: boolean) => {
      haptics.select();
      if (!selectedForChange) {
        setSelectedForChange(playerId);
        return;
      }
      if (selectedForChange === playerId) {
        setSelectedForChange(null);
        return;
      }
      const selectedOnField = r.playersOnField.includes(selectedForChange);
      if (selectedOnField && !onField) substitute(selectedForChange, playerId);
      else if (!selectedOnField && onField) substitute(playerId, selectedForChange);
      else setSelectedForChange(playerId);
    },
    [selectedForChange, r.playersOnField, substitute]
  );

  const nodesRef = useRef<Record<string, View | null>>({});

  /**
   * La géométrie n'est connue qu'après le layout, pas au montage du ref : la
   * mesure est déclenchée par `onLayout`. `measureInWindow` donne des
   * coordonnées écran, les mêmes que `absoluteX`/`absoluteY` du geste.
   */
  const measureCard = useCallback((id: string) => {
    nodesRef.current[id]?.measureInWindow((x, y, w, h) => {
      layoutsRef.current[id] = { x, y, w, h };
    });
  }, []);

  const findDropTarget = useCallback(
    (sourceId: string, sourceOnField: boolean, x: number, y: number): string | null => {
      for (const [id, l] of Object.entries(layoutsRef.current)) {
        if (id === sourceId) continue;
        if (x < l.x || x > l.x + l.w || y < l.y || y > l.y + l.h) continue;
        const targetOnField = r.playersOnField.includes(id);
        if (sourceOnField !== targetOnField) return id;
      }
      return null;
    },
    [r.playersOnField]
  );

  const makeDragGesture = useCallback(
    (playerId: string, onField: boolean) =>
      Gesture.Pan()
        .activateAfterLongPress(onField ? 700 : 400)
        .runOnJS(true)
        .onStart(() => {
          haptics.tapMedium();
          setDragging(playerId);
          dropRef.current = null;
          setDropTarget(null);
        })
        .onUpdate((e) => {
          const found = findDropTarget(playerId, onField, e.absoluteX, e.absoluteY);
          if (found !== dropRef.current) {
            dropRef.current = found;
            setDropTarget(found);
          }
        })
        .onEnd((e) => {
          const found = findDropTarget(playerId, onField, e.absoluteX, e.absoluteY);
          if (found) {
            if (onField) substitute(playerId, found);
            else substitute(found, playerId);
          }
        })
        .onFinalize(() => {
          setDragging(null);
          setDropTarget(null);
          dropRef.current = null;
        }),
    [findDropTarget, substitute]
  );

  // ── Commandes vocales ─────────────────────────────────────────────────────

  const { isListening, startListening, stopListening, isAvailable: voiceAvailable } = useVoiceCommand({
    players: r.convoquedPlayers,
    playersOnField: r.playersOnField,
    onEvent: (eventType, player, statKey) => {
      if (eventType === 'goal' || eventType === 'opponent_goal') {
        setGoalSheet({ eventType, playerId: player?.id ?? null, statKey });
        showToast(`${player ? `${player.first_name} · ` : ''}But — choisissez la phase`);
        return;
      }
      r.recordEvent(eventType, player?.id ?? null, statKey || undefined);
      const label = PLAYER_ACTIONS.find((a) => a.eventType === eventType)?.label ?? eventType;
      showToast(`${player ? `${player.first_name} ${player.last_name}` : 'Adversaire'} · ${label}`);
    },
    onSubstitution: substitute,
    onUnknown: (transcript) => showToast(`Non reconnu : « ${transcript} »`),
  });

  // ── Sortie ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const ok = await r.saveMatch();
    if (!ok) return;
    setSuppressExitGuard(true);
    Alert.alert('Match enregistré', 'Score, temps de jeu et événements sont sauvegardés.', [
      {
        text: 'Voir le rapport',
        onPress: () => {
          onMatchFinished?.();
          router.push(`/(tabs)/tracker/match-report/${r.matchId}`);
        },
      },
      { text: 'Terminer', onPress: () => onMatchFinished?.() },
    ]);
  }, [r, router, onMatchFinished, setSuppressExitGuard]);

  // ── Sélection du match ────────────────────────────────────────────────────

  if (r.step === 'select') {
    return (
      <ScrollView style={s.canvas} contentContainerStyle={s.selectContent}>
        <Text variant="title">Suivre un match</Text>
        <Text variant="callout" tone="secondary" style={s.selectSub}>
          Choisissez la rencontre à enregistrer en direct
        </Text>
        <MatchPicker matches={r.matches} loading={r.loading} onSelect={r.selectMatch} />
        {onBack && <Button label="Retour" onPress={onBack} variant="ghost" icon="arrow-back" />}
      </ScrollView>
    );
  }

  if (!r.match) {
    return (
      <View style={s.centered}>
        <EmptyState icon="hourglass-outline" title="Chargement du match…" compact />
      </View>
    );
  }

  const wide = width > 900;
  const bench = r.benchPlayers;
  const draggedName = dragging
    ? (r.convoquedPlayers.find((p) => p.id === dragging)?.last_name ?? null)
    : null;

  // Le gardien passe en tête : c'est la lecture naturelle d'un cinq de futsal.
  const field = [...r.fieldPlayers].sort((a, b) => {
    const ga = isGoalkeeper(a.position) ? 0 : 1;
    const gb = isGoalkeeper(b.position) ? 0 : 1;
    return ga - gb;
  });

  return (
    <View style={s.root}>
      {/* Bandeau de contrôle */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <Text variant="headline" style={s.headerTitle} numberOfLines={1}>
            {r.match.title || r.match.opponent_team || 'Match'}
            {r.match.competition ? ` · ${r.match.competition}` : ''}
          </Text>
          <SyncBadge pending={r.outboxLength} />
          <View style={s.headerActions}>
            <HeaderButton
              icon="arrow-undo"
              label={r.lastAction ? `Annuler ${r.lastAction.label.toLowerCase()}` : 'Annuler'}
              onPress={handleUndoLast}
              disabled={!r.lastAction}
            />
            <HeaderButton
              icon="pencil"
              label="Saisie"
              onPress={() => setView('saisie')}
              active={view === 'saisie'}
            />
            <HeaderButton
              icon="stats-chart"
              label="Bilan"
              onPress={() => setView('bilan')}
              active={view === 'bilan'}
            />
            <HeaderButton icon="flag" label="Fin du match" onPress={handleSave} loading={r.saving} />
          </View>
        </View>

        <View style={[s.controls, wide && s.controlsWide]}>
          <View style={s.clockCell}>
            <ClockBar
              seconds={r.seconds}
              half={r.half}
              isRunning={r.isRunning}
              onToggle={r.toggleClock}
              scoreUs={r.scoreUs}
              scoreOpponent={r.scoreOpponent}
              onEditScore={() => setScoreSheet(true)}
            />
          </View>

          <View style={s.foulsCell}>
            <FoulCounter
              label="Fautes équipe"
              value={r.foulsUs}
              onIncrement={() => r.setFoulsUs((n) => n + 1)}
              onDecrement={() => r.setFoulsUs((n) => Math.max(0, n - 1))}
              tone="us"
            />
            <FoulCounter
              label="Fautes adverses"
              value={r.foulsOpponent}
              onIncrement={() => r.setFoulsOpponent((n) => n + 1)}
              onDecrement={() => r.setFoulsOpponent((n) => Math.max(0, n - 1))}
              tone="opponent"
            />
          </View>

          <View style={s.oppCell}>
            <Text variant="caption" style={s.onBrandMuted}>
              Actions adverses
            </Text>
            <OpponentBar
              onRecord={handleOpponent}
              onUndo={(e) => r.undoEvent(e, '', null)}
              counts={{
                goals: r.scoreOpponent,
                onTarget: r.opponentShotsOnTarget,
                total: r.opponentShotsTotal,
              }}
            />
          </View>

          <View style={s.sideCell}>
            {voiceAvailable && (
              <VoiceButton
                isListening={isListening}
                onPress={isListening ? stopListening : startListening}
              />
            )}
            <View style={s.timeoutRow}>
              <TimeoutChip
                label="TM équipe"
                used={r.timeoutUs}
                onToggle={() => r.setTimeoutUs((v) => !v)}
              />
              <TimeoutChip
                label="TM adverse"
                used={r.timeoutOpponent}
                onToggle={() => r.setTimeoutOpponent((v) => !v)}
              />
            </View>
            {r.half === 1 && (
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Passer en seconde période',
                    'Le chrono repart de zéro, les fautes cumulées et les temps morts sont remis à zéro. Les temps de jeu sont conservés.',
                    [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Confirmer', onPress: r.nextHalf },
                    ]
                  )
                }
                style={({ pressed }) => [s.halfBtn, pressed && s.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Passer en seconde mi-temps"
              >
                <Ionicons name="play-forward" size={15} color="#FFFFFF" />
                <Text variant="caption" weight="700" style={s.onBrand}>
                  2e mi-temps
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {view === 'saisie' ? (
        <ScrollView style={s.flex} contentContainerStyle={s.body}>
          <Text variant="caption" tone="secondary" weight="700">
            Sur le terrain — touchez une action, appui long pour l'annuler
          </Text>
          <View style={s.fieldRow}>
            {field.map((p) => (
              <GestureDetector key={p.id} gesture={makeDragGesture(p.id, true)}>
                <View
                  ref={(node) => {
                    nodesRef.current[p.id] = node;
                  }}
                  onLayout={() => measureCard(p.id)}
                  style={s.fieldCell}
                  collapsable={false}
                >
                  <PlayerActionCard
                    player={p}
                    state={r.playerStates[p.id]}
                    onAction={(a) => handleAction(p.id, a)}
                    onUndo={(a) => handleCardUndo(p.id, a)}
                    onToggleSelect={() => handleSelect(p.id, true)}
                    selected={selectedForChange === p.id}
                    isDragging={dragging === p.id}
                    isDropTarget={dropTarget === p.id}
                    incomingName={draggedName}
                  />
                </View>
              </GestureDetector>
            ))}
          </View>

          <Text variant="caption" tone="secondary" weight="700" style={s.benchLabel}>
            Remplaçants — touchez pour sélectionner, ou glissez sur un joueur du terrain
          </Text>
          {bench.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Banc vide"
              description="Tous les joueurs convoqués sont sur le terrain."
              compact
            />
          ) : (
            <View style={s.benchRow}>
              {bench.map((p) => (
                <GestureDetector key={p.id} gesture={makeDragGesture(p.id, false)}>
                  <View
                    ref={(node) => {
                      nodesRef.current[p.id] = node;
                    }}
                    onLayout={() => measureCard(p.id)}
                    collapsable={false}
                    style={s.benchCell}
                  >
                    <BenchCard
                      player={p}
                      state={r.playerStates[p.id]}
                      onPress={() => handleSelect(p.id, false)}
                      selected={selectedForChange === p.id}
                      isDragging={dragging === p.id}
                      isDropTarget={dropTarget === p.id}
                      outgoingName={draggedName}
                    />
                  </View>
                </GestureDetector>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={s.flex} contentContainerStyle={s.body}>
          <View style={s.bilanRow}>
            <Card variant="flat" padding="lg" style={s.bilanCard}>
              <Text variant="headline">Notre équipe</Text>
              <View style={s.statGrid}>
                <Stat label="Tirs" value={String(r.teamStats.total)} />
                <Stat
                  label="Tirs cadrés"
                  value={String(r.teamStats.onTarget)}
                  valueColor={c.positive.default}
                />
                <Stat
                  label="Récupérations"
                  value={String(r.teamStats.recoveries)}
                  valueColor={c.positive.default}
                />
                <Stat
                  label="Pertes de balle"
                  value={String(r.teamStats.ballLoss)}
                  valueColor={c.negative.default}
                />
              </View>
            </Card>

            <Card variant="flat" padding="lg" style={s.bilanCard}>
              <Text variant="headline">Adversaire</Text>
              <View style={s.statGrid}>
                <Stat label="Tirs concédés" value={String(r.opponentShotsTotal)} />
                <Stat
                  label="Tirs cadrés concédés"
                  value={String(r.opponentShotsOnTarget)}
                  valueColor={c.warning.default}
                />
              </View>
            </Card>
          </View>

          <Card variant="flat" padding="md">
            <Text variant="headline" style={s.tableTitle}>
              Joueurs convoqués
            </Text>
            <StatsTable rows={r.statRows} />
          </Card>
        </ScrollView>
      )}

      <GoalTypeSheet
        visible={!!goalSheet}
        conceded={goalSheet?.eventType === 'opponent_goal'}
        scorerName={
          goalSheet?.playerId
            ? r.convoquedPlayers.find((p) => p.id === goalSheet.playerId)?.last_name
            : null
        }
        onSelect={handleGoalType}
        onClose={() => setGoalSheet(null)}
      />

      <ScoreSheet
        visible={scoreSheet}
        scoreUs={r.scoreUs}
        scoreOpponent={r.scoreOpponent}
        onChangeUs={r.setScoreUs}
        onChangeOpponent={r.setScoreOpponent}
        onClose={() => setScoreSheet(false)}
      />

      <VoiceOverlay message={toast} icon={isListening ? 'mic' : 'checkmark-circle'} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HeaderButton({
  icon,
  label,
  onPress,
  active,
  disabled,
  loading,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.headerBtn,
        active && s.headerBtnActive,
        (disabled || loading) && s.disabled,
        pressed && s.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      accessibilityLabel={label}
    >
      <Ionicons name={loading ? 'hourglass-outline' : icon} size={16} color="#FFFFFF" />
      <Text variant="caption" weight="600" style={s.onBrand} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function TimeoutChip({
  label,
  used,
  onToggle,
}: {
  label: string;
  used: boolean;
  onToggle: () => void;
}) {
  const s = useStyles();
  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onToggle();
      }}
      style={({ pressed }) => [s.timeout, used && s.timeoutUsed, pressed && s.pressed]}
      accessibilityRole="switch"
      accessibilityState={{ checked: used }}
      accessibilityLabel={`Temps mort ${label}, ${used ? 'utilisé' : 'disponible'}`}
    >
      <Ionicons name={used ? 'checkmark-circle' : 'time-outline'} size={14} color="#FFFFFF" />
      <Text variant="caption" weight="600" style={s.onBrand} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  canvas: { flex: 1, backgroundColor: t.colors.bg.canvas },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.bg.canvas,
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.4 },
  onBrand: { color: '#FFFFFF' },
  onBrandMuted: { color: 'rgba(255,255,255,0.78)' },

  selectContent: { padding: t.space.xxl, paddingBottom: t.space.giant, gap: t.space.sm },
  selectSub: { marginBottom: t.space.sm },

  header: {
    backgroundColor: t.colors.accent.fill,
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.xxl,
    paddingBottom: t.space.md,
    gap: t.space.md,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  headerTitle: { color: '#FFFFFF', flex: 1 },
  headerActions: { flexDirection: 'row', gap: t.space.sm },
  headerBtn: {
    minHeight: HIT_SLOP_MIN - 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xs,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerBtnActive: { backgroundColor: 'rgba(255,255,255,0.32)', borderColor: '#FFFFFF' },

  controls: { gap: t.space.md },
  controlsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  clockCell: { flex: 1.4 },
  foulsCell: { flex: 1.2, flexDirection: 'row', gap: t.space.sm },
  oppCell: { flex: 1.6, gap: t.space.xs },
  sideCell: { flex: 1, gap: t.space.sm },

  timeoutRow: { flexDirection: 'row', gap: t.space.sm },
  timeout: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  timeoutUsed: { backgroundColor: 'rgba(255,255,255,0.32)', borderColor: '#FFFFFF' },

  halfBtn: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    borderRadius: t.radius.sm,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },

  body: { padding: t.space.lg, paddingBottom: t.space.giant, gap: t.space.sm },
  fieldRow: { flexDirection: 'row', gap: t.space.sm, alignItems: 'stretch' },
  fieldCell: { flex: 1, minWidth: 0 },
  benchLabel: { marginTop: t.space.md },
  benchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  benchCell: { flexGrow: 1, flexBasis: 130, maxWidth: 200 },

  bilanRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  bilanCard: { flexGrow: 1, flexBasis: 320, gap: t.space.md },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.lg },
  tableTitle: { marginBottom: t.space.sm },
}));
