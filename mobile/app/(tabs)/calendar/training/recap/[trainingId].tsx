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

  const cumulBySquad = useMemo(() => {
    const map = new Map<string, { label: string; colorIndex: number; points: number; wins: number; draws: number; losses: number }>();
    for (const sq of squads) map.set(sq.id, { label: sq.label, colorIndex: Number(sq.color_token) || 0, points: 0, wins: 0, draws: 0, losses: 0 });
    for (const g of games) {
      if (!g.ended_at) continue;
      const home = map.get(g.home_squad_id);
      const away = map.get(g.away_squad_id);
      if (home) home.points += g.score_home;
      if (away) away.points += g.score_away;
      if (g.score_home === g.score_away) {
        if (home) home.draws += 1;
        if (away) away.draws += 1;
      } else if (g.score_home > g.score_away) {
        if (home) home.wins += 1;
        if (away) away.losses += 1;
      } else {
        if (away) away.wins += 1;
        if (home) home.losses += 1;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.wins - a.wins || b.points - a.points);
  }, [squads, games]);

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
        {cumulBySquad.map((sq) => (
          <View key={sq.label} style={s.cumulRow}>
            <View style={[s.dot, { backgroundColor: c.chartSeries[sq.colorIndex % c.chartSeries.length] }]} />
            <Text variant="callout" style={s.cumulLabel}>{sq.label}</Text>
            <Text variant="caption" tone="secondary">{sq.wins}V {sq.draws}N {sq.losses}D</Text>
            <Text variant="callout" weight="700" numeric>{sq.points}</Text>
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
