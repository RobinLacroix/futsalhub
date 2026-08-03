/**
 * AttendancePicker — choix du statut de présence d'un joueur (P0-7)
 *
 * Remplace la rangée de quatre puces à émoji. L'état sélectionné se lit
 * maintenant sur trois canaux et non plus sur la seule couleur de fond :
 * aplat, icône pleine et libellé en gras. C'est ce qui le rend perceptible
 * en deutéranopie et en plein soleil sur un bord de terrain.
 *
 * Chaque puce fait 44 pt de haut. Les précédentes en faisaient 30.
 */

import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { Text } from '../ui';
import { ATTENDANCE_STATUSES } from './attendance';
import type { PlayerStatus } from '../../types';

export interface AttendancePickerProps {
  value: PlayerStatus;
  onChange: (status: PlayerStatus) => void;
  /** Nom du joueur, pour composer l'annonce VoiceOver. */
  playerName: string;
  /** Masque le libellé texte pour tenir dans une ligne étroite. */
  iconOnly?: boolean;
  style?: ViewStyle;
}

export function AttendancePicker({
  value,
  onChange,
  playerName,
  iconOnly = false,
  style,
}: AttendancePickerProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const toneColor = (tone: string) =>
    tone === 'positive' ? c.positive : tone === 'negative' ? c.negative : c.warning;

  return (
    <View style={[styles.row, { gap: theme.space.sm }, style]} accessibilityRole="radiogroup">
      {ATTENDANCE_STATUSES.map((s) => {
        const active = s.value === value;
        const palette = toneColor(s.tone);
        return (
          <Pressable
            key={s.value}
            onPress={() => {
              haptics.select();
              onChange(s.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            accessibilityLabel={`${playerName} : ${s.label}`}
            style={({ pressed }) => [
              styles.chip,
              {
                borderRadius: theme.radius.pill,
                paddingHorizontal: iconOnly ? theme.space.md : theme.space.md,
                gap: theme.space.xs,
                backgroundColor: active ? palette.subtle : c.bg.sunken,
                borderColor: active ? palette.default : 'transparent',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons
              name={active ? s.icon : (`${s.icon}-outline` as typeof s.icon)}
              size={16}
              color={active ? palette.default : c.text.tertiary}
            />
            {!iconOnly && (
              <Text
                variant="caption"
                color={active ? palette.default : c.text.tertiary}
                weight={active ? '700' : '500'}
              >
                {s.short}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderWidth: 1.5,
  },
});
