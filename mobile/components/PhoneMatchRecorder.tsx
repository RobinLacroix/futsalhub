/**
 * Match recorder — téléphone (P1-3)
 *
 * 1 283 lignes et 176 couleurs en dur ramenées à un assemblage du noyau
 * `components/recorder/`. Toute la logique (chrono, événements, substitution,
 * sauvegarde) vit dans `useMatchRecorder`, partagé avec la tablette.
 *
 * ## Les arbitrages d'écran, spécifiques au téléphone
 *
 * **Le bandeau ne contient plus que ce qui est vrai en permanence** : chrono,
 * score, fautes. Les actions adverses et le micro étaient collés dessus, ce qui
 * portait le bandeau à plus de la moitié de l'écran — il ne restait qu'un tiers
 * pour la saisie. Ils descendent dans l'onglet où on s'en sert.
 *
 * **Trois onglets deviennent trois onglets utilisables.** Les libellés étaient
 * `Temps | Stats | Bilan` pour des états nommés `changements | actions | bilan`
 * dans le code : deux vocabulaires pour trois écrans, dont un (`Stats`) qui
 * n'affichait aucune statistique mais la grille de saisie. Ce sont maintenant
 * `Terrain | Saisie | Bilan`, et le code utilise les mêmes mots.
 *
 * **La grille de saisie passe de 4 à 2 colonnes.** Quatre boutons carrés sur
 * 390 pt donnent des cibles de 88 pt avec un libellé de 10 px. Deux colonnes
 * donnent des cibles pleine largeur, un libellé lisible, et la place pour le
 * compteur et le bouton d'annulation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Alert, SafeAreaView } from 'react-native';
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
import { formatSeconds } from '../utils/matchUtils';
import {
  useMatchRecorder,
  MatchPicker,
  ClockBar,
  ClockAlert,
  FoulRow,
  OpponentBar,
  SyncBadge,
  VoiceOverlay,
  PlayerFieldCard,
  PlayerPicker,
  ActionPad,
  SubstitutionSheet,
  GoalTypeSheet,
  ScoreSheet,
  ScrollableStatsTable,
  PLAYER_ACTIONS,
  type RecorderAction,
} from './recorder';
import type { GoalType } from '../lib/services/matchEvents';
import type { MatchEventType, Player } from '../types';

type Tab = 'terrain' | 'saisie' | 'bilan';

const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'terrain', label: 'Terrain', icon: 'grid-outline' },
  { key: 'saisie', label: 'Saisie', icon: 'add-circle-outline' },
  { key: 'bilan', label: 'Bilan', icon: 'stats-chart-outline' },
];

export interface PhoneMatchRecorderProps {
  initialMatchId?: string | null;
  onMatchFinished?: () => void;
  onBack?: () => void;
}

export default function PhoneMatchRecorder({
  initialMatchId,
  onMatchFinished,
  onBack,
}: PhoneMatchRecorderProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const navigation = useNavigation();
  const { setIsRecordingActive, suppressExitGuard, setSuppressExitGuard } =
    useMatchRecorderExitGuard();

  const r = useMatchRecorder({ initialMatchId, onMatchFinished });

  const [tab, setTab] = useState<Tab>('terrain');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [substituting, setSubstituting] = useState<Player | null>(null);
  const [scoreSheet, setScoreSheet] = useState(false);
  const [goalSheet, setGoalSheet] = useState<{
    eventType: 'goal' | 'opponent_goal';
    playerId?: string | null;
    statKey?: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

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

  // ── Saisie d'une action ───────────────────────────────────────────────────

  const selectedPlayer = useMemo(
    () => r.fieldPlayers.find((p) => p.id === selectedPlayerId) ?? null,
    [r.fieldPlayers, selectedPlayerId]
  );

  const handleAction = useCallback(
    (a: RecorderAction) => {
      if (a.eventType === 'goal') {
        setGoalSheet({ eventType: 'goal', playerId: selectedPlayerId, statKey: a.statKey });
        return;
      }
      r.recordEvent(a.eventType, selectedPlayerId, a.statKey || undefined);
      showToast(`${a.label}${selectedPlayer ? ` · ${selectedPlayer.last_name}` : ''}`);
    },
    [r, selectedPlayerId, selectedPlayer, showToast]
  );

  const handleUndo = useCallback(
    (a: RecorderAction) => {
      r.undoEvent(a.eventType, a.statKey, selectedPlayerId);
      showToast(`${a.label} annulé`);
    },
    [r, selectedPlayerId, showToast]
  );

  const handleGoalType = useCallback(
    (type: GoalType) => {
      if (!goalSheet) return;
      r.recordEvent(goalSheet.eventType, goalSheet.playerId ?? null, goalSheet.statKey, type);
      setGoalSheet(null);
      showToast(goalSheet.eventType === 'goal' ? 'But enregistré' : 'But encaissé enregistré');
    },
    [goalSheet, r, showToast]
  );

  const handleOpponentAction = useCallback(
    (eventType: MatchEventType) => {
      if (eventType === 'opponent_goal') {
        setGoalSheet({ eventType: 'opponent_goal' });
        return;
      }
      r.recordEvent(eventType);
      showToast('Action adverse enregistrée');
    },
    [r, showToast]
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
    onSubstitution: (outId, inId) => {
      r.substitute(outId, inId);
      const out = r.convoquedPlayers.find((p) => p.id === outId);
      const inn = r.convoquedPlayers.find((p) => p.id === inId);
      showToast(`Changement · ${out?.last_name ?? '?'} → ${inn?.last_name ?? '?'}`);
    },
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

  const handleQuit = useCallback(() => {
    Alert.alert(
      'Quitter sans enregistrer',
      'Le score et les temps de jeu de cette session seront perdus. Les actions déjà saisies restent enregistrées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: () => {
            setSuppressExitGuard(true);
            onMatchFinished?.();
          },
        },
      ]
    );
  }, [onMatchFinished, setSuppressExitGuard]);

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

  const minSequence =
    r.fieldPlayers.length > 0
      ? Math.min(...r.fieldPlayers.map((p) => r.playerStates[p.id]?.currentSequenceTime ?? 0))
      : 0;

  return (
    <SafeAreaView style={s.root}>
      {/* Bandeau permanent. Il porte aussi la navigation : le header natif de la
          route est masqué, il faisait doublon avec le titre du match. */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <Pressable
            onPress={handleQuit}
            hitSlop={8}
            style={({ pressed }) => [s.backBtn, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Quitter le suivi de match"
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>

          <Text variant="caption" weight="600" style={s.headerTitle} numberOfLines={1}>
            {r.match.title || r.match.opponent_team || 'Match'}
          </Text>

          <Pressable
            onPress={handleSave}
            disabled={r.saving}
            style={({ pressed }) => [s.savePill, r.saving && s.pressed, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Enregistrer le match"
          >
            <Ionicons
              name={r.saving ? 'hourglass-outline' : 'checkmark-circle'}
              size={17}
              color="#FFFFFF"
            />
            <Text variant="caption" weight="700" style={s.onBrand}>
              Enregistrer
            </Text>
          </Pressable>
        </View>

        <SyncBadge pending={r.outboxLength} />

        <ClockBar
          seconds={r.seconds}
          half={r.half}
          isRunning={r.isRunning}
          onToggle={r.toggleClock}
          scoreUs={r.scoreUs}
          scoreOpponent={r.scoreOpponent}
          onEditScore={() => setScoreSheet(true)}
          compact
          voice={{
            isListening,
            available: voiceAvailable,
            onPress: isListening ? stopListening : startListening,
          }}
        />

        <ClockAlert
          visible={r.clockForgotten}
          neverStarted={r.clockNeverStarted}
          onStart={r.startClock}
        />

        {/* Fautes et actions adverses partagent la place que les seules fautes
            occupaient : deux blocs empilés de 60 pt pour deux chiffres qui
            bougent cinq fois par mi-temps. */}
        <FoulRow
          foulsUs={r.foulsUs}
          foulsOpponent={r.foulsOpponent}
          onChangeUs={r.setFoulsUs}
          onChangeOpponent={r.setFoulsOpponent}
        />
        <OpponentBar
          onRecord={handleOpponentAction}
          onUndo={(e) => r.undoEvent(e, '', null)}
          counts={{
            goals: r.scoreOpponent,
            onTarget: r.opponentShotsOnTarget,
            total: r.opponentShotsTotal,
          }}
        />
      </View>

      {/* Onglets */}
      <View style={s.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                haptics.select();
                setTab(t.key);
              }}
              style={({ pressed }) => [s.tab, active && s.tabActive, pressed && s.pressed]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
            >
              <Ionicons
                name={t.icon}
                size={16}
                color={active ? c.accent.default : c.text.secondary}
              />
              <Text variant="caption" weight={active ? '700' : '600'} tone={active ? 'accent' : 'secondary'}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={s.flex} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* ── Terrain ── */}
        {tab === 'terrain' && (
          <View style={s.block}>
            <Card variant="flat" padding="md" style={s.seqCard}>
              <Stat label="Séquence depuis le dernier changement" value={formatSeconds(minSequence)} />
            </Card>

            <Text variant="caption" tone="secondary">
              {r.fieldPlayers.length} sur le terrain · touchez une carte pour remplacer
            </Text>
            <View style={s.fieldRow}>
              {r.fieldPlayers.map((p) => (
                <PlayerFieldCard
                  key={p.id}
                  player={p}
                  state={r.playerStates[p.id]}
                  onPress={() => setSubstituting(p)}
                />
              ))}
            </View>

            <Text variant="caption" tone="secondary" style={s.blockLabel}>
              Temps morts — un par équipe et par mi-temps
            </Text>
            <View style={s.timeoutRow}>
              <TimeoutToggle
                label="Notre équipe"
                used={r.timeoutUs}
                onToggle={() => r.setTimeoutUs((v) => !v)}
              />
              <TimeoutToggle
                label="Adversaire"
                used={r.timeoutOpponent}
                onToggle={() => r.setTimeoutOpponent((v) => !v)}
              />
            </View>

            {r.half === 1 && (
              <Button
                label="Passer en 2e mi-temps"
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
                variant="secondary"
                icon="play-forward-outline"
                block
              />
            )}
            <Button
              label="Réinitialiser les séquences"
              onPress={r.resetSequences}
              variant="ghost"
              icon="refresh"
              block
            />
          </View>
        )}

        {/* ── Saisie ── */}
        {tab === 'saisie' && (
          <View style={s.block}>
            <Text variant="caption" tone="secondary">
              {selectedPlayer
                ? `${selectedPlayer.first_name} ${selectedPlayer.last_name} — la sélection reste active pour enchaîner`
                : 'Choisissez un joueur, puis une action'}
            </Text>
            <PlayerPicker
              players={r.fieldPlayers}
              selectedId={selectedPlayerId}
              onSelect={setSelectedPlayerId}
              playerStates={r.playerStates}
            />

            <ActionPad
              selectedPlayerId={selectedPlayerId}
              selectedPlayerName={selectedPlayer?.last_name}
              state={selectedPlayerId ? r.playerStates[selectedPlayerId] : undefined}
              onRecord={handleAction}
              onUndo={handleUndo}
            />

            <Text variant="caption" tone="tertiary" style={s.hint}>
              Appui long sur une action pour annuler la dernière
            </Text>
          </View>
        )}

        {/* ── Bilan ── */}
        {tab === 'bilan' && (
          <View style={s.block}>
            <Text variant="caption" tone="secondary" weight="700">
              Notre équipe
            </Text>
            <View style={s.statGrid}>
              <Card variant="flat" padding="md" style={s.statCard}>
                <Stat label="Tirs" value={String(r.teamStats.total)} />
              </Card>
              <Card variant="flat" padding="md" style={s.statCard}>
                <Stat label="Tirs cadrés" value={String(r.teamStats.onTarget)} valueColor={c.positive.default} />
              </Card>
              <Card variant="flat" padding="md" style={s.statCard}>
                <Stat label="Récupérations" value={String(r.teamStats.recoveries)} valueColor={c.positive.default} />
              </Card>
              <Card variant="flat" padding="md" style={s.statCard}>
                <Stat label="Pertes de balle" value={String(r.teamStats.ballLoss)} valueColor={c.negative.default} />
              </Card>
            </View>

            <Text variant="caption" tone="secondary" weight="700" style={s.blockLabel}>
              Adversaire
            </Text>
            <View style={s.statGrid}>
              <Card variant="flat" padding="md" style={s.statCard}>
                <Stat label="Tirs concédés" value={String(r.opponentShotsTotal)} />
              </Card>
              <Card variant="flat" padding="md" style={s.statCard}>
                <Stat
                  label="Tirs cadrés concédés"
                  value={String(r.opponentShotsOnTarget)}
                  valueColor={c.warning.default}
                />
              </Card>
            </View>

            <Text variant="caption" tone="secondary" weight="700" style={s.blockLabel}>
              Joueurs convoqués
            </Text>
            <Card variant="flat" padding="sm">
              <ScrollableStatsTable rows={r.statRows} />
            </Card>
          </View>
        )}
      </ScrollView>

      <SubstitutionSheet
        outgoing={substituting}
        bench={r.benchPlayers}
        playerStates={r.playerStates}
        onSubstitute={(outId, inId) => {
          r.substitute(outId, inId);
          setSubstituting(null);
          if (selectedPlayerId === outId) setSelectedPlayerId(inId);
        }}
        onClose={() => setSubstituting(null)}
      />

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
    </SafeAreaView>
  );
}

/**
 * Le temps mort est un état binaire, pas une action : le bouton porte donc
 * `accessibilityRole="switch"`. L'ancienne version affichait « TM Éq. UTILISÉ »
 * en capitales de 10 px, seul indice de l'état.
 */
function TimeoutToggle({
  label,
  used,
  onToggle,
}: {
  label: string;
  used: boolean;
  onToggle: () => void;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onToggle();
      }}
      style={({ pressed }) => [s.timeout, used && s.timeoutUsed, pressed && s.pressed]}
      accessibilityRole="switch"
      accessibilityState={{ checked: used }}
      accessibilityLabel={`Temps mort ${label}`}
    >
      <Ionicons
        name={used ? 'checkmark-circle' : 'time-outline'}
        size={17}
        color={used ? theme.colors.accent.default : theme.colors.text.secondary}
      />
      <View style={s.flex}>
        <Text variant="caption" weight="600" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" tone={used ? 'accent' : 'tertiary'}>
          {used ? 'Utilisé' : 'Disponible'}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  canvas: { flex: 1, backgroundColor: t.colors.bg.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bg.canvas },
  pressed: { opacity: 0.7 },

  selectContent: { padding: t.space.lg, paddingBottom: t.space.huge, gap: t.space.sm },
  selectSub: { marginBottom: t.space.sm },

  header: {
    backgroundColor: t.colors.accent.fill,
    paddingHorizontal: t.space.md,
    paddingTop: t.space.xs,
    paddingBottom: t.space.sm,
    gap: t.space.xs,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  headerTitle: { color: 'rgba(255,255,255,0.88)', flex: 1 },
  onBrand: { color: '#FFFFFF' },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  savePill: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xs,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },

  tabBar: {
    flexDirection: 'row',
    gap: t.space.xs,
    margin: t.space.sm,
    padding: 3,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.bg.sunken,
  },
  tab: {
    flex: 1,
    minHeight: HIT_SLOP_MIN - 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    borderRadius: t.radius.sm,
  },
  tabActive: { backgroundColor: t.colors.bg.surface, ...t.elevation.raised },

  content: { paddingHorizontal: t.space.md, paddingBottom: t.space.xxl },
  block: { gap: t.space.sm },
  blockLabel: { marginTop: t.space.md },

  seqCard: { alignItems: 'flex-start' },
  fieldRow: { flexDirection: 'row', gap: t.space.xs },

  timeoutRow: { flexDirection: 'row', gap: t.space.sm },
  timeout: {
    flex: 1,
    minHeight: HIT_SLOP_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.sm,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.bg.surface,
    borderWidth: 1,
    borderColor: t.colors.border.subtle,
  },
  timeoutUsed: { borderColor: t.colors.accent.default, backgroundColor: t.colors.accent.subtle },

  hint: { textAlign: 'center', marginTop: t.space.xs },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  statCard: { flexGrow: 1, flexBasis: '45%' },
}));
