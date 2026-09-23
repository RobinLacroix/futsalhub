import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../../../contexts/ThemeContext';
import {
  getGamesForTraining,
  getSquadsForTraining,
  type TrainingGame,
  type TrainingSquad,
} from '../../../../../lib/services/trainingGames';
import { computeSquadStandings } from '../../../../../lib/liveSession/standings';
import { Screen, Card, Text, Button, EmptyState, SkeletonDetail } from '../../../../../components/ui';

export default function LiveRecapScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<TrainingGame[]>([]);
  const [squads, setSquads] = useState<TrainingSquad[]>([]);

  useEffect(() => {
    if (!trainingId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [g, sq] = await Promise.all([getGamesForTraining(trainingId), getSquadsForTraining(trainingId)]);
        setGames(g);
        setSquads(sq);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur');
      } finally {
        setLoading(false);
      }
    })();
  }, [trainingId]);

  const squadById = useMemo(() => new Map(squads.map((sq) => [sq.id, sq])), [squads]);

  const standings = useMemo(() => computeSquadStandings(squads, games), [squads, games]);

  const finishedGames = useMemo(() => games.filter((g) => g.ended_at), [games]);

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
      </Card>

      <Card variant="raised" padding="md" style={s.section}>
        <Text variant="headline">Jeux joués</Text>
        {finishedGames.map((g) => {
          const home = squadById.get(g.home_squad_id);
          const away = squadById.get(g.away_squad_id);
          return (
            <View key={g.id} style={s.gameRow}>
              <Text variant="callout" style={s.gameLabel} numberOfLines={1}>
                {g.label || `Jeu ${g.sequence}`}
              </Text>
              <Text variant="callout" numeric weight="600">
                {home?.label ?? '—'} {g.score_home} — {g.score_away} {away?.label ?? '—'}
              </Text>
            </View>
          );
        })}
      </Card>

      <Button label="Retour à l'entraînement" variant="secondary" block onPress={() => router.push(`/(tabs)/calendar/training/${trainingId}` as never)} />
    </Screen>
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
