/**
 * Icône réglages du header joueur, factorisée pour éviter la divergence entre
 * `(player-tabs)/_layout.tsx` (header des 4 onglets) et `feed/_layout.tsx`
 * (le fil a son propre `Stack` interne, avec son propre header — l'icône n'y
 * apparaissait pas avant, d'où l'extraction).
 *
 * N'est posée que sur les écrans racines : `feed/[postId]` garde son bouton
 * retour natif, pas cette icône.
 */

import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';

export function PlayerSettingsButton() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={{ paddingLeft: 12 }}>
      <Pressable
        onPress={() => router.push('/player-settings')}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Réglages"
        style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="settings-outline" size={22} color={c.text.secondary} />
      </Pressable>
    </View>
  );
}
