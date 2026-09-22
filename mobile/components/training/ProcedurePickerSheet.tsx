import { View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, Card, Text, Badge, EmptyState } from '../ui';
import type { TrainingProcedureRecord } from '../../lib/services/trainingProceduresService';

/**
 * Choix d'un procédé (fiche pédagogique) pour un bloc de séance. Liste plate
 * des `training_procedures` du club — pas les schémas (cf correction dans
 * PLAN_SEANCE_BIBLIOTHEQUE_MOBILE_2026-09.md : un bloc référence un procédé,
 * pas directement un schéma, même comportement que seance.js côté web).
 */
export function ProcedurePickerSheet({
  visible,
  onClose,
  procedures,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  procedures: TrainingProcedureRecord[];
  onSelect: (procedureId: string) => void;
}) {
  const { theme } = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose} title="Choisir un procédé" maxHeight="80%">
      {procedures.length === 0 ? (
        <EmptyState icon="document-text-outline" title="Aucun procédé" description="Crée des fiches procédure sur le site FutsalHub." compact />
      ) : (
        <View style={{ gap: theme.space.sm }}>
          {procedures.map((p) => (
            <Card
              key={p.id}
              variant="flat"
              padding="md"
              onPress={() => {
                onSelect(p.id);
                onClose();
              }}
              accessibilityLabel={p.title || 'Sans titre'}
              style={{ gap: theme.space.xs }}
            >
              <Text variant="headline" numberOfLines={1}>
                {p.title || 'Sans titre'}
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.space.xs }}>
                <Badge label={p.type} tone="neutral" size="sm" />
                <Badge label={p.theme} tone="neutral" size="sm" />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Sheet>
  );
}
