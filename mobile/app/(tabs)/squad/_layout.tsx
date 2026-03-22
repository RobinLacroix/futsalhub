import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { PhoneNavMenu } from '../../../components/PhoneNavMenu';

function HeaderAddButton() {
  const router = useRouter();
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
          headerLeft: isTablet ? undefined : () => <PhoneNavMenu />,
          headerRight: () => <HeaderAddButton />,
        }}
      />
      <Stack.Screen name="new-player" options={{ title: 'Nouveau joueur' }} />
      <Stack.Screen name="[playerId]" options={{ title: 'Joueur' }} />
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
});
