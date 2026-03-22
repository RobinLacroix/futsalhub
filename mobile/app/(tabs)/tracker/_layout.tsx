import { Stack } from 'expo-router';
import { useIsTablet } from '../../hooks/useIsTablet';

export default function TrackerLayout() {
  const isTablet = useIsTablet();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="record"
        options={{
          title: 'Enregistrer un match',
          headerShown: !isTablet,
          headerBackTitle: 'Retour',
          headerStyle: { backgroundColor: '#3b82f6' },
          headerTintColor: '#fff',
        }}
      />
    </Stack>
  );
}
