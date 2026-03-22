import { Stack } from 'expo-router';

export default function TeamsLayout() {
  return (
    <Stack
      screenOptions={{
        title: 'Équipes du club',
        headerShown: true,
        headerBackTitle: 'Retour',
        headerStyle: { backgroundColor: '#3b82f6' },
        headerTintColor: '#fff',
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
