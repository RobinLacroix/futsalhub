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

/**
 * ## Le header n'est masqué que sur la racine
 *
 * `headerShown: !isTablet` valait pour tout le Stack : sur iPad, « Nouveau
 * joueur », « Importer un effectif » et la fiche joueur s'ouvraient sans titre
 * et sans retour. Une racine masque son header sur tablette (la sidebar et la
 * barre d'actions de `squad/index` prennent le relais) ; un écran empilé le
 * garde, c'est lui qui porte le titre et le retour.
 *
 * `season-planning` reste l'exception : il dessine son propre bandeau complet,
 * sur téléphone comme sur tablette.
 */
export default function SquadLayout() {
  const isTablet = useIsTablet();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
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
          headerShown: !isTablet,
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
