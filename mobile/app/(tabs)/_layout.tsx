import { Tabs, useSegments } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { SwitchToPlayerButton, SignOutIconButton } from '../../components/SwitchSpaceButton';

function TabsLayoutContent() {
  const segments = useSegments();
  const isDetailScreen =
    (segments[1] === 'calendar' && segments[2]) ||
    (segments[1] === 'squad' && segments[2]);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#3b82f6' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: '#3b82f6',
        tabBarStyle: { display: isDetailScreen ? 'none' : 'flex' },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SwitchToPlayerButton />
            <SignOutIconButton />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendrier',
          tabBarLabel: 'Calendrier',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="squad"
        options={{
          title: 'Équipe',
          tabBarLabel: 'Équipe',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar/training/[trainingId]"
        options={{ href: null, title: 'Détail entraînement' }}
      />
      <Tabs.Screen
        name="calendar/matchDetail/[matchId]"
        options={{ href: null, title: 'Match' }}
      />
      <Tabs.Screen
        name="calendar/new"
        options={{ href: null, title: 'Nouvel entraînement' }}
      />
      <Tabs.Screen
        name="calendar/new-match"
        options={{ href: null, title: 'Nouveau match' }}
      />
      <Tabs.Screen
        name="squad/[playerId]"
        options={{ href: null, title: 'Détail joueur' }}
      />
      <Tabs.Screen
        name="choose-team"
        options={{
          href: null,
          title: 'Choisir une équipe',
        }}
      />
      <Tabs.Screen
        name="create-club"
        options={{
          href: null,
          title: 'Créer un club',
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  return <TabsLayoutContent />;
}
