import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Card, Text, IconButton } from '../ui';
import { SessionTimeline } from './SessionTimeline';
import type { TrainingSessionRecord } from '../../lib/services/sessionsService';
import type { Training } from '../../types';

export interface SessionCardProps {
  session: TrainingSessionRecord;
  attachedTrainings: Training[];
  teamNameById: Map<string, string>;
  onOpen: () => void;
  onDelete: () => void;
}

function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/** Carte de la liste des séances — timeline miniature + statut de rattachement. */
export function SessionCard({ session, attachedTrainings, teamNameById, onOpen, onDelete }: SessionCardProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();

  return (
    <Card variant="raised" padding="md" onPress={onOpen} accessibilityLabel={session.name || 'Sans titre'} style={s.card}>
      <View style={s.headerRow}>
        <View style={s.headerText}>
          <Text variant="headline" numberOfLines={1}>{session.name || 'Sans titre'}</Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {session.meta?.principe || session.meta?.theme || 'Aucun principe précisé'}
          </Text>
        </View>
        <IconButton icon="trash-outline" label="Supprimer la séance" variant="destructive" size="sm" onPress={onDelete} />
      </View>

      <SessionTimeline blocks={session.blocks} />

      {attachedTrainings.length > 0 && (
        <View style={s.attachRow}>
          {attachedTrainings.map((t) => (
            <View key={t.id} style={[s.attachChip, { backgroundColor: c.accent.subtle, borderColor: c.accent.border }]}>
              <Ionicons name="calendar-outline" size={12} color={c.accent.default} />
              <Text variant="caption" tone="accent" numberOfLines={1}>
                {formatShortDate(t.date)} · {teamNameById.get(t.team_id || '') || '—'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  headerText: { flex: 1, gap: 2 },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: t.space.sm,
    paddingVertical: 3,
    borderRadius: t.radius.pill,
    borderWidth: 1,
  },
}));
