/**
 * Réponses au questionnaire d'une séance — vue staff.
 *
 * N'existait nulle part : une fois « Envoyer les questionnaires » cliqué, il n'y avait
 * aucun moyen de voir les réponses depuis la fiche séance (seulement l'historique
 * individuel d'un joueur, ou son propre historique). Inclut les joueurs invités d'une
 * autre équipe (badge « Invité·e »), déjà couverts par la RPC sans garde supplémentaire.
 */

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getTrainingFeedbackResponses,
  getMatchFeedbackResponses,
  getMatchMvpVotes,
  type TrainingFeedbackResponse,
  type MatchMvpRanking,
} from '../../lib/services/feedback';
import { Sheet, Text, Card, Badge, EmptyState } from '../ui';

export interface TrainingFeedbackResponsesSheetProps {
  visible: boolean;
  onClose: () => void;
  /** L'un des deux, jamais les deux — séance ou match. */
  trainingId?: string;
  matchId?: string;
}

const SCORES: { key: keyof TrainingFeedbackResponse; label: string }[] = [
  { key: 'auto_evaluation', label: 'Auto-éval' },
  { key: 'rpe', label: 'RPE' },
  { key: 'physical_form', label: 'Forme' },
  { key: 'pleasure', label: 'Plaisir' },
];

export function TrainingFeedbackResponsesSheet({ visible, onClose, trainingId, matchId }: TrainingFeedbackResponsesSheetProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [loading, setLoading] = useState(false);
  const [responses, setResponses] = useState<TrainingFeedbackResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mvpRanking, setMvpRanking] = useState<MatchMvpRanking | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    const fetcher = matchId ? getMatchFeedbackResponses(matchId) : getTrainingFeedbackResponses(trainingId!);
    fetcher
      .then(setResponses)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));

    if (matchId) {
      getMatchMvpVotes(matchId)
        .then(setMvpRanking)
        .catch(() => setMvpRanking(null));
    } else {
      setMvpRanking(null);
    }
  }, [visible, trainingId, matchId]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Réponses au questionnaire" maxHeight="85%">
      <View style={{ gap: theme.space.md }}>
        {loading && (
          <Text variant="callout" tone="secondary">
            Chargement…
          </Text>
        )}
        {!loading && error && (
          <Text variant="callout" color={c.negative.default}>
            {error}
          </Text>
        )}
        {!loading && !error && responses.length === 0 && (
          <EmptyState
            icon="document-text-outline"
            title="Aucune réponse pour l'instant"
            description="Les joueurs n'ont pas encore rempli le questionnaire."
            compact
          />
        )}
        {!loading && mvpRanking && mvpRanking.ranking.length > 0 && (
          <Card variant="flat" padding="md" style={{ gap: theme.space.sm }}>
            <View style={styles.header}>
              <Ionicons name="trophy-outline" size={16} color={c.text.secondary} />
              <Text variant="headline" style={styles.flex}>
                Classement MVP
              </Text>
            </View>
            <Text variant="caption" tone="secondary">
              {mvpRanking.isComplete
                ? `Vote terminé — ${mvpRanking.votedCount}/${mvpRanking.totalVoters} réponses.`
                : `Vote en cours — ${mvpRanking.votedCount}/${mvpRanking.totalVoters} réponses.`}
            </Text>
            {mvpRanking.ranking.map((row) => {
              const isTop = mvpRanking.isComplete && mvpRanking.mvpPlayerIds.includes(row.player_id);
              return (
                <View key={row.player_id} style={styles.mvpRow}>
                  {isTop && <Ionicons name="trophy" size={14} color={c.warning.default} />}
                  <Text variant="body" weight="600" style={styles.flex} numberOfLines={1}>
                    {row.player_name}
                  </Text>
                  <Text variant="body" numeric tone="secondary">
                    {row.votes} vx
                  </Text>
                </View>
              );
            })}
          </Card>
        )}
        {!loading &&
          !error &&
          responses.map((r) => (
            <Card key={r.player_id} variant="flat" padding="md" style={{ gap: theme.space.sm }}>
              <View style={styles.header}>
                <Text variant="body" weight="600" style={styles.flex} numberOfLines={1}>
                  {r.player_name}
                </Text>
                {r.is_guest && <Badge label={r.team_name ? `Invité·e · ${r.team_name}` : 'Invité·e'} size="sm" />}
              </View>
              <View style={styles.scoresRow}>
                {SCORES.map(({ key, label }) => (
                  <View key={key} style={styles.scoreItem}>
                    <Text variant="title" numeric weight="700">
                      {(r[key] as number | null) ?? '—'}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
              {r.comment && (
                <Text variant="callout" tone="secondary" style={styles.comment}>
                  « {r.comment} »
                </Text>
              )}
            </Card>
          ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoresRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreItem: { alignItems: 'center', flex: 1 },
  comment: { fontStyle: 'italic' },
  mvpRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
