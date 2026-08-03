/**
 * IconButton — action sans libellé visible (P0-2)
 *
 * `label` est **obligatoire au niveau du type**. C'est délibéré : l'audit a
 * relevé zéro `accessibilityLabel` sur 834 zones tactiles. Rendre l'étiquette
 * obligatoire dans la signature règle le problème structurellement plutôt que
 * par la discipline, qui ne tient pas sur 25 000 lignes en solo.
 *
 * Le `hitSlop` comble automatiquement l'écart avec la cible tactile de 44 pt.
 */

import React from 'react';
import { Pressable, View, ViewStyle, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { Text } from './Text';

export type IconButtonVariant = 'plain' | 'surface' | 'accent' | 'destructive';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** Annoncé par VoiceOver. Obligatoire, sans exception. */
  label: string;
  onPress: () => void;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  /** Pastille de compteur, positionnée en haut à droite. */
  badge?: number;
  style?: ViewStyle;
}

export function IconButton({
  icon,
  label,
  onPress,
  variant = 'plain',
  size = 'md',
  disabled = false,
  badge,
  style,
}: IconButtonProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const box: Record<IconButtonSize, number> = { sm: 28, md: 36, lg: 44 };
  const glyph: Record<IconButtonSize, number> = { sm: 16, md: 20, lg: 24 };

  const surface: Record<IconButtonVariant, ViewStyle> = {
    plain: { backgroundColor: 'transparent' },
    surface: { backgroundColor: c.bg.sunken },
    accent: { backgroundColor: c.accent.subtle },
    destructive: { backgroundColor: c.negative.subtle },
  };

  const glyphColor: Record<IconButtonVariant, string> = {
    plain: c.text.secondary,
    surface: c.text.secondary,
    accent: c.accent.default,
    destructive: c.negative.default,
  };

  const pad = Math.max(0, Math.round((HIT_SLOP_MIN - box[size]) / 2));

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.tapLight();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={{ top: pad, bottom: pad, left: pad, right: pad }}
      style={({ pressed }) => [
        styles.base,
        {
          width: box[size],
          height: box[size],
          borderRadius: theme.radius.sm,
        },
        surface[variant],
        disabled ? { opacity: 0.4 } : null,
        pressed && !disabled ? { opacity: 0.7 } : null,
        style,
      ]}
    >
      <Ionicons name={icon} size={glyph[size]} color={glyphColor[variant]} />
      {badge != null && badge > 0 && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: c.negative.fill,
              borderRadius: theme.radius.pill,
              borderColor: c.bg.canvas,
            },
          ]}
        >
          <Text variant="caption" tone="onFill" numeric style={styles.badgeText}>
            {badge > 99 ? '99+' : String(badge)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 14,
  },
});
