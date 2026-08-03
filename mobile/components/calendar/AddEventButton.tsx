/**
 * AddEventButton — création d'un entraînement ou d'un match (P0-7)
 *
 * Ce contrôle vit à **deux endroits selon la plateforme**, parce que les Stack
 * du calendrier et de l'effectif sont montés avec `headerShown: !isTablet` :
 *
 *   - iPhone : dans le `headerRight` du Stack (`calendar/_layout`).
 *   - iPad   : dans le panneau mois de l'écran, puisqu'il n'y a pas de header.
 *
 * Ils étaient auparavant écrits deux fois, avec deux modales distinctes. Une
 * seule des deux a survécu à la migration du 2026-08-03, ce qui a supprimé
 * la création d'événement sur iPad. Le composant est donc unique et partagé :
 * les deux emplacements ne peuvent plus diverger ni disparaître séparément.
 */

import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { IconButton, Button, Sheet, Text } from '../ui';
import { eventCategoryStyle } from './eventCategory';

export interface AddEventButtonProps {
  /** `icon` pour un headerRight, `labelled` quand la place le permet (iPad). */
  variant?: 'icon' | 'labelled';
  style?: ViewStyle;
}

export function AddEventButton({ variant = 'icon', style }: AddEventButtonProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const c = theme.colors;

  const go = (path: string) => {
    setOpen(false);
    router.push(path as never);
  };

  const options = [
    {
      key: 'training' as const,
      hint: 'Thème, procédés, convocations',
      path: '/(tabs)/calendar/new',
      ...eventCategoryStyle('training', c),
    },
    {
      key: 'match' as const,
      hint: 'Adversaire, compétition, score',
      path: '/(tabs)/calendar/new-match',
      ...eventCategoryStyle('match', c),
    },
  ];

  return (
    <>
      {variant === 'labelled' ? (
        <Button
          label="Ajouter"
          icon="add"
          size="sm"
          onPress={() => setOpen(true)}
          style={style}
          accessibilityHint="Créer un entraînement ou un match"
        />
      ) : (
        <IconButton
          icon="add"
          label="Ajouter un événement"
          onPress={() => setOpen(true)}
          variant="accent"
          style={style}
        />
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Ajouter au calendrier">
        {options.map((o) => (
          <Pressable
            key={o.key}
            onPress={() => go(o.path)}
            accessibilityRole="button"
            accessibilityLabel={`${o.label}. ${o.hint}`}
            style={({ pressed }) => [
              styles.optionRow,
              {
                borderRadius: theme.radius.md,
                backgroundColor: pressed ? c.bg.sunken : 'transparent',
              },
            ]}
          >
            <View
              style={[
                styles.optionIcon,
                { backgroundColor: c.bg.sunken, borderRadius: theme.radius.sm },
              ]}
            >
              <Ionicons name={o.icon} size={20} color={o.color} />
            </View>
            <View style={styles.optionText}>
              <Text variant="headline">{o.label}</Text>
              <Text variant="callout" tone="tertiary">
                {o.hint}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  optionIcon: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  optionText: { flex: 1, gap: 2 },
});
