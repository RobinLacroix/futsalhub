import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { SeasonHeaderButton } from '../../../components/SeasonHeaderButton';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';

function HeaderAddButton() {
  const router = useRouter();
  const { canEditActiveTeam } = useActiveTeam();
  if (!canEditActiveTeam) return null; // lecture seule : équipe non rattachée
  return (
    <TouchableOpacity
      style={styles.addButton}
      onPress={() => router.push('/(tabs)/squad/new-player')}
      activeOpacity={0.8}
    >
      <Text style={styles.addButtonText}>+</Text>
    </TouchableOpacity>
  );
}

function HeaderImportButton() {
  const router = useRouter();
  const { canEditActiveTeam } = useActiveTeam();
  if (!canEditActiveTeam) return null; // lecture seule : équipe non rattachée
  return (
    <TouchableOpacity
      style={styles.importButton}
      onPress={() => router.push('/(tabs)/squad/import-players')}
      activeOpacity={0.8}
    >
      <Ionicons name="cloud-upload-outline" size={19} color="#fff" />
    </TouchableOpacity>
  );
}

export default function SquadLayout() {
  const isTablet = useIsTablet();
  return (
    <Stack
      screenOptions={{
        headerShown: !isTablet,
        headerStyle: { backgroundColor: '#3b82f6' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Équipe',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* Header bleu non migré : ton `onColor` obligatoire ici. */}
              <SeasonHeaderButton tone="onColor" style={{ marginRight: 8 }} />
              <HeaderImportButton />
              <HeaderAddButton />
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
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addButtonText: { color: '#fff', fontSize: 22, fontWeight: '600', lineHeight: 24 },
  importButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
});
