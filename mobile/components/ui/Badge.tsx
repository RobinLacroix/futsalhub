/**
 * Badge — étiquette de statut (P0-2)
 *
 * Sert aux statuts (Convoqué, Blessé, Parti), aux résultats (V / N / D) et aux
 * compteurs inline. Les tons viennent de la rampe sémantique : un badge ne
 * choisit jamais sa teinte lui-même.
 */

import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Aplat plein plutôt que teinte discrète. Pour un statut qui doit trancher. */
  solid?: boolean;
  style?: ViewStyle;
}

export function Badge({
  label,
  tone = 'neutral',
  size = 'md',
  icon,
  solid = false,
  style,
}: BadgeProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const subtle: Record<BadgeTone, string> = {
    neutral: c.bg.sunken,
    accent: c.accent.subtle,
    positive: c.positive.subtle,
    negative: c.negative.subtle,
    warning: c.warning.subtle,
  };

  const strong: Record<BadgeTone, string> = {
    neutral: c.text.tertiary,
    accent: c.accent.fill,
    positive: c.positive.fill,
    negative: c.negative.fill,
    warning: c.warning.fill,
  };

  const fg: Record<BadgeTone, string> = {
    neutral: c.text.secondary,
    accent: c.accent.default,
    positive: c.positive.default,
    negative: c.negative.default,
    warning: c.warning.default,
  };

  const contentColor = solid ? c.text.onFill : fg[tone];

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: solid ? strong[tone] : subtle[tone],
          borderRadius: theme.radius.pill,
          paddingHorizontal: size === 'sm' ? theme.space.sm : theme.space.md,
          paddingVertical: size === 'sm' ? 2 : theme.space.xs,
          gap: theme.space.xs,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 11 : 13} color={contentColor} /> : null}
      <Text variant="caption" color={contentColor} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
});
