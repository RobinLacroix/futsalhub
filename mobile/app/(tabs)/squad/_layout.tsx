import { Stack, useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { useTheme } from '../../../contexts/ThemeContext';
import { SeasonHeaderButton } from '../../../components/SeasonHeaderButton';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { IconButton } from '../../../components/ui';

/** Équipe non rattachée = lecture seule : les deux actions disparaissent. */
function HeaderActions() {
  const router = useRouter();
  const { canEditActiveTeam } = useActiveTeam();
  if (!canEditActiveTeam) return null;
  return (
    <>
      <IconButton
        icon="cloud-upload-outline"
        label="Importer un effectif"
        onPress={() => router.push('/(tabs)/squad/import-players')}
      />
      <IconButton
        icon="add"
        label="Ajouter un joueur"
        onPress={() => router.push('/(tabs)/squad/new-player')}
        variant="accent"
      />
    </>
  );
}

export default function SquadLayout() {
  const isTablet = useIsTablet();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Stack
      screenOptions={{
        headerShown: !isTablet,
        headerStyle: { backgroundColor: c.bg.canvas },
        headerShadowVisible: false,
        headerTintColor: c.text.primary,
        headerTitleStyle: { color: c.text.primary, fontWeight: '600', fontSize: 18 },
        contentStyle: { backgroundColor: c.bg.canvas },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Équipe',
          headerRight: () => (
            <View style={styles.headerRight}>
              <SeasonHeaderButton />
              <HeaderActions />
            </View>
          ),
        }}
      />
      <Stack.Screen name="new-player" options={{ title: 'Nouveau joueur' }} />
      <Stack.Screen name="import-players" options={{ title: 'Importer un effectif' }} />
      <Stack.Screen name="[playerId]" options={{ title: 'Joueur' }} />
      <Stack.Screen name="season-planning" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 4 },
});
