import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { Screen, Text, Button, EmptyState, Input } from '../../../components/ui';
import { FilterChip } from '../../../components/tactics/FilterChip';
import { SessionCard } from '../../../components/tactics/SessionCard';
import {
  getSessionsByClub,
  deleteSession,
  type TrainingSessionRecord,
  type LearningPhase,
} from '../../../lib/services/sessionsService';
import { getTrainingsByTeamIds } from '../../../lib/services/trainings';
import { getTeamsByClubId } from '../../../lib/services/teams';
import type { Training } from '../../../types';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const PHASE_FILTERS: { value: LearningPhase | ''; label: string }[] = [
  { value: '', label: 'Toutes' },
  { value: 'Phase 1', label: 'Phase 1' },
  { value: 'Phase 2', label: 'Phase 2' },
  { value: 'Mix', label: 'Mix' },
];

/** Liste des séances du club (portée club, pas équipe — cf sessionsService.ts). */
export default function SessionsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const s = useStyles();
  const { activeTeam } = useActiveTeam();

  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [teamNameById, setTeamNameById] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<LearningPhase | ''>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const clubId = activeTeam?.club_id;
    if (!clubId) return;
    setLoading(true);
    try {
      const teams = await getTeamsByClubId(clubId);
      setTeamNameById(new Map(teams.map((t) => [t.id, t.name])));
      const [sess, trs] = await Promise.all([getSessionsByClub(clubId), getTrainingsByTeamIds(teams.map((t) => t.id))]);
      setSessions(sess);
      setTrainings(trs);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement des séances impossible');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.club_id]);

  useEffect(() => {
    load();
  }, [load]);

  const trainingsBySessionId = useMemo(() => {
    const map = new Map<string, Training[]>();
    for (const t of trainings) {
      if (!t.session_id) continue;
      const list = map.get(t.session_id) || [];
      list.push(t);
      map.set(t.session_id, list);
    }
    return map;
  }, [trainings]);

  const visibleSessions = useMemo(() => {
    let list = sessions;
    if (phaseFilter) list = list.filter((se) => se.meta?.phase === phaseFilter);
    const q = norm(search);
    if (q) {
      list = list.filter(
        (se) =>
          norm(se.name || '').includes(q) ||
          norm(se.meta?.principe || '').includes(q) ||
          norm(se.meta?.moyen || '').includes(q) ||
          norm(se.meta?.theme || '').includes(q),
      );
    }
    return list;
  }, [sessions, search, phaseFilter]);

  const handleDelete = useCallback(
    (id: string, name: string) => {
      Alert.alert('Supprimer la séance ?', `« ${name || 'sans titre'} » sera supprimée définitivement.`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSession(id);
              await load();
            } catch (err) {
              Alert.alert('Erreur', err instanceof Error ? err.message : 'Échec de la suppression.');
            }
          },
        },
      ]);
    },
    [load],
  );

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

      <Input label="Rechercher" value={search} onChangeText={setSearch} placeholder="Nom, principe, moyen, thème…" containerStyle={s.searchField} />

      <View style={s.filterRow}>
        {PHASE_FILTERS.map((f) => (
          <FilterChip key={f.value} active={phaseFilter === f.value} label={f.label} onPress={() => setPhaseFilter(f.value)} />
        ))}
      </View>

      {visibleSessions.length === 0 ? (
        <EmptyState
          icon="list-outline"
          title={sessions.length === 0 ? 'Aucune séance' : 'Aucun résultat'}
          description={
            sessions.length === 0
              ? 'Assemble ta première séance à partir des procédés du club.'
              : 'Essaie un autre mot-clé ou une autre phase.'
          }
        />
      ) : (
        <View style={s.list}>
          {visibleSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              attachedTrainings={trainingsBySessionId.get(session.id) || []}
              teamNameById={teamNameById}
              onOpen={() => router.push(`/(tabs)/sessions/${session.id}` as never)}
              onDelete={() => handleDelete(session.id, session.name)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  newBtn: { marginBottom: t.space.lg },
  searchField: { marginBottom: t.space.md },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.lg },
  list: { gap: t.space.md },
}));
