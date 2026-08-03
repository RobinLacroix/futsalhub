/**
 * EmptyState — absence de contenu (P0-2)
 *
 * Un écran vide est un moment d'onboarding, pas une erreur. Il doit dire ce qui
 * manque et proposer l'action qui le remplit.
 *
 * Sert aussi d'état d'erreur récupérable (`tone="negative"` + action « Réessayer »),
 * pour sortir des `Alert.alert` bloquantes relevées à l'audit (110 occurrences).
 */

import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
  /** Action secondaire discrète sous l'action principale. */
  secondaryAction?: { label: string; onPress: () => void };
  tone?: 'neutral' | 'negative';
  /** Version resserrée, pour un emplacement contraint (carte, colonne). */
  compact?: boolean;
  style?: ViewStyle;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  tone = 'neutral',
  compact = false,
  style,
}: EmptyStateProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const bubbleBg = tone === 'negative' ? c.negative.subtle : c.bg.sunken;
  const glyphColor = tone === 'negative' ? c.negative.default : c.text.tertiary;
  const bubble = compact ? 44 : 64;

  return (
    <View
      style={[
        styles.base,
        {
          paddingVertical: compact ? theme.space.xl : theme.space.giant,
          paddingHorizontal: theme.space.xl,
          gap: theme.space.md,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            width: bubble,
            height: bubble,
            borderRadius: bubble / 2,
            backgroundColor: bubbleBg,
          },
        ]}
      >
        <Ionicons name={icon} size={compact ? 22 : 30} color={glyphColor} />
      </View>

      <View style={[styles.text, { gap: theme.space.xs }]}>
        <Text variant={compact ? 'headline' : 'title'} style={styles.centered}>
          {title}
        </Text>
        {description ? (
          <Text variant="callout" tone="tertiary" style={styles.centered}>
            {description}
          </Text>
        ) : null}
      </View>

      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant={tone === 'negative' ? 'secondary' : 'primary'}
          size={compact ? 'sm' : 'md'}
        />
      ) : null}

      {secondaryAction ? (
        <Button
          label={secondaryAction.label}
          onPress={secondaryAction.onPress}
          variant="ghost"
          size="sm"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    alignItems: 'center',
  },
  centered: {
    textAlign: 'center',
  },
});
