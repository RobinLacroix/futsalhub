import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../../../contexts/ThemeContext';
import { haptics } from '../../../../../lib/design/haptics';
import { playPhaseTransitionSound } from '../../../../../lib/design/liveSessionSound';
import { getUserClubId } from '../../../../../lib/services/clubs';
import { getTrainingById } from '../../../../../lib/services/trainings';
import { getSessionById, type SessionBlock } from '../../../../../lib/services/sessionsService';
import {
  startTrainingGame,
  endTrainingGame,
  getGamesForTraining,
  getGameSquadsForGames,
  type TrainingGame,
  type TrainingGameSquad,
} from '../../../../../lib/services/trainingGames';
import { getProceduresByClub, type TrainingProcedureRecord } from '../../../../../lib/services/trainingProceduresService';
import { enqueueTrainingGameScoreUpdate, flushTrainingGameOutbox } from '../../../../../lib/offline/trainingGameOutbox';
import { readLiveSessionSnapshot, writeLiveSessionSnapshot, type LiveSessionSnapshot } from '../../../../../lib/liveSession/liveSessionStorage';
import { computeLiveLevels, formatClock, nextPartIndex, procedureKey, type LiveLevels, type SquadLevels } from '../../../../../lib/liveSession/levels';
import { useLeaveGuard } from '../../../../../hooks/useLeaveGuard';
import { useLiveGameTimer, type SeriesConfig } from '../../../../../hooks/useLiveGameTimer';
import { Screen, Text, Button, Badge, Sheet, EmptyState, SkeletonDetail } from '../../../../../components/ui';
import { ProcedurePickerSheet } from '../../../../../components/training/ProcedurePickerSheet';
import { ProcedureSheet, type PlannedBlock, type ProcedureDraft } from '../../../../../components/live/ProcedureSheet';
import { squadColor } from '../../../../../lib/liveSession/bibColors';
import { SquadToggle } from '../../../../../components/live/SquadToggle';
import { SquadTile } from '../../../../../components/live/SquadTile';

const DEFAULT_SERIES: SeriesConfig = { seriesCount: 4, seriesDurationSeconds: 180, restDurationSeconds: 60 };

const BLOCK_LABELS: Record<string, string> = {
  Echauffement: 'Échauffement',
  Problematisation: 'Problématisation',
  Situation: 'Situation',
  Analytique: 'Analytique',
  JeuOriente: 'Jeu orienté',
  MatchLibre: 'Match libre',
};

const seriesFromGame = (g: TrainingGame): SeriesConfig | null =>
  g.timer_mode === 'series' && g.series_count && g.series_duration_seconds
    ? { seriesCount: g.series_count, seriesDurationSeconds: g.series_duration_seconds, restDurationSeconds: g.rest_duration_seconds ?? 0 }
    : null;

/** Tick d'une seconde pour les chronos globaux ; l'heure est toujours recalculée depuis un timestamp, jamais incrémentée. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function LiveScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<'loading' | 'noSquads' | 'ready'>('loading');
  const [snapshot, setSnapshot] = useState<LiveSessionSnapshot | null>(null);
  const [games, setGames] = useState<TrainingGame[]>([]);
  const [gameSquads, setGameSquads] = useState<TrainingGameSquad[]>([]);
  const [procedures, setProcedures] = useState<TrainingProcedureRecord[]>([]);
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [draft, setDraft] = useState<ProcedureDraft>({ procedure: null, freeLabel: null, pointsPerTap: 1, seriesOn: false, series: DEFAULT_SERIES });

  const gameSquadsRef = useRef<TrainingGameSquad[]>([]);
  gameSquadsRef.current = gameSquads;
  const gamesRef = useRef<TrainingGame[]>([]);
  gamesRef.current = games;

  // ── Chargement ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!trainingId) return;
    (async () => {
      const snap = await readLiveSessionSnapshot(trainingId);
      if (!snap || Object.keys(snap.composition).length === 0) {
        setStatus('noSquads');
        return;
      }
      setSnapshot(snap);
      if (snap.lastSeriesConfig) setDraft((d) => ({ ...d, series: snap.lastSeriesConfig as SeriesConfig }));
      try {
        const [allGames, clubId, training] = await Promise.all([getGamesForTraining(trainingId), getUserClubId(), getTrainingById(trainingId)]);
        setGames(allGames);
        setGameSquads(await getGameSquadsForGames(allGames.map((g) => g.id)));
        if (clubId) setProcedures(await getProceduresByClub(clubId));
        if (training?.session_id) {
          const session = await getSessionById(training.session_id);
          setBlocks(session?.blocks ?? []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur de chargement');
      }
      setStatus('ready');
    })();
  }, [trainingId]);

  // L'écran Équipes écrit dans le snapshot : on le relit au retour.
  useFocusEffect(
    useCallback(() => {
      if (!trainingId || status === 'loading') return;
      readLiveSessionSnapshot(trainingId).then((snap) => {
        if (snap && Object.keys(snap.composition).length > 0) {
          setSnapshot(snap);
          setStatus('ready');
        }
      });
    }, [trainingId, status]),
  );

  // ── État dérivé ────────────────────────────────────────────────────────────

  const openGame = useMemo(() => games.filter((g) => !g.ended_at).sort((a, b) => b.sequence - a.sequence)[0] ?? null, [games]);
  const lastGame = useMemo(() => games.slice().sort((a, b) => b.sequence - a.sequence)[0] ?? null, [games]);
  const shownGame = openGame ?? lastGame;

  const levels: LiveLevels | null = useMemo(() => {
    if (!snapshot || !shownGame) return null;
    return computeLiveLevels({ squads: snapshot.squads, games, gameSquads, current: shownGame, excludedGameIds: snapshot.resetGameIds });
  }, [snapshot, shownGame, games, gameSquads]);

  /** Avant tout jeu : les équipes en jeu, à zéro. */
  const tiles: SquadLevels[] = useMemo(() => {
    if (levels) return levels.squads;
    if (!snapshot) return [];
    const playing = snapshot.playingSquadIds ?? snapshot.squads.map((sq) => sq.id);
    return snapshot.squads
      .filter((sq) => playing.includes(sq.id))
      .map((sq) => ({ squadId: sq.id, label: sq.label, colorToken: sq.color_token, sequence: 0, procedure: 0, wins: 0, draws: 0, losses: 0 }));
  }, [levels, snapshot]);

  const now = useNow(!!openGame);
  const clockKey = openGame ? procedureKey(openGame) : null;
  const storedClock = snapshot?.procedureClock && snapshot.procedureClock.key === clockKey ? snapshot.procedureClock : null;
  /** Sans chrono enregistré (procédé jamais mis en pause), le temps court depuis la première séquence. */
  const clockPaused = storedClock ? storedClock.runningSinceMs === null : false;
  const procedureElapsedMs = !openGame
    ? 0
    : storedClock
      ? storedClock.accumulatedMs + (storedClock.runningSinceMs !== null ? now - storedClock.runningSinceMs : 0)
      : levels?.procedureStartedAtMs
        ? now - levels.procedureStartedAtMs
        : 0;
  const procedureElapsed = Math.max(0, Math.floor(procedureElapsedMs / 1000));
  const sessionElapsed = levels?.sessionStartedAtMs ? Math.floor((now - levels.sessionStartedAtMs) / 1000) : 0;

  const procedureTitle = shownGame
    ? procedures.find((p) => p.id === shownGame.procedure_id)?.title || shownGame.label || 'Jeu libre'
    : 'Aucun procédé en cours';

  /** Bloc suivant de la séance préparée : à la suite du procédé courant s'il en fait partie, sinon au rang du nombre de procédés déjà lancés. */
  const plannedBlockRaw = useMemo(() => {
    if (blocks.length === 0) return null;
    let currentIdx = -1;
    if (shownGame?.procedure_id) blocks.forEach((b, i) => { if (b.procedureId === shownGame.procedure_id) currentIdx = i; });
    return blocks[currentIdx >= 0 ? currentIdx + 1 : new Set(games.map(procedureKey)).size] ?? null;
  }, [blocks, games, shownGame]);

  const planned: PlannedBlock | null = useMemo(() => {
    if (!plannedBlockRaw) return null;
    const proc = plannedBlockRaw.procedureId ? procedures.find((p) => p.id === plannedBlockRaw.procedureId) : null;
    return { label: proc?.title || BLOCK_LABELS[plannedBlockRaw.type] || plannedBlockRaw.type, durationMin: plannedBlockRaw.duration };
  }, [plannedBlockRaw, procedures]);

  // ── Sortie : retour confirmé tant qu'un procédé tourne ──

  useLeaveGuard(!!openGame, {
    title: 'Quitter le mode live ?',
    message: 'Le procédé, les scores et le chrono sont conservés sur ce téléphone : tu pourras reprendre en rouvrant le mode live.',
    stay: 'Rester',
    leave: 'Quitter',
  });

  // ── Actions ────────────────────────────────────────────────────────────────

  const applyScore = (squadId: string, delta: number) => {
    if (!openGame) return;
    const row = gameSquadsRef.current.find((r) => r.game_id === openGame.id && r.squad_id === squadId);
    if (!row) return;
    const score = Math.max(0, row.score + delta);
    if (score === row.score) return;
    const next = gameSquadsRef.current.map((r) => (r === row ? { ...r, score } : r));
    gameSquadsRef.current = next;
    setGameSquads(next);
    void enqueueTrainingGameScoreUpdate(openGame.id, squadId, score);
  };

  /** Remet à zéro les scores d'une portée : la séquence en cours, tout le procédé, ou toute la séance. Les séquences closes concernées sont exclues du bilan V/N/D. */
  const resetScores = (scope: 'sequence' | 'procedure' | 'session') => {
    if (!openGame || !snapshot) return;
    const key = procedureKey(openGame);
    const targets = gamesRef.current.filter((g) => (scope === 'session' ? true : scope === 'procedure' ? procedureKey(g) === key : g.id === openGame.id));
    const ids = new Set(targets.map((g) => g.id));
    const rows = gameSquadsRef.current.filter((r) => ids.has(r.game_id) && r.score !== 0);
    const next = gameSquadsRef.current.map((r) => (ids.has(r.game_id) ? { ...r, score: 0 } : r));
    gameSquadsRef.current = next;
    setGameSquads(next);
    rows.forEach((r) => void enqueueTrainingGameScoreUpdate(r.game_id, r.squad_id, 0));

    const closedIds = targets.filter((g) => g.id !== openGame.id).map((g) => g.id);
    if (closedIds.length > 0) {
      const updated = { ...snapshot, resetGameIds: Array.from(new Set([...(snapshot.resetGameIds ?? []), ...closedIds])) };
      setSnapshot(updated);
      void writeLiveSessionSnapshot(updated);
    }
    setResetOpen(false);
    haptics.warning();
  };

  const confirmReset = (scope: 'sequence' | 'procedure' | 'session', message: string) => {
    Alert.alert('Confirmer la remise à zéro', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Remettre à zéro', style: 'destructive', onPress: () => resetScores(scope) },
    ]);
  };

  const saveClock = (accumulatedMs: number, running: boolean) => {
    if (!snapshot || !clockKey) return;
    const updated = { ...snapshot, procedureClock: { key: clockKey, accumulatedMs: Math.max(0, accumulatedMs), runningSinceMs: running ? Date.now() : null } };
    setSnapshot(updated);
    void writeLiveSessionSnapshot(updated);
  };

  const togglePause = () => {
    if (!openGame) return;
    haptics.tapMedium();
    saveClock(procedureElapsedMs, clockPaused);
  };

  const confirmResetClock = () => {
    if (!openGame) return;
    haptics.warning();
    Alert.alert('Remettre le chrono à zéro ?', 'Le temps du procédé repart de 0:00. Les scores ne changent pas.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Remettre à zéro', style: 'destructive', onPress: () => saveClock(0, !clockPaused) },
    ]);
  };

  const closeGame = async (game: TrainingGame) => {
    await flushTrainingGameOutbox();
    const durationSeconds = Math.floor((Date.now() - new Date(game.started_at ?? Date.now()).getTime()) / 1000);
    await endTrainingGame(game.id, durationSeconds);
    setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, ended_at: new Date().toISOString(), duration_seconds: durationSeconds } : g)));
  };

  const launchSequence = async (o: {
    procedureId: string | null;
    label: string | null;
    partIndex: number | null;
    pointsPerTap: number;
    series: SeriesConfig | null;
  }) => {
    if (!trainingId || !snapshot) return;
    const playing = snapshot.playingSquadIds ?? snapshot.squads.map((sq) => sq.id);
    const squadIds = snapshot.squads.map((sq) => sq.id).filter((id) => playing.includes(id));
    if (squadIds.length < 2) throw new Error('Il faut au moins deux équipes en jeu. Ouvre « Équipes » pour les choisir.');

    const composition = Object.entries(snapshot.composition)
      .filter(([, squadId]) => squadIds.includes(squadId))
      .map(([playerId, squadId]) => ({ playerId, squadId }));

    const game = await startTrainingGame({
      trainingId,
      squadIds,
      timerMode: o.series ? 'series' : 'continu',
      seriesCount: o.series?.seriesCount,
      seriesDurationSeconds: o.series?.seriesDurationSeconds,
      restDurationSeconds: o.series?.restDurationSeconds,
      procedureId: o.procedureId,
      partIndex: o.partIndex,
      label: o.label,
      pointsPerTap: o.pointsPerTap,
      composition,
    });
    setGames((prev) => [...prev, game]);
    setGameSquads((prev) => [
      ...prev,
      ...squadIds.map((squadId, i) => ({ game_id: game.id, squad_id: squadId, club_id: game.club_id, score: 0, sort_order: i })),
    ]);
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  /** Séquence suivante : même procédé, mêmes réglages, composition courante des équipes. */
  const nextSequence = () =>
    run(async () => {
      if (!openGame) return;
      await closeGame(openGame);
      await launchSequence({
        procedureId: openGame.procedure_id,
        label: openGame.label,
        partIndex: openGame.part_index,
        pointsPerTap: openGame.points_per_tap,
        series: seriesFromGame(openGame),
      });
      haptics.success();
    });

  const openProcedureSheet = () => {
    haptics.tapLight();
    const proc = plannedBlockRaw?.procedureId ? procedures.find((p) => p.id === plannedBlockRaw.procedureId) ?? null : null;
    setDraft((d) => ({
      ...d,
      procedure: proc,
      freeLabel: proc ? null : planned?.label ?? null,
      pointsPerTap: openGame?.points_per_tap ?? d.pointsPerTap,
      seriesOn: openGame ? openGame.timer_mode === 'series' : d.seriesOn,
      series: (openGame && seriesFromGame(openGame)) || snapshot?.lastSeriesConfig || d.series,
    }));
    setSheetOpen(true);
  };

  const launchProcedure = () =>
    run(async () => {
      if (openGame) await closeGame(openGame);
      await launchSequence({
        procedureId: draft.procedure?.id ?? null,
        label: draft.procedure?.title ?? draft.freeLabel,
        partIndex: nextPartIndex(gamesRef.current),
        pointsPerTap: draft.pointsPerTap,
        series: draft.seriesOn ? draft.series : null,
      });
      setSheetOpen(false);
      haptics.success();
    });

  const endSession = () =>
    run(async () => {
      if (openGame) await closeGame(openGame);
      setSheetOpen(false);
      router.push(`/(tabs)/calendar/training/recap/${trainingId}` as never);
    });

  /** Choix des équipes sur le terrain pour la prochaine séquence (la séquence en cours garde les siennes). */
  const togglePlaying = (squadId: string) => {
    if (!snapshot) return;
    haptics.select();
    const current = snapshot.playingSquadIds ?? snapshot.squads.map((sq) => sq.id);
    const next = current.includes(squadId) ? current.filter((id) => id !== squadId) : [...current, squadId];
    const updated = { ...snapshot, playingSquadIds: snapshot.squads.map((sq) => sq.id).filter((id) => next.includes(id)) };
    setSnapshot(updated);
    void writeLiveSessionSnapshot(updated);
  };

  const goToSquads = () => router.push(`/(tabs)/calendar/training/squads/${trainingId}` as never);

  // ── Rendu ──────────────────────────────────────────────────────────────────

  if (status === 'loading') return <SkeletonDetail />;

  if (status === 'noSquads') {
    return (
      <Screen>
        <EmptyState
          icon="people-outline"
          title="Compose d'abord les équipes"
          description="Répartis les joueurs présents en équipes, puis reviens ici pour lancer le premier procédé."
          action={{ label: 'Composer les équipes', onPress: goToSquads }}
        />
      </Screen>
    );
  }

  const compact = tiles.length >= 3;
  const playingIds = snapshot?.playingSquadIds ?? snapshot?.squads.map((sq) => sq.id) ?? [];
  const showPicker = (snapshot?.squads.length ?? 0) > 2;

  return (
    <View style={[s.root, { backgroundColor: c.bg.canvas }]}>
      <View style={s.topRow}>
        <View>
          <Text variant="caption" tone="tertiary">Séance</Text>
          <Text variant="headline" numeric>{levels?.sessionStartedAtMs ? formatClock(sessionElapsed) : '0:00'}</Text>
        </View>
        <View style={s.topActions}>
          {openGame ? (
            <Button label="Réinitialiser" icon="refresh" variant="secondary" size="sm" onPress={() => { haptics.tapLight(); setResetOpen(true); }} accessibilityHint="Choisir ce qui repasse à zéro" />
          ) : null}
          <Button label="Équipes" icon="people-outline" variant="secondary" size="sm" onPress={goToSquads} accessibilityHint="Composer ou modifier les équipes" />
        </View>
      </View>

      <View style={[s.chrono, { backgroundColor: c.bg.surface, borderColor: c.border.subtle, borderRadius: theme.radius.xl }]}>
        <View style={s.chronoHead}>
          <View style={s.chronoTitle}>
            <Text variant="caption" tone={clockPaused ? 'warning' : 'tertiary'}>{!openGame ? 'PRÊT' : clockPaused ? 'PROCÉDÉ EN PAUSE' : 'PROCÉDÉ EN COURS'}</Text>
            <Text variant="headline" numberOfLines={1}>{procedureTitle}</Text>
          </View>
          {openGame && levels ? (
            <Badge
              label={levels.sequenceCount > 1 ? `Séquence ${levels.sequenceIndex}/${levels.sequenceCount}` : 'Séquence 1'}
              tone="accent"
              solid
            />
          ) : null}
        </View>

        <Text
          variant="hero"
          numeric
          tone={!openGame ? 'tertiary' : clockPaused ? 'warning' : 'primary'}
          accessibilityLabel={`Temps du procédé ${formatClock(procedureElapsed)}`}
          style={s.clock}
        >
          {formatClock(procedureElapsed)}
        </Text>

        {openGame ? (
          <View style={s.clockActions}>
            <Button
              label={clockPaused ? 'Reprendre' : 'Pause'}
              icon={clockPaused ? 'play' : 'pause'}
              variant={clockPaused ? 'primary' : 'secondary'}
              size="sm"
              onPress={togglePause}
              accessibilityHint="Met le chrono en pause ou le relance"
            />
            <Button label="Zéro" icon="refresh" variant="secondary" size="sm" onPress={confirmResetClock} accessibilityHint="Remet le chrono du procédé à 0:00" />
          </View>
        ) : null}

        {openGame && openGame.timer_mode === 'series' ? <SequenceClock key={openGame.id} game={openGame} paused={clockPaused} /> : null}
      </View>

      {showPicker && snapshot ? (
        <View style={s.picker}>
          <Text variant="caption" tone="tertiary">{openGame ? 'Sur le terrain à la prochaine séquence' : 'Sur le terrain'}</Text>
          <View style={s.pickerRow}>
            {snapshot.squads.map((sq) => (
              <SquadToggle
                key={sq.id}
                label={sq.label}
                color={squadColor(sq.color_token, c.chartSeries)}
                on={playingIds.includes(sq.id)}
                onPress={() => togglePlaying(sq.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {error ? (
        <Text variant="callout" tone="negative" style={s.error} accessibilityRole="alert">{error}</Text>
      ) : null}

      <View style={[s.tiles, compact ? s.tilesColumn : s.tilesRow]}>
        {tiles.map((level) => (
          <SquadTile
            key={level.squadId}
            level={level}
            color={squadColor(level.colorToken, c.chartSeries)}
            tapValue={openGame?.points_per_tap ?? 1}
            disabled={!openGame}
            compact={compact}
            onScore={() => applyScore(level.squadId, openGame?.points_per_tap ?? 1)}
            onUndo={() => applyScore(level.squadId, -(openGame?.points_per_tap ?? 1))}
          />
        ))}
      </View>

      <View style={[s.bar, { backgroundColor: c.bg.surface, borderTopColor: c.border.subtle, paddingBottom: Math.max(insets.bottom, theme.space.md) }]}>
        {openGame ? (
          <>
            <Button label="Procédé suivant" icon="albums-outline" variant="secondary" size="lg" disabled={busy} onPress={openProcedureSheet} style={s.barSecondary} />
            <Button label="Séquence suivante" icon="play-skip-forward" iconAfter size="lg" loading={busy} onPress={nextSequence} style={s.barPrimary} />
          </>
        ) : (
          <Button label="Démarrer un procédé" icon="play" size="lg" block onPress={openProcedureSheet} />
        )}
      </View>

      <Sheet visible={resetOpen} onClose={() => setResetOpen(false)} title="Remettre les scores à zéro" subtitle="Choisis ce qui repasse à 0. Une confirmation te sera demandée.">
        <View style={s.resetBody}>
          <Button
            label="La séquence en cours"
            icon="refresh"
            variant="secondary"
            size="lg"
            block
            onPress={() => confirmReset('sequence', 'Le score de la séquence en cours repasse à 0. Les séquences précédentes ne changent pas.')}
          />
          <Button
            label="Tout le procédé"
            icon="albums-outline"
            variant="secondary"
            size="lg"
            block
            onPress={() => confirmReset('procedure', 'Les scores de toutes les séquences de ce procédé repassent à 0 et ne comptent plus dans le bilan.')}
          />
          <Button
            label="Toute la séance"
            icon="warning-outline"
            variant="destructive"
            size="lg"
            block
            onPress={() => confirmReset('session', 'Les scores de tous les procédés et séquences de la séance repassent à 0 et ne comptent plus dans le bilan. Cette action est définitive.')}
          />
        </View>
      </Sheet>

      <ProcedureSheet
        visible={sheetOpen && !pickerOpen}
        onClose={() => setSheetOpen(false)}
        hasOpenGame={!!openGame}
        hasGames={games.length > 0}
        planned={planned}
        draft={draft}
        onChange={setDraft}
        onPickProcedure={() => setPickerOpen(true)}
        busy={busy}
        onLaunch={launchProcedure}
        onEndSession={endSession}
      />
      <ProcedurePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        procedures={procedures}
        onSelect={(procedureId) => {
          setDraft((d) => ({ ...d, procedure: procedures.find((p) => p.id === procedureId) ?? null, freeLabel: null }));
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

/** Décompte série/repos d'une séquence. Monté par jeu (`key`) : le hook repart d'un état propre à chaque séquence. */
function SequenceClock({ game, paused }: { game: TrainingGame; paused: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();
  const config = seriesFromGame(game);
  const timer = useLiveGameTimer({
    mode: 'series',
    seriesConfig: config,
    gameStartedAtMs: game.started_at ? new Date(game.started_at).getTime() : Date.now(),
    paused,
  });

  const announced = useRef(false);
  useEffect(() => {
    if (timer.isFinished && !announced.current) {
      announced.current = true;
      void playPhaseTransitionSound();
    }
  }, [timer.isFinished]);

  if (!config) return null;

  const rest = timer.phaseKind === 'repos';
  const label = timer.isFinished
    ? 'Séquence terminée'
    : rest
      ? `Repos · ${formatClock(timer.phaseRemainingSeconds ?? 0)}`
      : `Série ${(timer.currentSeriesIndex ?? 0) + 1}/${config.seriesCount} · ${formatClock(timer.phaseRemainingSeconds ?? 0)}`;
  const palette = timer.isFinished ? c.positive : rest ? c.warning : { default: c.accent.default, subtle: c.accent.subtle };
  const icon = timer.isFinished ? 'checkmark-circle' : rest ? 'pause-circle' : 'timer-outline';

  return (
    <View style={[s.seqPill, { backgroundColor: palette.subtle, borderRadius: theme.radius.pill }]} accessibilityRole="timer" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={palette.default} />
      <Text variant="headline" numeric color={palette.default}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, paddingHorizontal: t.space.lg, paddingTop: t.space.sm, gap: t.space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resetBody: { gap: t.space.md, paddingBottom: t.space.lg },
  topActions: { flexDirection: 'row', gap: t.space.sm },
  chrono: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, gap: t.space.xs, alignItems: 'center' },
  chronoHead: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, alignSelf: 'stretch' },
  chronoTitle: { flex: 1 },
  clock: { fontSize: 68, lineHeight: 72, letterSpacing: -2 },
  clockActions: { flexDirection: 'row', gap: t.space.sm },
  seqPill: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, paddingHorizontal: t.space.lg, paddingVertical: t.space.sm },
  picker: { gap: t.space.xs },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  error: { paddingHorizontal: t.space.xs },
  tiles: { flex: 1, gap: t.space.sm },
  tilesRow: { flexDirection: 'row' },
  tilesColumn: { flexDirection: 'column' },
  bar: {
    flexDirection: 'row',
    gap: t.space.sm,
    marginHorizontal: -t.space.lg,
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barSecondary: { flex: 1 },
  barPrimary: { flex: 1.4 },
}));
