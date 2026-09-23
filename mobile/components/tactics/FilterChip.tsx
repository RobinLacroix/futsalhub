import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui';

/** Chip de filtre à sélection unique — même logique visuelle que `.lib-chip` de l'éditeur web (accent uni, pas de couleur par item). */
export function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.space.md,
          backgroundColor: active ? c.accent.subtle : c.bg.surface,
          borderColor: active ? c.accent.border : c.border.subtle,
        },
      ]}
    >
      <Text variant="callout" color={active ? c.accent.default : c.text.secondary} weight="600" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
