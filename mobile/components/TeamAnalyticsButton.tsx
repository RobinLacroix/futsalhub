/**
 * Icône « Analyse équipe » du header de l'onglet Ma fiche (espace joueur).
 * Même format que PlayerSettingsButton.tsx, posée en headerRight sur ce seul
 * onglet (le headerLeft, lui, est global aux 4 onglets).
 */
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';

export function TeamAnalyticsButton() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={{ paddingRight: 12 }}>
      <Pressable
        onPress={() => router.push('/player-team-analytics')}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Analyse équipe"
        style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="bar-chart-outline" size={22} color={c.text.secondary} />
      </Pressable>
    </View>
  );
}
