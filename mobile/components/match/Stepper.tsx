/**
 * Stepper — incrément / décrément d'une valeur entière (P0-7)
 *
 * Contrôle le plus pressé de l'écran de match : jusqu'à quatre par ligne de
 * joueur, plus huit dans le tableau des types de buts. Il était aussi le plus
 * mal dimensionné.
 *
 * Ce qui est corrigé :
 *
 * 1. **Cible tactile.** 32 pt sur iPad, **26 pt sur iPhone** — très en dessous
 *    des 44 pt HIG, sur le geste le plus répété de l'app. Le carré visible reste
 *    compact pour tenir dans la ligne, mais le `hitSlop` porte la zone réelle
 *    à 44 pt.
 *
 * 2. **Accessibilité.** Les boutons annonçaient « moins » et « plus » sans
 *    contexte : sur une liste de 18 joueurs à quatre steppers chacun, VoiceOver
 *    lisait 72 boutons indistinguables. `label` est obligatoire au niveau du
 *    type et compose l'annonce complète.
 *
 * 3. **Butée basse muette.** `Math.max(0, …)` était appliqué en silence : on
 *    pouvait taper « − » indéfiniment sans rien voir. Le bouton se désactive
 *    visiblement quand la butée est atteinte.
 *
 * 4. **Les 30 erreurs `tsc` de l'écran.** Elles venaient toutes d'un même
 *    `as const` sur des tableaux de styles (`readonly [...]` n'est pas un
 *    `StyleProp`). En sortant le contrôle dans un composant, le tableau de
 *    styles disparaît.
 */

import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { Text } from '../ui';

export interface StepperProps {
  value: number;
  onChange: (delta: number) => void;
  /** Annoncé par VoiceOver, ex. « Buts de Jean Dupont ». Obligatoire. */
  label: string;
  /** Libellé visible au-dessus du contrôle. */
  caption?: string;
  min?: number;
  max?: number;
  compact?: boolean;
  style?: ViewStyle;
}

export function Stepper({
  value,
  onChange,
  label,
  caption,
  min = 0,
  max,
  compact = false,
  style,
}: StepperProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const box = compact ? 30 : 34;
  const slop = Math.max(0, Math.round((HIT_SLOP_MIN - box) / 2));
  const atMin = value <= min;
  const atMax = max != null && value >= max;

  const step = (delta: number, blocked: boolean) => {
    if (blocked) {
      haptics.warning();
      return;
    }
    haptics.tapLight();
    onChange(delta);
  };

  const button = (delta: -1 | 1, blocked: boolean) => (
    <Pressable
      onPress={() => step(delta, blocked)}
      disabled={blocked}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      accessibilityLabel={`${delta > 0 ? 'Augmenter' : 'Diminuer'} ${label}`}
      style={({ pressed }) => [
        styles.btn,
        {
          width: box,
          height: box,
          borderRadius: theme.radius.sm,
          backgroundColor: blocked ? c.bg.sunken : c.accent.subtle,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Ionicons
        name={delta > 0 ? 'add' : 'remove'}
        size={compact ? 16 : 18}
        color={blocked ? c.text.tertiary : c.accent.default}
      />
    </Pressable>
  );

  return (
    <View style={[styles.wrap, style]}>
      {caption ? (
        <Text variant="caption" tone="tertiary">
          {caption}
        </Text>
      ) : null}
      <View style={styles.row} accessibilityLabel={`${label} : ${value}`}>
        {button(-1, atMin)}
        <Text variant="headline" numeric style={styles.value}>
          {value}
        </Text>
        {button(1, atMax)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btn: { justifyContent: 'center', alignItems: 'center' },
  value: { minWidth: 26, textAlign: 'center' },
});
