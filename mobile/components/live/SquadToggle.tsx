import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { readableOn } from '../../lib/liveSession/levels';
import { Text } from '../ui';

/** Interrupteur d'une équipe : aplat de sa couleur + coche quand elle est sélectionnée (jamais la couleur seule). */
export function SquadToggle({
  label,
  color,
  on,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  color: string;
  on: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const fg = on ? readableOn(color) : c.text.secondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.xs,
        minHeight: 44,
        paddingHorizontal: theme.space.md,
        borderRadius: theme.radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: on ? color : c.bg.surface,
        borderColor: on ? color : c.border.strong,
      }}
    >
      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={on ? fg : c.text.tertiary} />
      <Text variant="callout" weight="600" color={fg} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
