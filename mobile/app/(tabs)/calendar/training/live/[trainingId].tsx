import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../../../contexts/ThemeContext';
import { haptics } from '../../../../../lib/design/haptics';
import { getUserClubId } from '../../../../../lib/services/clubs';
import {
  startTrainingGame,
  endTrainingGame,
  getGamesForTraining,
  getGameSquads,
  getGameSquadsForGames,
  type TimerMode,
  type TrainingGame,
  type TrainingGameSquad,
} from '../../../../../lib/services/trainingGames';
import { getProceduresByClub, type TrainingProcedureRecord } from '../../../../../lib/services/trainingProceduresService';
import { enqueueTrainingGameScoreUpdate } from '../../../../../lib/offline/trainingGameOutbox';
import { computeSquadStandings } from '../../../../../lib/liveSession/standings';
import {
  readLiveSessionSnapshot,
  writeLiveSessionSnapshot,
  clearLiveSessionSnapshot,
  type LiveSessionSnapshot,
} from '../../../../../lib/liveSession/liveSessionStorage';
import { useLiveGameTimer, type SeriesConfig } from '../../../../../hooks/useLiveGameTimer';
import { Screen, Card, Text, Button, Input, EmptyState, SkeletonDetail } from '../../../../../components/ui';
import { ProcedurePickerSheet } from '../../../../../components/training/ProcedurePickerSheet';
import { FilterChip } from '../../../../../components/tactics/FilterChip';

type ScreenState = 'loading' | 'noSquads' | 'config' | 'playing' | 'nextGame';

const DEFAULT_SERIES: SeriesConfig = { seriesCount: 4, seriesDurationSeconds: 180, restDurationSeconds: 60 };
const SNAPSHOT_INTERVAL_MS = 5000;

export default function LiveGameScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [snapshot, setSnapshot] = useState<LiveSessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [timerMode, setTimerMode] = useState<TimerMode>('continu');
  const [seriesConfig, setSeriesConfig] = useState<SeriesConfig>(DEFAULT_SERIES);
  const [starting, setStarting] = useState(false);
  const [procedures, setProcedures] = useState<TrainingProcedureRecord[]>([]);
  const [selectedProcedure, setSelectedProcedure] = useState<TrainingProcedureRecord | null>(null);
  const [procedurePickerOpen, setProcedurePickerOpen] = useState(false);
  const [pointsPerTap, setPointsPerTap] = useState(1);
  /** Quelles équipes jouent ce jeu — 2 minimum, pas de maximum : certains jeux opposent 3 plateaux ou plus en même temps. */
  const [selectedSquadIds, setSelectedSquadIds] = useState<string[]>([]);

  const [game, setGame] = useState<TrainingGame | null>(null);
  const [currentGameSquads, setCurrentGameSquads] = useState<TrainingGameSquad[]>([]);
  const [ending, setEnding] = useState(false);
  /** Jeux clos de la séance, tous plateaux confondus — alimente les bandeaux de classement live. */
  const [finishedGames, setFinishedGames] = useState<TrainingGame[]>([]);
  const [finishedGameSquads, setFinishedGameSquads] = useState<TrainingGameSquad[]>([]);

  const gameSquadsRef = useRef<TrainingGameSquad[]>([]);
  gameSquadsRef.current = currentGameSquads;

  // ── Chargement : snapshot des plateaux, reprise d'un jeu non clos ─────────

  useEffect(() => {
    if (!trainingId) return;
    (async () => {
      const snap = await readLiveSessionSnapshot(trainingId);
      if (!snap || Object.keys(snap.composition).length === 0) {
        setScreenState('noSquads');
        return;
      }
      setSnapshot(snap);
      if (snap.lastSeriesConfig) setSeriesConfig(snap.lastSeriesConfig);
      setSelectedSquadIds(snap.squads.map((sq) => sq.id));

      const [allGames, clubId] = await Promise.all([getGamesForTraining(trainingId), getUserClubId()]);
      const finished = allGames.filter((g) => g.ended_at);
      setFinishedGames(finished);
      setFinishedGameSquads(await getGameSquadsForGames(finished.map((g) => g.id)));

      if (clubId) {
        const procs = await getProceduresByClub(clubId);
        setProcedures(procs);

        const open = allGames.find((g) => !g.ended_at) ?? null;
        if (open) {
          setGame(open);
          setCurrentGameSquads(await getGameSquads(open.id));
          setTimerMode(open.timer_mode);
          setPointsPerTap(open.points_per_tap);
          setSelectedProcedure(open.procedure_id ? procs.find((p) => p.id === open.procedure_id) ?? null : null);
          setScreenState('playing');
        } else {
          setScreenState('config');
        }
      } else {
        setScreenState('config');
      }
    })();
  }, [trainingId]);

  // ── Choix des équipes qui jouent ce jeu ────────────────────────────────────

  const toggleSquadSelection = (squadId: string) => {
    haptics.select();
    setSelectedSquadIds((prev) => (prev.includes(squadId) ? prev.filter((id) => id !== squadId) : [...prev, squadId]));
  };

  // ── Démarrage d'un jeu ─────────────────────────────────────────────────────

  const startGame = useCallback(async () => {
    if (!trainingId || !snapshot) return;
    const orderedSquadIds = snapshot.squads.map((sq) => sq.id).filter((id) => selectedSquadIds.includes(id));
    if (orderedSquadIds.length < 2) {
      setError('Choisis au moins deux équipes pour ce jeu.');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const composition = Object.entries(snapshot.composition).map(([playerId, squadId]) => ({ playerId, squadId }));
      const newGame = await startTrainingGame({
        trainingId,
        squadIds: orderedSquadIds,
        timerMode,
        seriesCount: timerMode === 'series' ? seriesConfig.seriesCount : undefined,
        seriesDurationSeconds: timerMode === 'series' ? seriesConfig.seriesDurationSeconds : undefined,
        restDurationSeconds: timerMode === 'series' ? seriesConfig.restDurationSeconds : undefined,
        procedureId: selectedProcedure?.id ?? null,
        label: selectedProcedure?.title ?? null,
        pointsPerTap,
        composition,
      });
      setGame(newGame);
      const freshGameSquads = orderedSquadIds.map((squadId, i) => ({
        game_id: newGame.id,
        squad_id: squadId,
        club_id: newGame.club_id,
        score: 0,
        sort_order: i,
      }));
      setCurrentGameSquads(freshGameSquads);
      await writeLiveSessionSnapshot({
        ...snapshot,
        activeGameId: newGame.id,
        timerMode,
        lastSeriesConfig: timerMode === 'series' ? seriesConfig : snapshot.lastSeriesConfig,
        phaseStartedAtMs: Date.now(),
        phaseKind: 'serie',
        currentSeriesIndex: 0,
        scores: Object.fromEntries(freshGameSquads.map((p) => [p.squad_id, 0])),
      });
      setScreenState('playing');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setStarting(false);
    }
  }, [trainingId, snapshot, timerMode, seriesConfig, selectedProcedure, pointsPerTap, selectedSquadIds]);

  // ── Chrono ───────────────────────────────────────────────────────────────

  const timer = useLiveGameTimer({
    mode: timerMode,
    seriesConfig: timerMode === 'series' ? seriesConfig : null,
    gameStartedAtMs: game?.started_at ? new Date(game.started_at).getTime() : Date.now(),
    initialPhaseStartedAtMs: snapshot?.phaseStartedAtMs ?? undefined,
    initialPhaseKind: snapshot?.phaseKind ?? undefined,
    initialSeriesIndex: snapshot?.currentSeriesIndex ?? undefined,
    onPhaseChange: (phaseStartedAtMs, phaseKind, seriesIndex) => {
      if (!snapshot) return;
      void writeLiveSessionSnapshot({ ...snapshot, phaseStartedAtMs, phaseKind, currentSeriesIndex: seriesIndex });
    },
  });

  // ── Snapshot local toutes les 5s pendant le jeu ────────────────────────────

  useEffect(() => {
    if (screenState !== 'playing' || !snapshot) return;
    const interval = setInterval(() => {
      void writeLiveSessionSnapshot({
        ...snapshot,
        scores: Object.fromEntries(gameSquadsRef.current.map((p) => [p.squad_id, p.score])),
      });
    }, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [screenState, snapshot]);

  // ── Score ───────────────────────────────────────────────────────────────

  const applyScore = (squadId: string, delta: number) => {
    setCurrentGameSquads((prev) => {
      const next = prev.map((p) => (p.squad_id === squadId ? { ...p, score: Math.max(0, p.score + delta) } : p));
      const updated = next.find((p) => p.squad_id === squadId);
      if (game && updated) void enqueueTrainingGameScoreUpdate(game.id, squadId, updated.score);
      return next;
    });
  };

  // ── Fin de jeu ──────────────────────────────────────────────────────────

  const finishGame = useCallback(async () => {
    if (!game || !trainingId) return;
    setEnding(true);
    try {
      const durationSeconds = Math.floor((Date.now() - new Date(game.started_at ?? Date.now()).getTime()) / 1000);
      await endTrainingGame(game.id, durationSeconds);
      const allGames = await getGamesForTraining(trainingId);
      const finished = allGames.filter((g) => g.ended_at);
      setFinishedGames(finished);
      setFinishedGameSquads(await getGameSquadsForGames(finished.map((g) => g.id)));
      setScreenState('nextGame');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setEnding(false);
    }
  }, [game, trainingId]);

  useEffect(() => {
    if (timer.isFinished && screenState === 'playing') {
      void finishGame();
    }
  }, [timer.isFinished, screenState, finishGame]);

  const goToSquads = () => router.push(`/(tabs)/calendar/training/squads/${trainingId}` as never);

  const goToRecap = async () => {
    if (trainingId) await clearLiveSessionSnapshot(trainingId);
    router.push(`/(tabs)/calendar/training/recap/${trainingId}` as never);
  };

  const playAgainSameSquads = () => {
    setGame(null);
    setScreenState('config');
  };

  // ── Rendu ───────────────────────────────────────────────────────────────

  if (screenState === 'loading') return <SkeletonDetail />;

  if (screenState === 'noSquads') {
    return (
      <Screen>
        <EmptyState
          icon="people-outline"
          title="Aucune composition trouvée"
          description="Compose d'abord les équipes de la séance."
          action={{ label: 'Aller aux plateaux', onPress: goToSquads }}
        />
      </Screen>
    );
  }

  if (screenState === 'config') {
    return (
      <Screen contentContainerStyle={s.content}>
        {error ? <Text tone="negative">{error}</Text> : null}

        {snapshot && (
          <Card variant="raised" padding="md" style={s.configCard}>
            <Text variant="headline">Qui joue ce jeu ?</Text>
            <View style={s.chipRow}>
              {snapshot.squads.map((sq) => (
                <FilterChip key={sq.id} label={sq.label} active={selectedSquadIds.includes(sq.id)} onPress={() => toggleSquadSelection(sq.id)} />
              ))}
            </View>
            <Text variant="caption" tone="tertiary">
              {selectedSquadIds.length} équipe{selectedSquadIds.length > 1 ? 's' : ''} sélectionnée{selectedSquadIds.length > 1 ? 's' : ''} — 2 minimum, pas de maximum si plusieurs jouent en même temps.
            </Text>
          </Card>
        )}

        <Card variant="raised" padding="md" style={s.configCard}>
          <Text variant="headline">Procédé et score</Text>
          <Button
            label={selectedProcedure ? selectedProcedure.title || 'Sans titre' : 'Choisir un procédé (optionnel)'}
            icon="document-text-outline"
            variant="secondary"
            block
            onPress={() => setProcedurePickerOpen(true)}
          />
          {selectedProcedure && selectedProcedure.scoring.length > 0 && (
            <Text variant="caption" tone="tertiary">
              Rappel du procédé : {selectedProcedure.scoring.join(' · ')}
            </Text>
          )}
          <Input
            label="Valeur du point (par tap)"
            numeric
            keyboardType="number-pad"
            value={String(pointsPerTap)}
            onChangeText={(v) => setPointsPerTap(Math.max(1, parseInt(v, 10) || 1))}
            containerStyle={s.seriesField}
          />
        </Card>

        <Card variant="raised" padding="md" style={s.configCard}>
          <Text variant="headline">Type de chrono</Text>
          <View style={s.modeRow}>
            <Button
              label="Continu"
              variant={timerMode === 'continu' ? 'primary' : 'secondary'}
              onPress={() => setTimerMode('continu')}
              style={s.modeBtn}
            />
            <Button
              label="Séries"
              variant={timerMode === 'series' ? 'primary' : 'secondary'}
              onPress={() => setTimerMode('series')}
              style={s.modeBtn}
            />
          </View>

          {timerMode === 'series' && (
            <View style={s.seriesInputs}>
              <Input
                label="Séries"
                numeric
                keyboardType="number-pad"
                value={String(seriesConfig.seriesCount)}
                onChangeText={(v) => setSeriesConfig((prev) => ({ ...prev, seriesCount: parseInt(v, 10) || 0 }))}
                containerStyle={s.seriesField}
              />
              <Input
                label="Durée série (s)"
                numeric
                keyboardType="number-pad"
                value={String(seriesConfig.seriesDurationSeconds)}
                onChangeText={(v) => setSeriesConfig((prev) => ({ ...prev, seriesDurationSeconds: parseInt(v, 10) || 0 }))}
                containerStyle={s.seriesField}
              />
              <Input
                label="Repos (s)"
                numeric
                keyboardType="number-pad"
                value={String(seriesConfig.restDurationSeconds)}
                onChangeText={(v) => setSeriesConfig((prev) => ({ ...prev, restDurationSeconds: parseInt(v, 10) || 0 }))}
                containerStyle={s.seriesField}
              />
            </View>
          )}
        </Card>

        <Button label="Démarrer le jeu" icon="play" variant="primary" block loading={starting} onPress={startGame} />
        <Button label="Rebrasser les plateaux" variant="ghost" onPress={goToSquads} />

        <ProcedurePickerSheet
          visible={procedurePickerOpen}
          onClose={() => setProcedurePickerOpen(false)}
          procedures={procedures}
          onSelect={(procedureId) => setSelectedProcedure(procedures.find((p) => p.id === procedureId) ?? null)}
        />
      </Screen>
    );
  }

  if (screenState === 'nextGame') {
    const rows = currentGameSquads
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ ...p, label: snapshot?.squads.find((sq) => sq.id === p.squad_id)?.label ?? '—' }));

    return (
      <Screen contentContainerStyle={s.content}>
        <Card variant="raised" padding="md" style={s.configCard}>
          <Text variant="headline">Jeu terminé</Text>
          {rows.map((r) => (
            <View key={r.squad_id} style={s.nextGameRow}>
              <Text variant="title">{r.label}</Text>
              <Text variant="title" numeric weight="700">{r.score}</Text>
            </View>
          ))}
        </Card>
        <Button label="Jeu suivant" icon="repeat" variant="primary" block onPress={playAgainSameSquads} />
        <Button label="Rebrasser les plateaux" icon="shuffle-outline" variant="secondary" block onPress={goToSquads} />
        <Button label="Terminer la séance" icon="flag-outline" variant="ghost" block onPress={goToRecap} />
      </Screen>
    );
  }

  // screenState === 'playing'
  const participants = currentGameSquads
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => {
      const sq = snapshot?.squads.find((s2) => s2.id === p.squad_id);
      return { ...p, label: sq?.label ?? '—', color: c.chartSeries[Number(sq?.color_token ?? 0) % c.chartSeries.length] };
    });
  const tapValue = game?.points_per_tap ?? 1;
  const procedureGames = game?.procedure_id ? finishedGames.filter((g) => g.procedure_id === game.procedure_id) : [];

  return (
    <View style={s.playingRoot}>
      <View style={[s.phaseBar, { backgroundColor: c.bg.surface, borderBottomColor: c.border.subtle }]}>
        {timerMode === 'series' && timer.phaseKind ? (
          <Text variant="headline" tone={timer.phaseKind === 'repos' ? 'warning' : 'primary'}>
            {timer.phaseKind === 'repos' ? 'Repos' : `Série ${(timer.currentSeriesIndex ?? 0) + 1}/${seriesConfig.seriesCount}`}
            {' · '}
            {formatClock(timer.phaseRemainingSeconds ?? 0)}
          </Text>
        ) : (
          <Text variant="headline" numeric>{formatClock(timer.elapsedSeconds)}</Text>
        )}
        <Pressable onPress={finishGame} disabled={ending} accessibilityRole="button" accessibilityLabel="Terminer le jeu">
          <Text variant="callout" tone="accent">Terminer le jeu</Text>
        </Pressable>
      </View>

      {snapshot && snapshot.squads.length > 2 && (
        <StandingsBanner title="Séance" squads={snapshot.squads} games={finishedGames} gameSquads={finishedGameSquads} />
      )}
      {snapshot && procedureGames.length > 0 && (
        <StandingsBanner
          title={selectedProcedure?.title || 'Procédé'}
          squads={snapshot.squads}
          games={procedureGames}
          gameSquads={finishedGameSquads}
        />
      )}

      <FacesGrid participants={participants} tapValue={tapValue} onScore={applyScore} />
    </View>
  );
}

/** Dispose les aplats de score : côte à côte pour 2, empilés plein largeur pour 3 (plus lisible qu'un tiers d'écran), grille à 2 colonnes au-delà. */
function FacesGrid({
  participants,
  tapValue,
  onScore,
}: {
  participants: { squad_id: string; label: string; color: string; score: number }[];
  tapValue: number;
  onScore: (squadId: string, delta: number) => void;
}) {
  const s = useStyles();
  const n = participants.length;

  const containerStyle = n <= 2 ? s.facesRow : n === 3 ? s.facesColumn : s.facesGrid;
  const tileStyle: ViewStyle | undefined = n >= 4 ? s.gridTile : undefined;

  return (
    <View style={containerStyle}>
      {participants.map((p) => (
        <GameFace
          key={p.squad_id}
          squadLabel={p.label}
          bg={p.color}
          score={p.score}
          style={tileStyle}
          onScore={() => onScore(p.squad_id, tapValue)}
          onUndo={() => onScore(p.squad_id, -tapValue)}
        />
      ))}
    </View>
  );
}

/**
 * Classement live d'un niveau (séance entière, ou un procédé donné) sur tous
 * les plateaux constitués, pas seulement les équipes qui jouent ce jeu. Ne
 * compte que les jeux clos ; le jeu en cours reste dans les aplats jusqu'à
 * "Terminer le jeu". Deux instances possibles côte à côte : séance (dès plus
 * de 2 plateaux) et procédé (dès qu'un 2e jeu du même procédé a été joué).
 */
function StandingsBanner({
  title,
  squads,
  games,
  gameSquads,
}: {
  title: string;
  squads: LiveSessionSnapshot['squads'];
  games: TrainingGame[];
  gameSquads: TrainingGameSquad[];
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();
  const standings = useMemo(() => computeSquadStandings(squads, games, gameSquads), [squads, games, gameSquads]);

  return (
    <View style={[s.standingsBar, { backgroundColor: c.bg.sunken, borderBottomColor: c.border.subtle }]}>
      <Text variant="callout" tone="tertiary" weight="700" style={s.standingsTitle}>{title.toUpperCase()}</Text>
      <View style={s.standingsWrap}>
        {standings.map((sq) => (
          <View key={sq.squadId} style={s.standingChip}>
            <View style={[s.standingDot, { backgroundColor: c.chartSeries[sq.colorIndex % c.chartSeries.length] }]} />
            <Text variant="callout" weight="700" numberOfLines={1}>{sq.label}</Text>
            <Text variant="callout" tone="secondary" numeric>{sq.wins}V {sq.draws}N {sq.losses}D</Text>
            <Text variant="callout" tone={sq.diff > 0 ? 'positive' : sq.diff < 0 ? 'negative' : 'tertiary'} numeric weight="700">
              {sq.diff > 0 ? '+' : ''}{sq.diff}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const sec = Math.max(0, totalSeconds) % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function GameFace({
  squadLabel,
  bg,
  score,
  onScore,
  onUndo,
  style,
}: {
  squadLabel: string;
  bg: string;
  score: number;
  onScore: () => void;
  onUndo: () => void;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={() => {
        haptics.success();
        onScore();
      }}
      accessibilityRole="button"
      accessibilityLabel={`+1 ${squadLabel}`}
      style={[{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Text variant="title" tone="onFill" weight="700">{squadLabel}</Text>
      <Text variant="hero" tone="onFill" numeric weight="700">{score}</Text>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          haptics.tapLight();
          onUndo();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Annuler le point ${squadLabel}`}
        hitSlop={16}
        style={{ marginTop: theme.space.lg, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.sm, borderRadius: theme.radius.pill, backgroundColor: 'rgba(0,0,0,0.25)' }}
      >
        <Text variant="callout" tone="onFill">Annuler le point {squadLabel}</Text>
      </Pressable>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg, paddingBottom: t.space.huge },
  configCard: { gap: t.space.md },
  modeRow: { flexDirection: 'row', gap: t.space.sm },
  modeBtn: { flex: 1 },
  seriesInputs: { flexDirection: 'row', gap: t.space.sm },
  seriesField: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  nextGameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: t.space.xs },
  playingRoot: { flex: 1 },
  phaseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  facesRow: { flex: 1, flexDirection: 'row' },
  facesColumn: { flex: 1, flexDirection: 'column' },
  facesGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  gridTile: { width: '50%', minHeight: '50%' },
  standingsBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, gap: t.space.sm },
  standingsTitle: { letterSpacing: 0.5 },
  standingsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.lg },
  standingChip: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  standingDot: { width: 12, height: 12, borderRadius: 6 },
}));
