/**
 * Sélecteur de test physique, groupé par catégorie.
 *
 * Treize tests au catalogue système : trop pour un `ChipGroup` horizontal, qui
 * obligerait à faire défiler à l'aveugle pour trouver « 30-15 IFT ». Une feuille
 * groupée par catégorie donne la carte complète d'un coup d'oeil.
 *
 * Chaque entrée annonce son sens de lecture (« plus bas = mieux »). C'est la
 * seule information dont le coach a besoin au moment de choisir, et c'est celle
 * qui manque partout ailleurs : sans elle, personne ne sait si un catalogue
 * mélange des chronos et des hauteurs.
 */

import React, { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Sheet } from '../ui';
import { haptics } from '../../lib/design/haptics';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  sortTestTypes,
  type PhysicalTestCategory,
  type PhysicalTestDirection,
  type PhysicalTestType,
} from '../../lib/physicalTests';

export interface TestPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  types: PhysicalTestType[];
  selectedId: string | null;
  onSelect: (type: PhysicalTestType) => void;
  /** Nombre de joueurs saisis par test, pour marquer ceux déjà traités. */
  filledCountByType?: Record<string, number>;
}

/** Sens de lecture, en clair. Une métrique neutre n'a pas de « meilleur ». */
function directionHint(direction: PhysicalTestDirection): string | null {
  switch (direction) {
    case 'lower_is_better':
      return 'plus bas = mieux';
    case 'higher_is_better':
      return 'plus haut = mieux';
    default:
      return null;
  }
}

export function TestPickerSheet({
  visible,
  onClose,
  types,
  selectedId,
  onSelect,
  filledCountByType = {},
}: TestPickerSheetProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const grouped = useMemo(() => {
    const sorted = sortTestTypes(types);
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: sorted.filter((t) => t.category === category),
    })).filter((group) => group.items.length > 0);
  }, [types]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Choisir un test">
      <View style={{ gap: theme.space.xl }}>
        {grouped.map((group) => (
          <View key={group.category} style={{ gap: theme.space.xs }}>
            <Text variant="caption" tone="tertiary" weight="600">
              {CATEGORY_LABELS[group.category as PhysicalTestCategory].toUpperCase()}
            </Text>

            {group.items.map((type) => {
              const isSelected = type.id === selectedId;
              const filled = filledCountByType[type.id] ?? 0;
              const hint = directionHint(type.direction);

              return (
                <Pressable
                  key={type.id}
                  onPress={() => {
                    haptics.select();
                    onSelect(type);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={
                    `${type.label}, en ${type.unit}` +
                    (hint ? `, ${hint}` : '') +
                    (filled > 0 ? `, ${filled} joueurs saisis` : '')
                  }
                  style={({ pressed }) => [
                    styles.item,
                    {
                      backgroundColor: isSelected ? c.accent.subtle : c.bg.surface,
                      borderColor: isSelected ? c.accent.default : c.border.subtle,
                      borderRadius: theme.radius.md,
                      paddingHorizontal: theme.space.lg,
                      paddingVertical: theme.space.md,
                      gap: theme.space.md,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <View style={styles.itemText}>
                    <Text variant="body" weight="600">
                      {type.label}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {type.unit}
                      {hint ? ` · ${hint}` : ''}
                      {type.attempts > 1 ? ` · ${type.attempts} essais` : ''}
                    </Text>
                  </View>

                  {filled > 0 && (
                    <Text variant="caption" tone="accent" numeric>
                      {filled}
                    </Text>
                  )}
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={c.accent.default} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 48,
  },
  itemText: { flex: 1, minWidth: 0 },
});
