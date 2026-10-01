/**
 * Analyse équipe — espace joueur.
 *
 * Écran poussé, pas un onglet (même famille que `player-settings.tsx` /
 * `join-club.tsx`) : header natif désactivé globalement (`app/_layout.tsx`),
 * donc back row manuel.
 */
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { Screen, Text } from '../components/ui';
import { PlayerTeamAnalyticsView } from '../components/PlayerTeamAnalyticsView';

export default function PlayerTeamAnalyticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Screen edgeTop>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          paddingTop: insets.top ? 0 : theme.space.sm,
          paddingBottom: theme.space.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={({ pressed }) => [{ padding: 4, marginLeft: -4 }, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={c.text.secondary} />
        </Pressable>
        <Text variant="title">Analyse équipe</Text>
      </View>

      <PlayerTeamAnalyticsView />
    </Screen>
  );
}
