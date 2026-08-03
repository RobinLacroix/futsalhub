/**
 * Card — surface de contenu (P0-2)
 *
 * Remplace les 8 variantes de carte constatées dans le seul `app/(tabs)/index.tsx`
 * (activeTeamCard, noClubCard, joinClubCard, linkPlayerCard, noTeamCard,
 * featureCard, accountCard, modalTeamRow), qui différaient par le rayon, le
 * padding, l'ombre et la bordure.
 *
 * La profondeur vient du thème : ombre portée en clair, valeur de fond plus
 * claire et liseré en sombre (une ombre est invisible sur un canvas anthracite).
 */

import React from 'react';
import { View, ViewProps, Pressable, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';

export type CardVariant = 'flat' | 'raised' | 'floating' | 'accent';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Rend la carte tactile, avec état pressé et retour haptique. */
  onPress?: () => void;
  /** Obligatoire dès que la carte est tactile et sans texte explicite. */
  accessibilityLabel?: string;
}

export function Card({
  variant = 'raised',
  padding = 'md',
  onPress,
  style,
  children,
  ...rest
}: CardProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const paddingValue: Record<CardPadding, number> = {
    none: 0,
    sm: theme.space.md,
    md: theme.space.lg,
    lg: theme.space.xl,
  };

  const base: ViewStyle = {
    borderRadius: theme.radius.md,
    padding: paddingValue[padding],
  };

  const byVariant: Record<CardVariant, ViewStyle> = {
    flat: { ...theme.elevation.flat, backgroundColor: c.bg.surface },
    raised: { ...theme.elevation.raised, backgroundColor: c.bg.surface },
    floating: { ...theme.elevation.floating },
    accent: {
      backgroundColor: c.accent.subtle,
      borderWidth: 1,
      borderColor: c.accent.border,
    },
  };

  const composed = [base, byVariant[variant], style];

  if (!onPress) {
    return (
      <View {...rest} style={composed}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      onPress={() => {
        haptics.tapLight();
        onPress();
      }}
      style={({ pressed }) => [
        ...composed,
        pressed ? { opacity: 0.86, transform: [{ scale: 0.985 }] } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}
