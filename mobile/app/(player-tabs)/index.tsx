/**
 * Calendrier du joueur — convocations et matchs à venir (P1-7)
 *
 * ## Ce qui change
 *
 * **Le bouton « Voir le diagnostic » disparaît.** Il s'affichait aux joueurs
 * quand la liste était vide et ouvrait une alerte technique : `Joueur: oui`,
 * `Équipes: 0`, `Séances à venir: 0`. C'est un outil de mise au point, pas une
 * information pour un joueur — et il expose la structure interne du compte à
 * quelqu'un qui n'a rien à en faire. Les trois cas de vide ont déjà un message
 * qui dit quoi faire (« demande à ton coach de… »), ce qui est la seule chose
 * utile.
 *
 * **Les boutons de présence passent de 30 à 44 pt** et réutilisent
 * `AttendancePicker`, le catalogue déjà employé côté staff. C'était la
 * cinquième table de statuts du dépôt, avec ses propres couleurs.
 *
 * **La réponse tardive est expliquée avant, pas après.** Le refus « il est
 * trop tard pour répondre » n'arrivait qu'après avoir touché un bouton. La
 * carte le dit d'emblée et grise les boutons.
 *
 * **Le vouvoiement est corrigé.** Deux messages d'état vouvoyaient
 * (« Vous n'êtes dans aucune équipe ») alors que tout le reste de l'espace
 * joueur tutoie. C'est le même joueur dans les deux phrases.
 */

import { useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { View, FlatList, RefreshControl, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Text, EmptyState, Button } from '../../components/ui';
import { SkeletonList } from '../../components/ui/Skeleton';
import { AttendancePicker } from '../../components/training/AttendancePicker';
import { PlayerEventCard } from '../../components/player/PlayerEventCard';
import {
  getMyCalendarEvents,
  getMyConvocationsStatus,
  setMyTrainingAttendance,
  type MyConvolutionRow,
  type MyUpcomingMatchRow,
} from '../../lib/services/playerConvocations';
import type { PlayerStatus } from '../../types';

/** Délai avant la séance au-delà duquel la réponse est refusée côté RPC. */
const ANSWER_CUTOFF_MS = 2 * 60 * 60 * 1000;

type CalendarItem =
  | { type: 'training'; data: MyConvolutionRow }
  | { type: 'match'; data: MyUpcomingMatchRow };

const itemDate = (i: CalendarItem) =>
  i.type === 'training' ? i.data.training_date : i.data.match_date;

export default function PlayerConvocationsScreen() {
  const s = useStyles();
  const router = useRouter();
  const { theme } = useTheme();

  const [convocations, setConvocations] = useState<MyConvolutionRow[]>([]);
  const [matches, setMatches] = useState<MyUpcomingMatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptyHint, setEmptyHint] = useState<'no_player' | 'no_team' | 'no_upcoming' | null>(null);

  const items = useMemo(
    () =>
      [
        ...convocations.map((c) => ({ type: 'training' as const, data: c })),
        ...matches.map((m) => ({ type: 'match' as const, data: m })),
      ].sort((a, b) => new Date(itemDate(a)).getTime() - new Date(itemDate(b)).getTime()),
    [convocations, matches]
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      setEmptyHint(null);
      const { trainings, matches: matchesData } = await getMyCalendarEvents();
      setConvocations(trainings);
      setMatches(matchesData);
      if (trainings.length === 0 && matchesData.length === 0) {
        try {
          const status = await getMyConvocationsStatus();
          if (status && status.hint !== 'ok') setEmptyHint(status.hint);
        } catch {
          // Diagnostic seulement : son échec ne doit pas masquer la liste vide.
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
      setConvocations([]);
      setMatches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleSetAttendance = useCallback(async (trainingId: string, status: PlayerStatus) => {
    setUpdatingId(trainingId);
    setError(null);
    const result = await setMyTrainingAttendance(trainingId, status);
    setUpdatingId(null);
    if (result.ok) {
      setConvocations((prev) =>
        prev.map((c) => (c.training_id === trainingId ? { ...c, my_status: status } : c))
      );
      return;
    }
    setError(
      result.error === 'too_late'
        ? 'Trop tard pour répondre : les réponses ferment 2 h avant la séance.'
        : (result.error ?? 'Erreur')
    );
  }, []);

  /**
   * Le questionnaire se remplit DANS l'application, onglet « Questionnaires ».
   *
   * Ce bouton ouvrait `feedback_url` dans le navigateur — l'ancien parcours web,
   * antérieur au formulaire natif. Deux conséquences : le joueur sortait de
   * l'app pour une action qu'elle sait faire, et **il perdait la déclaration de
   * douleur**, qui n'existe que dans le formulaire natif (`BodyMap` +
   * `report_pain_by_token`). Le suivi santé dépend de ce geste.
   */
  const openQuestionnaire = useCallback(
    (token: string) => {
      router.push({ pathname: '/(player-tabs)/questionnaires', params: { token } });
    },
    [router]
  );

  if (loading && items.length === 0) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonList rows={3} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {error && (
        <View style={s.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={theme.colors.negative.default} />
          <Text variant="caption" color={theme.colors.negative.default} style={s.flex}>
            {error}
          </Text>
          <Pressable
            onPress={() => {
              setLoading(true);
              load();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Réessayer le chargement"
          >
            <Text variant="caption" weight="700" color={theme.colors.negative.default}>
              Réessayer
            </Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(i) =>
          i.type === 'training' ? `t-${i.data.training_id}` : `m-${i.data.match_id}`
        }
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.positive.default}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={emptyHint === 'no_player' || emptyHint === 'no_team' ? 'link-outline' : 'calendar-outline'}
            title={
              emptyHint === 'no_player'
                ? 'Ton compte n’est pas relié à ta fiche'
                : emptyHint === 'no_team'
                  ? 'Tu n’es dans aucune équipe'
                  : 'Aucune convocation à venir'
            }
            description={
              emptyHint === 'no_player'
                ? 'Demande à ton coach de relier ton compte à ta fiche joueur.'
                : emptyHint === 'no_team'
                  ? 'Demande à ton coach de t’ajouter à une équipe.'
                  : 'Tes séances et tes matchs apparaîtront ici dès que le staff les publie.'
            }
          />
        }
        renderItem={({ item }) =>
          item.type === 'match' ? (
            <PlayerEventCard
              kind="match"
              title={item.data.title || 'Match'}
              date={item.data.match_date}
              competition={item.data.competition}
              opponent={item.data.opponent_team}
              teamName={item.data.team_name}
              location={item.data.location}
              otherTeam={!!item.data.is_other_team}
            />
          ) : (
            <TrainingItem
              c={item.data}
              updating={updatingId === item.data.training_id}
              onSetAttendance={handleSetAttendance}
              onOpenQuestionnaire={openQuestionnaire}
            />
          )
        }
        ItemSeparatorComponent={() => <View style={s.separator} />}
      />
    </View>
  );
}

function TrainingItem({
  c,
  updating,
  onSetAttendance,
  onOpenQuestionnaire,
}: {
  c: MyConvolutionRow;
  updating: boolean;
  onSetAttendance: (id: string, s: PlayerStatus) => void;
  onOpenQuestionnaire: (token: string) => void;
}) {
  const s = useStyles();
  const { theme } = useTheme();

  const other = !!c.is_other_team;
  // La RPC refuse la réponse à moins de 2 h. Le dire avant évite un aller-retour
  // qui se soldait par un message d'erreur rouge en haut de l'écran.
  const closed = c.training_date
    ? new Date(c.training_date).getTime() - Date.now() < ANSWER_CUTOFF_MS
    : false;

  return (
    <PlayerEventCard
      kind="training"
      date={c.training_date}
      teamName={c.team_name}
      location={c.location}
      otherTeam={other}
    >
      <View style={s.divider} />

      <View style={s.attendHead}>
        <Text variant="caption" tone="secondary" weight="700">
          Ma présence
        </Text>
        {closed && (
          <Text variant="caption" tone="tertiary">
            Réponses closes
          </Text>
        )}
      </View>

      {closed ? (
        <Text variant="callout" tone="tertiary">
          {c.my_status
            ? `Tu avais répondu : ${statusLabel(c.my_status as PlayerStatus)}.`
            : 'Les réponses ferment 2 h avant la séance.'}
        </Text>
      ) : (
        <AttendancePicker
          value={(c.my_status as PlayerStatus) ?? null}
          onChange={(status) => onSetAttendance(c.training_id, status)}
          playerName="Ma présence"
          loading={updating}
          fullLabels
        />
      )}

      {c.feedback_token && !other && (
        <>
          <View style={s.divider} />
          <Button
            label="Remplir le questionnaire"
            onPress={() => onOpenQuestionnaire(c.feedback_token!)}
            variant="secondary"
            icon="document-text-outline"
            block
          />
        </>
      )}
      <View style={{ height: theme.space.xs }} />
    </PlayerEventCard>
  );
}

const statusLabel = (s: PlayerStatus) =>
  s === 'present' ? 'présent' : s === 'absent' ? 'absent' : s === 'late' ? 'en retard' : 'blessé';

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  loadingWrap: { flex: 1, padding: t.space.lg, backgroundColor: t.colors.bg.canvas },
  list: { padding: t.space.lg, paddingBottom: t.space.huge },
  separator: { height: t.space.md },
  divider: { height: 1, backgroundColor: t.colors.border.subtle },
  attendHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
    backgroundColor: t.colors.negative.subtle,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.negative.default,
  },
}));
