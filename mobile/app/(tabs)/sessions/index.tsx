import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { Screen, Text, Card, Button, EmptyState } from '../../../components/ui';
import { getSessionsByClub, type TrainingSessionRecord } from '../../../lib/services/sessionsService';

/** Liste des séances du club (portée club, pas équipe — cf sessionsService.ts). */
export default function SessionsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const s = useStyles();
  const { activeTeam } = useActiveTeam();

  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeTeam?.club_id) return;
    setLoading(true);
    try {
      setSessions(await getSessionsByClub(activeTeam.club_id));
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement des séances impossible');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.club_id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.accent.default} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <Button label="Nouvelle séance" icon="add" onPress={() => router.push('/(tabs)/sessions/new' as never)} block style={s.newBtn} />

      {sessions.length === 0 ? (
        <EmptyState icon="list-outline" title="Aucune séance" description="Assemble ta première séance à partir des procédés du club." />
      ) : (
        <View style={s.list}>
          {sessions.map((session) => (
            <Card
              key={session.id}
              variant="raised"
              padding="md"
              onPress={() => router.push(`/(tabs)/sessions/${session.id}` as never)}
              accessibilityLabel={session.name || 'Sans titre'}
              style={s.card}
            >
              <Text variant="headline" numberOfLines={1}>
                {session.name || 'Sans titre'}
              </Text>
              <Text variant="caption" tone="tertiary">
                {session.blocks?.length ?? 0} bloc{(session.blocks?.length ?? 0) > 1 ? 's' : ''}
                {session.meta?.dureeTotaleMin ? ` · ${session.meta.dureeTotaleMin} min` : ''}
                {session.meta?.theme ? ` · ${session.meta.theme}` : ''}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  newBtn: { marginBottom: t.space.lg },
  list: { gap: t.space.sm },
  card: { gap: t.space.xs },
}));
