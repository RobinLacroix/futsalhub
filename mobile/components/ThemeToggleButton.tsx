/**
 * ThemeToggleButton — bascule clair / sombre des barres de navigation
 *
 * ## Pourquoi un second sélecteur de thème
 *
 * `components/ui/ThemeSwitcher` existe déjà, mais c'est un segmented control
 * pleine largeur à trois positions, fait pour une page de réglages. L'espace
 * joueur n'en a pas : quatre onglets, aucun écran de paramètres. Un joueur qui
 * n'est pas coach n'a donc aucun chemin vers le réglage.
 *
 * D'où cette version compacte, posée dans le header, à la place du sélecteur de
 * saison — inutile côté joueur, qui ne consulte jamais que la saison en cours.
 *
 * ## Deux positions, pas trois
 *
 * `ThemeMode` compte un mode `system`. Il n'est pas proposé ici : un choix
 * explicite est ce qu'on attend d'un bouton posé dans une barre de navigation,
 * et une troisième position dans 66 pt de large ne serait plus lisible. Le mode
 * reste accessible depuis l'espace coach (`(tabs)/plus`).
 *
 * Conséquence assumée : toucher ce bouton quitte le suivi du système. C'est le
 * sens du geste.
 *
 * ## Les deux options sont visibles
 *
 * Une icône unique qui change au clic pose toujours la même ambiguïté : montre-
 * t-elle l'état courant ou l'action à venir ? Les deux options sont donc
 * affichées côte à côte, celle en cours remplie. Il n'y a rien à deviner.
 *
 * Le segment actif suit `isDark`, l'état *résolu* — pas `mode`. Sous `system`,
 * c'est la seule façon que le bouton dise la vérité de ce qui est à l'écran.
 */

import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../lib/design/tokens';
import { haptics } from '../lib/design/haptics';

const PILL_HEIGHT = 30;
const SLOP = Math.max(0, Math.round((HIT_SLOP_MIN - PILL_HEIGHT) / 2));

export interface ThemeToggleButtonProps {
  style?: ViewStyle;
}

export function ThemeToggleButton({ style }: ThemeToggleButtonProps) {
  const { theme, isDark, setMode } = useTheme();
  const c = theme.colors;

  const select = (dark: boolean) => {
    if (dark === isDark) return;
    haptics.select();
    void setMode(dark ? 'dark' : 'light');
  };

  const segment = (dark: boolean) => {
    const active = dark === isDark;
    return (
      <Pressable
        key={dark ? 'dark' : 'light'}
        onPress={() => select(dark)}
        hitSlop={{ top: SLOP, bottom: SLOP, left: 0, right: 0 }}
        accessibilityRole="radio"
        accessibilityState={{ selected: active, checked: active }}
        accessibilityLabel={dark ? 'Thème sombre' : 'Thème clair'}
        style={({ pressed }) => [
          styles.segment,
          {
            borderRadius: theme.radius.pill,
            backgroundColor: active ? c.accent.subtle : 'transparent',
          },
          pressed && !active && styles.pressed,
        ]}
      >
        <Ionicons
          name={dark ? 'moon' : 'sunny'}
          size={15}
          color={active ? c.accent.default : c.text.tertiary}
        />
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.track,
        {
          borderRadius: theme.radius.pill,
          backgroundColor: c.bg.sunken,
          borderColor: c.border.subtle,
        },
        style,
      ]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Apparence de l'application"
    >
      {segment(false)}
      {segment(true)}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    height: PILL_HEIGHT,
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    width: 32,
    height: PILL_HEIGHT - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
