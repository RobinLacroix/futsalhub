import { Stack } from 'expo-router';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { PhoneNavMenu } from '../../../components/PhoneNavMenu';

export default function TrackerLayout() {
  const isTablet = useIsTablet();
  return (
    <Stack
      screenOptions={{
        headerShown: isTablet ? false : true,
        headerStyle: { backgroundColor: '#3b82f6' },
        headerTintColor: '#fff',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Tracker',
          headerLeft: isTablet ? undefined : () => <PhoneNavMenu />,
        }}
      />
      <Stack.Screen
        name="record"
        options={{
          title: 'Enregistrer un match',
          headerShown: !isTablet,
          headerBackTitle: 'Retour',
        }}
      />
    </Stack>
  );
}
