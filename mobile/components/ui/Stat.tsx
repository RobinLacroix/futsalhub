/**
 * Stat — brique de tout KPI (P0-2)
 *
 * C'est le composant le plus important du produit : c'est lui qui porte la
 * promesse « analyse de performance » plutôt que « comptage ».
 *
 * Trois corrections d'audit sont intégrées par construction :
 *
 * 1. **Le chiffre est le héros.** Avant : valeur 22 px / libellé 9 px en
 *    capitales espacées, ce qui donnait plus de poids visuel au libellé qu'à la
 *    donnée. Ici la valeur monte jusqu'à 44 px et le libellé passe en casse
 *    normale à 12-13 px.
 * 2. **Chiffres tabulaires**, pour que les colonnes cessent de trembler.
 * 3. **Référentiel obligatoire disponible** : `delta` (écart à la moyenne ou au
 *    match précédent) et `density` (position du joueur sur l'amplitude de
 *    l'effectif). « 4 buts » n'est pas une analyse ; « 4 buts, +1,8 vs moyenne »
 *    en est une.
 */

import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { deltaColor } from '../../lib/design/tokens';
import { Text } from './Text';

export type StatSize = 'hero' | 'primary' | 'compact';

export interface StatProps {
  /** Valeur affichée, déjà formatée (ex. « 4 », « 2,3 », « 12:40 »). */
  value: string;
  label: string;
  size?: StatSize;
  /** Unité ou suffixe discret accolé à la valeur (ex. « % », « /match »). */
  unit?: string;
  /** Écart signé à la référence. Colorisé et fléché automatiquement. */
  delta?: number;
  /** Précise à quoi l'écart se rapporte (ex. « vs moyenne équipe »). */
  deltaLabel?: string;
  /** Nombre de décimales du delta. */
  deltaPrecision?: number;
  /**
   * Position de la valeur sur l'amplitude de l'effectif, entre 0 et 1.
   * Affiche une barre de densité qui se lit sans lire le chiffre.
   */
  density?: number;
  /** Couleur de la valeur, à alimenter par `dataColor` uniquement. */
  valueColor?: string;
  style?: ViewStyle;
}

export function Stat({
  value,
  label,
  size = 'primary',
  unit,
  delta,
  deltaLabel,
  deltaPrecision = 1,
  density,
  valueColor,
  style,
}: StatProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const valueVariant = size === 'hero' ? 'hero' : size === 'primary' ? 'display' : 'title';
  const labelVariant = size === 'compact' ? 'caption' : 'callout';

  const hasDelta = delta != null && Number.isFinite(delta);
  const dColor = hasDelta ? deltaColor(theme, delta) : c.neutralData;
  const dIcon = !hasDelta || delta === 0 ? 'remove' : delta > 0 ? 'arrow-up' : 'arrow-down';

  const a11y = [
    `${label} : ${value}${unit ?? ''}`,
    hasDelta ? `écart ${delta > 0 ? 'plus' : delta < 0 ? 'moins' : 'nul'} ${Math.abs(delta).toFixed(deltaPrecision)}${deltaLabel ? ` ${deltaLabel}` : ''}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={[{ gap: theme.space.xs }, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={a11y}
    >
      <View style={styles.valueRow}>
        <Text variant={valueVariant} numeric color={valueColor}>
          {value}
        </Text>
        {unit ? (
          <Text variant={size === 'compact' ? 'caption' : 'callout'} tone="tertiary">
            {unit}
          </Text>
        ) : null}
      </View>

      <Text variant={labelVariant} tone="secondary" numberOfLines={2}>
        {label}
      </Text>

      {hasDelta ? (
        <View style={[styles.deltaRow, { gap: theme.space.xs }]}>
          <Ionicons name={dIcon} size={12} color={dColor} />
          <Text variant="caption" numeric color={dColor}>
            {delta > 0 ? '+' : ''}
            {delta.toFixed(deltaPrecision)}
          </Text>
          {deltaLabel ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {deltaLabel}
            </Text>
          ) : null}
        </View>
      ) : null}

      {density != null && Number.isFinite(density) ? (
        <View
          style={[
            styles.densityTrack,
            { backgroundColor: c.bg.sunken, borderRadius: theme.radius.pill },
          ]}
        >
          <View
            style={[
              styles.densityFill,
              {
                width: `${Math.round(Math.min(1, Math.max(0, density)) * 100)}%`,
                backgroundColor: valueColor ?? c.accent.default,
                borderRadius: theme.radius.pill,
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  densityTrack: {
    height: 4,
    width: '100%',
    overflow: 'hidden',
    marginTop: 2,
  },
  densityFill: {
    height: '100%',
  },
});
