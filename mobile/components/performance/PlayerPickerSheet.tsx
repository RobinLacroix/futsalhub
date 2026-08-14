/**
 * Sélecteur de joueur pour la charge individuelle — onglet Performance.
 *
 * Un effectif dépasse vite la douzaine de noms : trop pour un `ChipGroup`
 * horizontal, qui n'existe nulle part ailleurs dans l'app pour choisir UN
 * élément dans une liste longue (voir `TestPickerSheet`, même raisonnement
 * pour les 13 tests physiques). Une feuille avec une ligne par joueur est le
 * patron déjà en place.
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet } from '../ui';
import { PlayerIdentity } from '../players/PlayerIdentity';
import { haptics } from '../../lib/design/haptics';
import type { Player } from '../../types';

export interface PlayerPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  players: Player[];
  selectedId: string | null;
  onSelect: (playerId: string) => void;
}

export function PlayerPickerSheet({
  visible,
  onClose,
  players,
  selectedId,
  onSelect,
}: PlayerPickerSheetProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Sheet visible={visible} onClose={onClose} title="Choisir un joueur">
      {players.map((player) => {
        const isSelected = player.id === selectedId;
        return (
          <Pressable
            key={player.id}
            onPress={() => {
              haptics.select();
              onSelect(player.id);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${player.first_name} ${player.last_name}`}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: isSelected ? c.accent.subtle : c.bg.surface,
                borderColor: isSelected ? c.accent.default : c.border.subtle,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.space.lg,
                paddingVertical: theme.space.md,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <PlayerIdentity
              firstName={player.first_name}
              lastName={player.last_name}
              number={player.number}
            />
            {isSelected && <Ionicons name="checkmark-circle" size={20} color={c.accent.default} />}
          </Pressable>
        );
      })}
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
});
