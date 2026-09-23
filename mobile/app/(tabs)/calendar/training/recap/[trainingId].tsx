import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../../../contexts/ThemeContext';
import {
  getGamesForTraining,
  getSquadsForTraining,
  getGameSquadsForGames,
  type TrainingGame,
  type TrainingSquad,
  type TrainingGameSquad,
} from '../../../../../lib/services/trainingGames';
import { computeSquadStandings, type SquadStanding } from '../../../../../lib/liveSession/standings';
import { Screen, Card, Text, Button, EmptyState, SkeletonDetail } from '../../../../../components/ui';

export default function LiveRecapScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const router = useRouter();
  const s = useStyles();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<TrainingGame[]>([]);
  const [squads, setSquads] = useState<TrainingSquad[]>([]);
  const [gameSquads, setGameSquads] = useState<TrainingGameSquad[]>([]);

  useEffect(() => {
    if (!trainingId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [g, sq] = await Promise.all([getGamesForTraining(trainingId), getSquadsForTraining(trainingId)]);
        setGames(g);
        setSquads(sq);
        setGameSquads(await getGameSquadsForGames(g.map((game) => game.id)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur');
      } finally {
        setLoading(false);
      }
    })();
  }, [trainingId]);

  const squadById = useMemo(() => new Map(squads.map((sq) => [sq.id, sq])), [squads]);
  const gameSquadsByGame = useMemo(() => {
    const map = new Map<string, TrainingGameSquad[]>();
    for (const gs of gameSquads) {
      const list = map.get(gs.game_id);
      if (list) list.push(gs);
      else map.set(gs.game_id, [gs]);
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [gameSquads]);

  const standings = useMemo(() => computeSquadStandings(squads, games, gameSquads), [squads, games, gameSquads]);

  const finishedGames = useMemo(() => games.filter((g) => g.ended_at), [games]);

  /** Niveau 2 : classement par procédé (1 match = 1pt, même logique que le cumul séance, filtrée par procedure_id). */
  const standingsByProcedure = useMemo(() => {
    const groups = new Map<string, { title: string; games: TrainingGame[] }>();
    for (const g of finishedGames) {
      if (!g.procedure_id) continue;
      const group = groups.get(g.procedure_id);
      if (group) group.games.push(g);
      else groups.set(g.procedure_id, { title: g.label || 'Procédé', games: [g] });
    }
    return Array.from(groups.values())
      .filter((group) => group.games.length > 1)
      .map((group) => ({ title: group.title, standings: computeSquadStandings(squads, group.games, gameSquads) }));
  }, [finishedGames, squads, gameSquads]);

  if (loading) return <SkeletonDetail />;

  if (error) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="Erreur" description={error} tone="negative" />
      </Screen>
    );
  }

  if (finishedGames.length === 0) {
    return (
      <Screen>
        <EmptyState icon="flag-outline" title="Aucun jeu terminé" description="Le récap apparaîtra une fois le premier jeu clos." />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={s.content}>
      <Card variant="raised" padding="md" style={s.section}>
        <Text variant="headline">Cumul de la séance</Text>
        <StandingsRows standings={standings} />
      </Card>

      {standingsByProcedure.map((group) => (
        <Card key={group.title} variant="raised" padding="md" style={s.section}>
          <Text variant="headline">Procédé — {group.title}</Text>
          <StandingsRows standings={group.standings} />
        </Card>
      ))}

      <Card variant="raised" padding="md" style={s.section}>
        <Text variant="headline">Jeux joués</Text>
        {finishedGames.map((g) => {
          const participants = gameSquadsByGame.get(g.id) ?? [];
          return (
            <View key={g.id} style={s.gameRow}>
              <Text variant="callout" style={s.gameLabel} numberOfLines={1}>
                {g.label || `Jeu ${g.sequence}`}
              </Text>
              <Text variant="callout" numeric weight="600">
                {participants.map((p) => `${squadById.get(p.squad_id)?.label ?? '—'} ${p.score}`).join(' — ')}
              </Text>
            </View>
          );
        })}
      </Card>

      <Button label="Retour à l'entraînement" variant="secondary" block onPress={() => router.push(`/(tabs)/calendar/training/${trainingId}` as never)} />
    </Screen>
  );
}

function StandingsRows({ standings }: { standings: SquadStanding[] }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();

  return (
    <>
      {standings.map((sq) => (
        <View key={sq.squadId} style={s.cumulRow}>
          <View style={[s.dot, { backgroundColor: c.chartSeries[sq.colorIndex % c.chartSeries.length] }]} />
          <Text variant="callout" style={s.cumulLabel}>{sq.label}</Text>
          <Text variant="caption" tone="secondary">{sq.wins}V {sq.draws}N {sq.losses}D</Text>
          <Text variant="callout" weight="700" numeric tone={sq.diff > 0 ? 'positive' : sq.diff < 0 ? 'negative' : 'secondary'}>
            {sq.diff > 0 ? '+' : ''}{sq.diff}
          </Text>
        </View>
      ))}
    </>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg, paddingBottom: t.space.huge },
  section: { gap: t.space.sm },
  cumulRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cumulLabel: { flex: 1 },
  gameRow: { gap: 2, paddingVertical: t.space.xs },
  gameLabel: { opacity: 0.7 },
}));
