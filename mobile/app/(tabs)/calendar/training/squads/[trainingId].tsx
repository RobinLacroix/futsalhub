import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  getGamesForTraining,
  type TrainingSquad,
} from '../../../../../lib/services/trainingGames';
import {
  readLiveSessionSnapshot,
  writeLiveSessionSnapshot,
} from '../../../../../lib/liveSession/liveSessionStorage';
import { BIB_COLORS, bibByToken, firstFreeBib, squadColor } from '../../../../../lib/liveSession/bibColors';
import { useLeaveGuard } from '../../../../../hooks/useLeaveGuard';
import { SquadToggle } from '../../../../../components/live/SquadToggle';
import { readableOn } from '../../../../../lib/liveSession/levels';
import { Screen, Card, Text, Button, IconButton, Sheet, EmptyState, SkeletonDetail } from '../../../../../components/ui';
import type { Player, PlayerStatus } from '../../../../../types';

const MIN_SQUADS = 2;


const isGoalkeeper = (p: Player) => p.position?.toLowerCase().includes('gardien') ?? false;

interface DraftSquad {
  id?: string;
  label: string;
  /** Token de chasuble (bibColors.ts). */
  color: string;
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
  const maxSquads = 8;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Record<string, PlayerStatus>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [squads, setSquads] = useState<DraftSquad[]>([
    { label: BIB_COLORS[0].label, color: BIB_COLORS[0].token },
    { label: BIB_COLORS[5].label, color: BIB_COLORS[5].token },
  ]);
  /** playerId -> squadIndex (index dans `squads`, pas un id — les plateaux n'ont pas forcément d'id tant qu'ils ne sont pas enregistrés). */
  const [composition, setComposition] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  /** Indices (dans `squads`) des équipes qui jouent la prochaine séquence. */
  const [playingIdx, setPlayingIdx] = useState<number[]>([0, 1]);
  /** Dès qu'un jeu existe, retirer une équipe supprimerait ses scores en cascade : on ne peut plus en retirer. */
  const [lockedSquadCount, setLockedSquadCount] = useState(0);
  const [hasOpenGame, setHasOpenGame] = useState(false);
  const insets = useSafeAreaInsets();
  const [colorEditIdx, setColorEditIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!trainingId || !activeTeamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [training, teamPlayers, existingSquads, games] = await Promise.all([
        getTrainingById(trainingId),
        getPlayersByTeam(activeTeamId),
        getSquadsForTraining(trainingId),
        getGamesForTraining(trainingId),
      ]);
      setLockedSquadCount(games.length > 0 ? existingSquads.length : 0);
      setHasOpenGame(games.some((g) => !g.ended_at));
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
          color: sq.color_token,
        }));
        setSquads(draft);
        const playingIds = snapshot?.playingSquadIds;
        setPlayingIdx(draft.map((_, i) => i).filter((i) => !playingIds || playingIds.includes(existingSquads[i].id)));
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
    setPlayingIdx((prev) => [...prev, squads.length]);
    setSquads((prev) => {
      const bib = firstFreeBib(prev.map((sq) => sq.color));
      return [...prev, { label: bib.label, color: bib.token }];
    });
  };

  const removeSquad = () => {
    if (squads.length <= Math.max(MIN_SQUADS, lockedSquadCount)) return;
    haptics.tapLight();
    const removedIndex = squads.length - 1;
    setSquads((prev) => prev.slice(0, -1));
    setPlayingIdx((prev) => prev.filter((i) => i !== removedIndex));
    setComposition((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((playerId) => {
        if (next[playerId] === removedIndex) delete next[playerId];
      });
      return next;
    });
  };

  /** Change la couleur d'une équipe ; le nom suit tant qu'il est celui par défaut ou celui de l'ancienne couleur. */
  const setSquadColor = (idx: number, token: string) => {
    haptics.select();
    const bib = bibByToken(token);
    setSquads((prev) =>
      prev.map((sq, i) => {
        if (i !== idx) return sq;
        const previousName = bibByToken(sq.color)?.label;
        const isDefaultName = /^Équipe \d+$/.test(sq.label) || sq.label === previousName;
        return { ...sq, color: token, label: isDefaultName && bib ? bib.label : sq.label };
      }),
    );
    setColorEditIdx(null);
  };

  const togglePlaying = (idx: number) => {
    haptics.select();
    setPlayingIdx((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
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

  const save = async () => {
    if (!trainingId) return;
    if (playingIdx.length < MIN_SQUADS) {
      setSaveError('Choisis au moins deux équipes en jeu.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const savedSquads = await saveSquadsForTraining(
        trainingId,
        squads.map((sq, i) => ({ id: sq.id, label: sq.label, color_token: sq.color, sort_order: i })),
      );
      const compositionBySquadId: Record<string, string> = {};
      Object.entries(composition).forEach(([playerId, squadIdx]) => {
        const squadId = savedSquads[squadIdx]?.id;
        if (squadId) compositionBySquadId[playerId] = squadId;
      });
      const previous = await readLiveSessionSnapshot(trainingId);
      await writeLiveSessionSnapshot({
        activeGameId: null,
        timerMode: null,
        lastSeriesConfig: null,
        phaseStartedAtMs: null,
        phaseKind: null,
        currentSeriesIndex: null,
        scores: {},
        ...previous,
        trainingId,
        squads: savedSquads.map((sq) => ({ id: sq.id, label: sq.label, color_token: sq.color_token })),
        composition: compositionBySquadId,
        playingSquadIds: savedSquads.filter((_, i) => playingIdx.includes(i)).map((sq) => sq.id),
        updatedAtMs: Date.now(),
      });
      allowLeave();
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  // Modifications non enregistrées : on compare à l'état juste après chargement, et le retour demande confirmation.
  const signature = JSON.stringify({ squads, composition, playingIdx });
  const savedSignature = useRef<string | null>(null);
  useEffect(() => {
    if (!loading && savedSignature.current === null) savedSignature.current = signature;
  }, [loading, signature]);
  const dirty = savedSignature.current !== null && savedSignature.current !== signature;

  const { allowLeave } = useLeaveGuard(dirty, {
    title: 'Abandonner les modifications ?',
    message: "Les changements d'équipes, de couleurs et de joueurs ne sont pas encore enregistrés.",
    stay: 'Continuer à modifier',
    leave: 'Abandonner',
  });

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

  const removeLocked = squads.length <= Math.max(MIN_SQUADS, lockedSquadCount);
  const countBySquad = (idx: number) => Object.values(composition).filter((v) => v === idx).length;

  return (
    <View style={s.root}>
      <Screen contentContainerStyle={s.content}>
        {hasOpenGame ? (
          <Card variant="flat" padding="md" style={s.notice}>
            <Ionicons name="information-circle-outline" size={20} color={c.accent.default} />
            <Text variant="callout" style={s.noticeText}>La séquence en cours garde ses équipes. Les changements comptent à partir de la séquence suivante.</Text>
          </Card>
        ) : null}

        <Card variant="raised" padding="md" style={s.squadsHeader}>
          <View style={s.squadsHeaderRow}>
            <Text variant="headline">{squads.length} équipes</Text>
            <View style={s.stepper}>
              <IconButton icon="remove" label="Retirer une équipe" variant="surface" size="lg" disabled={removeLocked} onPress={removeSquad} />
              <IconButton icon="add" label="Ajouter une équipe" variant="surface" size="lg" disabled={squads.length >= maxSquads} onPress={addSquad} />
            </View>
          </View>
          {lockedSquadCount > 0 ? (
            <Text variant="caption" tone="tertiary">Une équipe qui a déjà joué ne peut plus être retirée : ses scores seraient perdus.</Text>
          ) : null}
          <Text variant="caption" tone="tertiary">En jeu à la prochaine séquence</Text>
          <View style={s.squadList}>
            {squads.map((sq, i) => {
              const color = squadColor(sq.color, c.chartSeries);
              const on = playingIdx.includes(i);
              return (
                <View key={i} style={s.squadRow}>
                  <View style={s.squadToggle}>
                    <SquadToggle
                      label={`${sq.label} · ${countBySquad(i)}`}
                      accessibilityLabel={`${sq.label}, ${countBySquad(i)} joueurs`}
                      color={color}
                      on={on}
                      onPress={() => togglePlaying(i)}
                    />
                  </View>
                  <IconButton icon="color-palette-outline" label={`Changer la couleur de ${sq.label}`} variant="surface" size="lg" onPress={() => setColorEditIdx(i)} />
                </View>
              );
            })}
          </View>
          <Button label="Équilibrer" icon="shuffle-outline" variant="secondary" size="sm" onPress={balance} />
        </Card>

        <Text variant="caption" tone="tertiary" style={s.sectionLabel}>JOUEURS DE CHAMP — {fieldPlayers.length}</Text>
        <Text variant="caption" tone="tertiary">Un tap fait passer le joueur à l'équipe suivante, puis à « non assigné ».</Text>
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
      </Screen>

      <View style={[s.bar, { backgroundColor: c.bg.surface, borderTopColor: c.border.subtle, paddingBottom: Math.max(insets.bottom, theme.space.md) }]}>
        {saveError ? <Text variant="callout" tone="negative" accessibilityRole="alert">{saveError}</Text> : null}
        <Button label="Enregistrer et revenir au live" icon="checkmark" size="lg" block loading={saving} onPress={save} />
      </View>

      <Sheet
        visible={colorEditIdx !== null}
        onClose={() => setColorEditIdx(null)}
        title={colorEditIdx !== null ? `Chasuble de ${squads[colorEditIdx]?.label ?? ''}` : undefined}
        subtitle="Choisis la couleur des chasubles portées. Une couleur déjà prise par une autre équipe est grisée."
      >
        <View style={s.swatches}>
          {BIB_COLORS.map((bib) => {
            const takenBy = squads.findIndex((sq, i) => i !== colorEditIdx && sq.color === bib.token);
            const selected = colorEditIdx !== null && squads[colorEditIdx]?.color === bib.token;
            const taken = takenBy !== -1;
            return (
              <Pressable
                key={bib.token}
                disabled={taken}
                onPress={() => colorEditIdx !== null && setSquadColor(colorEditIdx, bib.token)}
                accessibilityRole="button"
                accessibilityLabel={`${bib.label}${taken ? `, déjà prise par ${squads[takenBy].label}` : ''}`}
                accessibilityState={{ selected, disabled: taken }}
                style={[s.swatch, { opacity: taken ? 0.3 : 1 }]}
              >
                <View style={[s.swatchDot, { backgroundColor: bib.hex, borderColor: selected ? c.text.primary : c.border.strong, borderWidth: selected ? 3 : StyleSheet.hairlineWidth }]}>
                  {selected ? <Ionicons name="checkmark" size={26} color={readableOn(bib.hex)} /> : null}
                </View>
                <Text variant="caption" tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>{bib.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
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
  const bg = assigned ? squadColor(assigned.color, c.chartSeries) : c.bg.surface;

  return (
    <Card
      variant="flat"
      padding="sm"
      onPress={onPress}
      accessibilityLabel={`${player.first_name} ${player.last_name}${assigned ? `, ${assigned.label}` : ', non assigné'}`}
      style={[s.pill, { backgroundColor: bg, borderColor: assigned ? bg : c.border.subtle }]}
    >
      <Text variant="callout" weight="600" color={assigned ? readableOn(bg) : c.text.primary} numberOfLines={1}>
        {player.first_name} {player.last_name.charAt(0)}.
      </Text>
      {assigned ? (
        <Text variant="caption" color={readableOn(bg)} numberOfLines={1}>{assigned.label}</Text>
      ) : (
        <Text variant="caption" tone="tertiary" numberOfLines={1}>Non assigné</Text>
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  content: { gap: t.space.lg, paddingBottom: t.space.huge },
  notice: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  noticeText: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs, minHeight: 44, paddingHorizontal: t.space.md, borderRadius: t.radius.pill, borderWidth: StyleSheet.hairlineWidth },
  bar: { gap: t.space.sm, paddingHorizontal: t.space.lg, paddingTop: t.space.md, borderTopWidth: StyleSheet.hairlineWidth },
  squadsHeader: { gap: t.space.sm },
  squadsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', gap: t.space.xs },
  squadList: { gap: t.space.sm },
  squadRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  squadToggle: { flex: 1, alignItems: 'flex-start' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md, paddingBottom: t.space.lg },
  swatch: { width: 72, alignItems: 'center', gap: t.space.xs },
  swatchDot: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  sectionLabel: { marginTop: t.space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  pill: { width: '31%', minHeight: 60, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  launchBtn: { marginTop: t.space.lg },
}));
