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
import { useTheme } from '../../contexts/ThemeContext';
import {
  getTrainingFeedbackResponses,
  getMatchFeedbackResponses,
  type TrainingFeedbackResponse,
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

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    const fetcher = matchId ? getMatchFeedbackResponses(matchId) : getTrainingFeedbackResponses(trainingId!);
    fetcher
      .then(setResponses)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
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
});
