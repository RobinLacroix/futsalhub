/**
 * Sélecteur de thème (P0-1).
 *
 * Segmented control à trois positions : Système / Clair / Sombre.
 * À placer dans les Paramètres coach ET dans le profil joueur : les deux
 * espaces partagent le même `ThemeProvider`, donc la même préférence.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';

const OPTIONS: { mode: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'system', label: 'Système', icon: 'phone-portrait-outline' },
  { mode: 'light', label: 'Clair', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Sombre', icon: 'moon-outline' },
];

export function ThemeSwitcher() {
  const { theme, mode, setMode } = useTheme();
  const t = theme.colors;

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: t.bg.sunken,
          borderRadius: theme.radius.md,
          borderColor: t.border.subtle,
          padding: theme.space.xs,
          gap: theme.space.xs,
        },
      ]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Apparence de l'application"
    >
      {OPTIONS.map((opt) => {
        const selected = mode === opt.mode;
        return (
          <Pressable
            key={opt.mode}
            onPress={() => void setMode(opt.mode)}
            hitSlop={hitSlopFor(HIT_SLOP_MIN)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`Thème ${opt.label}`}
            style={({ pressed }) => [
              styles.segment,
              {
                borderRadius: theme.radius.sm,
                paddingVertical: theme.space.sm,
                gap: theme.space.xs,
                backgroundColor: selected
                  ? t.accent.subtle
                  : pressed
                    ? t.bg.surface
                    : 'transparent',
                borderColor: selected ? t.accent.border : 'transparent',
              },
            ]}
          >
            <Ionicons
              name={opt.icon}
              size={18}
              color={selected ? t.accent.default : t.text.tertiary}
            />
            <Text
              style={[
                theme.typography.caption,
                { color: selected ? t.accent.default : t.text.secondary },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Comble l'écart entre la boîte visuelle et la cible tactile minimale HIG. */
function hitSlopFor(min: number) {
  const pad = Math.max(0, Math.round((min - 36) / 2));
  return { top: pad, bottom: pad, left: 0, right: 0 };
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
