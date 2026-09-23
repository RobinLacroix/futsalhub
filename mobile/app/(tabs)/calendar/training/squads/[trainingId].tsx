import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../../../contexts/ActiveTeamContext';
import { getTrainingById } from '../../../../../lib/services/trainings';
import { getPlayersByTeam } from '../../../../../lib/services/players';
import { positionRank } from '../../../../../components/players/positions';
import { haptics } from '../../../../../lib/design/haptics';
import {
  saveSquadsForTraining,
  getSquadsForTraining,
  type TrainingSquad,
} from '../../../../../lib/services/trainingGames';
import {
  readLiveSessionSnapshot,
  writeLiveSessionSnapshot,
} from '../../../../../lib/liveSession/liveSessionStorage';
import { Screen, Card, Text, Button, IconButton, EmptyState, SkeletonDetail } from '../../../../../components/ui';
import type { Player, PlayerStatus } from '../../../../../types';

const MIN_SQUADS = 2;

const isGoalkeeper = (p: Player) => p.position?.toLowerCase().includes('gardien') ?? false;

interface DraftSquad {
  id?: string;
  label: string;
  colorIndex: number;
}

/** Fait avancer un joueur au plateau suivant dans l'ordre, en boucle jusqu'à "non assigné". */
function cycleAssignment(current: string | undefined, squadIds: string[]): string | undefined {
  if (squadIds.length === 0) return undefined;
  if (!current) return squadIds[0];
  const idx = squadIds.indexOf(current);
  if (idx === -1 || idx === squadIds.length - 1) return undefined;
  return squadIds[idx + 1];
}

export default function LiveSquadsScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();
  const { activeTeamId } = useActiveTeam();
  const maxSquads = c.chartSeries.length;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Record<string, PlayerStatus>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [squads, setSquads] = useState<DraftSquad[]>([
    { label: 'Équipe 1', colorIndex: 0 },
    { label: 'Équipe 2', colorIndex: 1 },
  ]);
  /** playerId -> squadIndex (index dans `squads`, pas un id — les plateaux n'ont pas forcément d'id tant qu'ils ne sont pas enregistrés). */
  const [composition, setComposition] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!trainingId || !activeTeamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [training, teamPlayers, existingSquads] = await Promise.all([
        getTrainingById(trainingId),
        getPlayersByTeam(activeTeamId),
        getSquadsForTraining(trainingId),
      ]);
      if (!training) {
        setError('Entraînement introuvable');
        return;
      }
      setAttendance(training.attendance ?? {});
      setPlayers(teamPlayers);

      const snapshot = await readLiveSessionSnapshot(trainingId);

      if (existingSquads.length > 0) {
        const draft: DraftSquad[] = existingSquads.map((sq: TrainingSquad, i: number) => ({
          id: sq.id,
          label: sq.label,
          colorIndex: Number(sq.color_token) || i,
        }));
        setSquads(draft);
        if (snapshot?.composition) {
          const bySquadId = new Map(draft.map((d, i) => [existingSquads[i].id, i]));
          const restored: Record<string, number> = {};
          Object.entries(snapshot.composition).forEach(([playerId, squadId]) => {
            const idx = bySquadId.get(squadId);
            if (idx !== undefined) restored[playerId] = idx;
          });
          setComposition(restored);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [trainingId, activeTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  const eligible = useMemo(
    () => players.filter((p) => attendance[p.id] === 'present' || attendance[p.id] === 'late'),
    [players, attendance],
  );
  const fieldPlayers = useMemo(() => eligible.filter((p) => !isGoalkeeper(p)), [eligible]);
  const goalkeepers = useMemo(() => eligible.filter(isGoalkeeper), [eligible]);

  const addSquad = () => {
    if (squads.length >= maxSquads) return;
    haptics.tapLight();
    setSquads((prev) => [...prev, { label: `Équipe ${prev.length + 1}`, colorIndex: prev.length }]);
  };

  const removeSquad = () => {
    if (squads.length <= MIN_SQUADS) return;
    haptics.tapLight();
    const removedIndex = squads.length - 1;
    setSquads((prev) => prev.slice(0, -1));
    setComposition((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((playerId) => {
        if (next[playerId] === removedIndex) delete next[playerId];
      });
      return next;
    });
  };

  const tapPlayer = (playerId: string) => {
    haptics.select();
    setComposition((prev) => {
      const current = prev[playerId];
      const currentSquadId = current !== undefined ? String(current) : undefined;
      const squadIds = squads.map((_, i) => String(i));
      const next = cycleAssignment(currentSquadId, squadIds);
      const copy = { ...prev };
      if (next === undefined) delete copy[playerId];
      else copy[playerId] = Number(next);
      return copy;
    });
  };

  const balance = () => {
    haptics.tapMedium();
    const sorted = [...fieldPlayers].sort((a, b) => positionRank(a.position) - positionRank(b.position));
    const next: Record<string, number> = {};
    let squadIdx = 0;
    let direction = 1;
    for (const p of sorted) {
      next[p.id] = squadIdx;
      squadIdx += direction;
      if (squadIdx === squads.length) {
        squadIdx = squads.length - 1;
        direction = -1;
      } else if (squadIdx < 0) {
        squadIdx = 0;
        direction = 1;
      }
    }
    // Les gardiens déjà assignés le restent — "Équilibrer" ne les touche jamais.
    setComposition((prev) => {
      const keptGoalkeepers = Object.fromEntries(
        Object.entries(prev).filter(([playerId]) => goalkeepers.some((g) => g.id === playerId)),
      );
      return { ...next, ...keptGoalkeepers };
    });
  };

  const launch = async () => {
    if (!trainingId) return;
    setSaving(true);
    try {
      const savedSquads = await saveSquadsForTraining(
        trainingId,
        squads.map((sq, i) => ({ id: sq.id, label: sq.label, color_token: String(sq.colorIndex), sort_order: i })),
      );
      const compositionBySquadId: Record<string, string> = {};
      Object.entries(composition).forEach(([playerId, squadIdx]) => {
        const squadId = savedSquads[squadIdx]?.id;
        if (squadId) compositionBySquadId[playerId] = squadId;
      });
      await writeLiveSessionSnapshot({
        trainingId,
        squads: savedSquads.map((sq) => ({ id: sq.id, label: sq.label, color_token: sq.color_token })),
        composition: compositionBySquadId,
        activeGameId: null,
        timerMode: null,
        lastSeriesConfig: null,
        phaseStartedAtMs: null,
        phaseKind: null,
        currentSeriesIndex: null,
        scores: {},
        updatedAtMs: Date.now(),
      });
      router.push(`/(tabs)/calendar/training/live/${trainingId}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonDetail />;

  if (error) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="Erreur" description={error} tone="negative" />
      </Screen>
    );
  }

  if (eligible.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="people-outline"
          title="Aucun joueur disponible"
          description="Marque au moins un joueur présent ou en retard dans les présences avant de lancer le mode live."
        />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={s.content}>
      <Card variant="raised" padding="md" style={s.squadsHeader}>
        <View style={s.squadsHeaderRow}>
          <Text variant="headline">{squads.length} équipes</Text>
          <View style={s.stepper}>
            <IconButton icon="remove" label="Retirer une équipe" variant="surface" size="sm" disabled={squads.length <= MIN_SQUADS} onPress={removeSquad} />
            <IconButton icon="add" label="Ajouter une équipe" variant="surface" size="sm" disabled={squads.length >= maxSquads} onPress={addSquad} />
          </View>
        </View>
        <View style={s.legendRow}>
          {squads.map((sq, i) => (
            <View key={i} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: c.chartSeries[sq.colorIndex % c.chartSeries.length] }]} />
              <Text variant="caption" tone="secondary">{sq.label}</Text>
            </View>
          ))}
        </View>
        <Button label="Équilibrer" icon="shuffle-outline" variant="secondary" size="sm" onPress={balance} />
      </Card>

      <Text variant="caption" tone="tertiary" style={s.sectionLabel}>JOUEURS DE CHAMP — {fieldPlayers.length}</Text>
      <View style={s.grid}>
        {fieldPlayers.map((p) => (
          <PlayerPill key={p.id} player={p} squadIndex={composition[p.id]} squads={squads} onPress={() => tapPlayer(p.id)} />
        ))}
      </View>

      {goalkeepers.length > 0 && (
        <>
          <Text variant="caption" tone="tertiary" style={s.sectionLabel}>GARDIENS — {goalkeepers.length}</Text>
          <View style={s.grid}>
            {goalkeepers.map((p) => (
              <PlayerPill key={p.id} player={p} squadIndex={composition[p.id]} squads={squads} onPress={() => tapPlayer(p.id)} />
            ))}
          </View>
        </>
      )}

      <Button label="Lancer" icon="flash" variant="primary" block loading={saving} onPress={launch} style={s.launchBtn} />
    </Screen>
  );
}

function PlayerPill({
  player,
  squadIndex,
  squads,
  onPress,
}: {
  player: Player;
  squadIndex: number | undefined;
  squads: DraftSquad[];
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();
  const assigned = squadIndex !== undefined ? squads[squadIndex] : undefined;
  const bg = assigned ? c.chartSeries[assigned.colorIndex % c.chartSeries.length] : c.bg.surface;

  return (
    <Card
      variant="flat"
      padding="sm"
      onPress={onPress}
      accessibilityLabel={`${player.first_name} ${player.last_name}${assigned ? `, ${assigned.label}` : ', non assigné'}`}
      style={[s.pill, { backgroundColor: bg, borderColor: assigned ? bg : c.border.subtle }]}
    >
      <Text variant="callout" weight="600" tone={assigned ? 'onFill' : 'primary'} numberOfLines={1}>
        {player.first_name} {player.last_name.charAt(0)}.
      </Text>
      {assigned ? (
        <Text variant="caption" tone="onFill" numberOfLines={1}>{assigned.label}</Text>
      ) : (
        <Text variant="caption" tone="tertiary" numberOfLines={1}>Non assigné</Text>
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg, paddingBottom: t.space.huge },
  squadsHeader: { gap: t.space.sm },
  squadsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', gap: t.space.xs },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  sectionLabel: { marginTop: t.space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  pill: { width: '31%', minHeight: 56, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  launchBtn: { marginTop: t.space.lg },
}));
