import { View, Pressable } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, Text } from '../ui';
import { BLOCK_TYPES } from '../../lib/tactics/sessionBlocks';
import type { SessionBlockType } from '../../lib/services/sessionsService';

/** Choix du type de bloc à ajouter — 6 types, aucun verrouillé ni unique (trame librement modifiable). */
export function AddBlockSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (type: SessionBlockType) => void;
}) {
  const { theme } = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose} title="Ajouter un bloc" maxHeight="60%">
      <View style={{ gap: theme.space.sm }}>
        {BLOCK_TYPES.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => {
              onAdd(t.value);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.sm,
              minHeight: 48,
              borderRadius: theme.radius.sm,
              paddingHorizontal: theme.space.md,
              backgroundColor: theme.colors.bg.surface,
              borderWidth: 1,
              borderColor: theme.colors.border.subtle,
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.color }} />
            <Text variant="headline">{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
