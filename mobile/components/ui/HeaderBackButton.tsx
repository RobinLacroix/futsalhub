/**
 * HeaderBackButton / BackLink — retour pour un écran sans navigateur Stack
 * (P0-2 bis)
 *
 * Les écrans de détail de la bibliothèque (et d'autres routes "cachées" de
 * `(tabs)/_layout.tsx`, déclarées comme `Tabs.Screen` individuels avec
 * `href: null`) n'ont pas de bouton retour natif par défaut : contrairement à
 * un `Stack`, un `Tabs` ne pousse pas d'écran avec historique visuel, même si
 * `headerShown` est vrai. `headerLeft` doit donc être fourni explicitement
 * (cf retour de Robin 2026-09-22 : "il manque un bouton retour").
 *
 * Sur tablette, `(tabs)/_layout.tsx` passe `headerShown: false` (mise en page
 * à sidebar, cf TabletSidebar) : `headerLeft` n'a alors aucun effet, il n'y a
 * pas de barre de navigation du tout. `BackLink` est l'équivalent affiché
 * DANS le corps de l'écran, à utiliser avec `useIsTablet()` en complément de
 * `HeaderBackButton` (cf retour de Robin "sur téléphone c'était bon par
 * contre pas sur tablette").
 */

import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { IconButton } from './IconButton';
import { Text } from './Text';

export function HeaderBackButton({ onPress }: { onPress: () => void }) {
  return <IconButton icon="chevron-back" label="Retour" onPress={onPress} />;
}

export function BackLink({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Retour" style={styles.row} hitSlop={8}>
      <Ionicons name="chevron-back" size={18} color={theme.colors.accent.default} />
      <Text variant="callout" weight="600" tone="accent">
        Retour
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: 12 },
});
