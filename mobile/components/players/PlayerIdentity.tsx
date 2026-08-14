/**
 * PlayerIdentity — pastille de dossard + nom (P0-7)
 *
 * Le même bloc était réécrit dans six fichiers, avec trois couleurs de pastille
 * différentes selon l'écran (`#dc2626` sur le match, `#3b82f6` sur
 * l'entraînement, `#1e3a5f` sur la fiche joueur) : le dossard d'un joueur
 * changeait de couleur selon l'endroit où on le regardait.
 *
 * La pastille est neutre par défaut et ne prend l'accent que lorsqu'elle porte
 * un état (convoqué). Un numéro de maillot n'est pas une alerte.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui';

export interface PlayerIdentityProps {
  firstName: string;
  lastName: string;
  number?: number | null;
  /** Met la pastille en avant (joueur retenu / convoqué). */
  highlighted?: boolean;
  /** Grise le nom (joueur non retenu). */
  muted?: boolean;
  style?: ViewStyle;
}

const BADGE = 30;

export function PlayerIdentity({
  firstName,
  lastName,
  number,
  highlighted = false,
  muted = false,
  style,
}: PlayerIdentityProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={[styles.row, { gap: theme.space.md }, style]}>
      <View
        style={[
          styles.badge,
          {
            backgroundColor: highlighted ? c.accent.fill : c.bg.sunken,
            borderColor: highlighted ? c.accent.fill : c.border.subtle,
          },
        ]}
      >
        {number != null ? (
          <Text
            variant="caption"
            tone={highlighted ? 'onFill' : 'secondary'}
            weight="700"
            numeric
          >
            {number}
          </Text>
        ) : (
          <Text variant="caption" tone="tertiary" weight="700">
            {(lastName || firstName || '?').charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <Text
        variant="body"
        tone={muted ? 'tertiary' : 'primary'}
        weight="600"
        numberOfLines={1}
        style={styles.name}
      >
        {firstName} {lastName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1 },
});
