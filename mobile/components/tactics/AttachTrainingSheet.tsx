import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, Text, Card, Input, EmptyState } from '../ui';
import type { Training } from '../../types';

export interface AttachTrainingSheetProps {
  visible: boolean;
  trainings: Training[];
  teamNameById: Map<string, string>;
  onSelect: (trainingId: string) => void;
  onClose: () => void;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Rattache la séance à un entraînement existant, toutes équipes du club confondues — n'affiche que les entraînements pas encore rattachés à une autre séance. */
export function AttachTrainingSheet({ visible, trainings, teamNameById, onSelect, onClose }: AttachTrainingSheetProps) {
  const { theme } = useTheme();
  const [search, setSearch] = useState('');

  const available = useMemo(() => trainings.filter((t) => !t.session_id), [trainings]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (t) =>
        (t.theme || '').toLowerCase().includes(q) ||
        (teamNameById.get(t.team_id || '') || '').toLowerCase().includes(q) ||
        formatDate(t.date).toLowerCase().includes(q),
    );
  }, [available, search, teamNameById]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Rattacher à un entraînement" maxHeight="80%">
      <Input
        label="Rechercher"
        value={search}
        onChangeText={setSearch}
        placeholder="Date, thème, équipe…"
        containerStyle={{ marginBottom: theme.space.md }}
      />
      {filtered.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Aucun entraînement disponible"
          description={
            available.length === 0
              ? 'Tous les entraînements ont déjà une séance rattachée.'
              : 'Aucun entraînement ne correspond à cette recherche.'
          }
          compact
        />
      ) : (
        <View style={{ gap: theme.space.sm }}>
          {filtered.map((t) => (
            <Card
              key={t.id}
              variant="flat"
              padding="md"
              onPress={() => {
                onSelect(t.id);
                onClose();
              }}
              accessibilityLabel={formatDate(t.date)}
              style={{ gap: theme.space.xs }}
            >
              <Text variant="headline" numberOfLines={1}>{formatDate(t.date)}</Text>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {teamNameById.get(t.team_id || '') || 'Équipe inconnue'}{t.theme ? ` · ${t.theme}` : ''}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </Sheet>
  );
}
