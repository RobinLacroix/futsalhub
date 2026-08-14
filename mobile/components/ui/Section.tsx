/**
 * Section — bloc de contenu titré (P0-2)
 *
 * Standardise l'espacement vertical entre blocs, qui était choisi au cas par cas
 * (`marginTop: 24` ici, `20` là, `16` ailleurs).
 *
 * Le titre passe en casse normale : les capitales espacées à 9-12 px de
 * l'ancienne version (`sectionTitle`) étaient à la fois peu lisibles et trop
 * lourdes visuellement par rapport au contenu qu'elles annonçaient.
 */

import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';
import { Button } from './Button';

export interface SectionProps {
  title?: string;
  /** Précision courte sous le titre. */
  subtitle?: string;
  /** Action secondaire alignée à droite du titre (ex. « Tout voir »). */
  action?: { label: string; onPress: () => void };
  /** Retire le padding horizontal, pour un contenu qui déborde (carrousel). */
  bleed?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Section({
  title,
  subtitle,
  action,
  bleed = false,
  children,
  style,
}: SectionProps) {
  const { theme } = useTheme();

  return (
    <View style={[{ marginTop: theme.space.xxl, gap: theme.space.md }, style]}>
      {(title || action) && (
        <View
          style={[
            styles.header,
            { paddingHorizontal: bleed ? theme.space.lg : 0, gap: theme.space.md },
          ]}
        >
          <View style={styles.headerText}>
            {title ? (
              <Text variant="title" accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="callout" tone="tertiary">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {action ? (
            <Button
              label={action.label}
              onPress={action.onPress}
              variant="ghost"
              size="sm"
              icon="chevron-forward"
              iconAfter
            />
          ) : null}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
});
