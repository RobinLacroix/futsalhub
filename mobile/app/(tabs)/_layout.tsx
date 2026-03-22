import { useState } from 'react';
import { Tabs, useSegments } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { useIsTablet } from '../../hooks/useIsTablet';
import { TabletSidebar } from '../../components/TabletSidebar';
import { SwitchToPlayerButton, SignOutIconButton } from '../../components/SwitchSpaceButton';

function TabsLayoutContent() {
  const segments = useSegments();
  const isTablet = useIsTablet();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const isDetailScreen =
    (segments[1] === 'calendar' && segments[2]) ||
    (segments[1] === 'squad' && segments[2]) ||
    (segments[1] === 'tracker' && segments[2] === 'record');
  const hideTabBar = isDetailScreen || isTablet;

  const tabScreenOptions = {
    headerStyle: { backgroundColor: '#3b82f6' },
    headerTintColor: '#fff',
    tabBarActiveTintColor: '#3b82f6',
    tabBarStyle: { display: hideTabBar ? 'none' : 'flex' },
    headerShown: isTablet ? false : true,
    headerRight: isTablet ? undefined : () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SwitchToPlayerButton />
        <SignOutIconButton />
      </View>
    ),
  };

  const content = (
    <Tabs
      screenOptions={tabScreenOptions}
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
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tracker"
        options={{
          title: 'Tracker',
          tabBarLabel: 'Tracker',
          headerShown: !isTablet,
          href: isTablet ? '/(tabs)/tracker' : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tracker/record"
        options={{ href: null, title: 'Enregistrer un match' }}
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

  if (isTablet) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <TabletSidebar
          isExpanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded((v) => !v)}
        />
        <View style={{ flex: 1 }}>{content}</View>
      </View>
    );
  }

  return content;
}

export default function TabsLayout() {
  return <TabsLayoutContent />;
}
