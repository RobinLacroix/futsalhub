/**
 * Button — action primitive (P0-2)
 *
 * Remplace les 834 `TouchableOpacity` stylés au cas par cas, avec leurs quatre
 * valeurs d'`activeOpacity` différentes (0.7 / 0.75 / 0.8 / 0.85) qui donnaient
 * quatre sensations de tap dans la même app.
 *
 * Hauteur minimale alignée sur la cible tactile HIG de 44 pt, y compris en
 * taille `sm`, où le padding compense.
 */

import React from 'react';
import { Pressable, View, ActivityIndicator, ViewStyle, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { Text, type TextTone } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Place l'icône après le libellé (flèche de progression, par exemple). */
  iconAfter?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Occupe toute la largeur disponible. */
  block?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconAfter = false,
  loading = false,
  disabled = false,
  block = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const inactive = disabled || loading;

  const height: Record<ButtonSize, number> = { sm: 36, md: 44, lg: 52 };
  const paddingH: Record<ButtonSize, number> = {
    sm: theme.space.md,
    md: theme.space.lg,
    lg: theme.space.xl,
  };
  const iconSize: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: c.accent.fill },
    secondary: {
      backgroundColor: c.bg.surface,
      borderWidth: 1,
      borderColor: c.border.strong,
    },
    ghost: { backgroundColor: 'transparent' },
    destructive: { backgroundColor: c.negative.fill },
  };

  const tone: Record<ButtonVariant, TextTone> = {
    primary: 'onFill',
    secondary: 'primary',
    ghost: 'accent',
    destructive: 'onFill',
  };

  const contentColor =
    variant === 'primary' || variant === 'destructive'
      ? c.text.onFill
      : variant === 'ghost'
        ? c.accent.default
        : c.text.primary;

  const iconNode = icon ? (
    <Ionicons name={icon} size={iconSize[size]} color={contentColor} />
  ) : null;

  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        haptics.tapLight();
        onPress();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={Math.max(0, Math.round((HIT_SLOP_MIN - height[size]) / 2))}
      style={({ pressed }) => [
        styles.base,
        {
          height: height[size],
          paddingHorizontal: paddingH[size],
          borderRadius: theme.radius.sm,
          gap: theme.space.sm,
          alignSelf: block ? 'stretch' : 'flex-start',
        },
        surface[variant],
        inactive ? { opacity: 0.45 } : null,
        pressed && !inactive ? { opacity: 0.82, transform: [{ scale: 0.98 }] } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        <>
          {!iconAfter && iconNode}
          <Text
            variant={size === 'sm' ? 'caption' : 'headline'}
            tone={tone[variant]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {iconAfter && iconNode}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
