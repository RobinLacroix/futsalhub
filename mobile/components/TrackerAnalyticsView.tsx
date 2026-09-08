/**
 * Analyse → Matchs
 *
 * Liste des matchs suivis au recorder, avec accès direct pour ouvrir chacun
 * dans le tracker.
 *
 * ## Ce que cette version retire
 *
 * La table de stats joueurs triable et la vue « Moments du match »
 * vivaient ici en double : `AnalyticsView`, le segment « Joueurs » du même
 * onglet Analyse, affiche exactement les mêmes données (même source,
 * `analytics/aggregate.ts` + `MatchAnalyticsContext`), avec plus de colonnes
 * et sans le second jeu de filtres Lieu/Compétition à l'état indépendant du
 * premier — deux filtres pour la même notion, qui ne se synchronisaient pas
 * en changeant de segment. Ce segment ne garde que ce qu'aucun autre
 * n'affiche : la liste des matchs suivis et l'accès au recorder.
 */

import { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { useMatchAnalytics } from './analytics/MatchAnalyticsContext';
import { Screen, Text, Card, Button, EmptyState, SkeletonTable } from './ui';

export type TrackerAnalyticsViewProps = {
  title: string;
  showRecordButton?: boolean;
  showMatchList?: boolean;
};

export function TrackerAnalyticsView({
  title,
  showRecordButton = true,
  showMatchList = true,
}: TrackerAnalyticsViewProps) {
  const router = useRouter();
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, activeTeam } = useActiveTeam();
  const { matches, eventsByMatch, loading, refreshing, refresh } = useMatchAnalytics();

  const matchesWithEventCount = useMemo(
    () => matches.map((m) => ({ ...m, eventCount: (eventsByMatch[m.id] ?? []).length })),
    [matches, eventsByMatch]
  );

  // ── États non nominaux ────────────────────────────────────────────────────

  if (!activeTeamId || !activeTeam) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="bar-chart-outline"
          title="Aucune équipe sélectionnée"
          description="Choisissez une équipe pour accéder aux statistiques."
        />
      </Screen>
    );
  }

  if (loading && matches.length === 0) {
    return (
      <Screen>
        <SkeletonTable />
      </Screen>
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Text variant="title">{title}</Text>
      <Text variant="callout" tone="secondary" style={s.subtitle}>
        {activeTeam.name}
      </Text>

      {showRecordButton && (
        <Button
          label="Enregistrer un match"
          icon="videocam"
          onPress={() => router.push('/(tabs)/tracker/record')}
          block
          style={s.recordBtn}
        />
      )}

      {showMatchList && (
        <>
          <Text variant="title" style={s.sectionTitle}>
            Matchs suivis
          </Text>
          {matchesWithEventCount.length === 0 ? (
            <EmptyState
              icon="videocam-outline"
              title="Aucun match"
              description="Créez un match dans le Calendrier pour pouvoir le suivre en direct."
              compact
            />
          ) : (
            <View style={s.matchList}>
              {matchesWithEventCount.slice(0, 15).map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => router.push(`/(tabs)/tracker/record?matchId=${m.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.title || m.opponent_team || 'Match'}, ${m.score_team} à ${m.score_opponent}`}
                  style={({ pressed }) => [pressed && s.pressed]}
                >
                  <Card style={s.matchCard}>
                    <View style={s.flex}>
                      <Text variant="headline" numberOfLines={1}>
                        {m.title || m.opponent_team || 'Match'}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {m.competition} · {m.eventCount} événement{m.eventCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Text variant="headline" tone="accent" numeric style={s.matchScore}>
                      {m.score_team} - {m.score_opponent}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color={c.text.tertiary} />
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  subtitle: { marginTop: 2, marginBottom: t.space.xl },
  recordBtn: { marginBottom: t.space.xxl },
  sectionTitle: { marginBottom: t.space.md },

  matchList: { gap: t.space.sm, marginBottom: t.space.xxl },
  matchCard: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  matchScore: { marginRight: t.space.sm },
}));
